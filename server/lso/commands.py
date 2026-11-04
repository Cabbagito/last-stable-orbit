"""Turn a client intent into events: authorize, validate, then describe the change.

Nothing here touches the database or the network, so every rule is easy to test.
"""

from __future__ import annotations

import math
import random

from . import rules
from .auth import Viewer
from .content import Content
from .models import CAMERAS, COUNT_MAX, DIE_SIDES, ENTROPY_MAX, HP_MAX, SETUPS, STATS, GameState, InvEntry, RollState, TokenState
from .state import state_from_preset
from .views import viewer_map

Events = list[tuple[str, dict]]
COORD_LIMIT = 500.0  # world units; far beyond any map, just stops garbage
SESSION_ENTROPY = 2  # what "New session" sets everyone's Entropy to

# The sweeper, for a roller whose laptop sleeps or whose tab closes mid-roll:
REVEAL_AFTER = 45.0  # everyone sees the result even if the roller's screen never got there (6 exploding dice with every gate held run about 40 s)
OFFLINE_CLOSE_AFTER = 30.0  # a roll this old whose roller has gone away is closed
STALE_CLOSE_AFTER = 600.0  # nothing stays open longer than this

# A film starts this long after the GM presses Play, at one moment on every screen that plays it. The TV has
# every film already; laptops fetch theirs when the cue fires, so they get longer.
FILM_LEAD = {"tv": 1.5, "notv": 3.0, "online": 3.0}


class CommandError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code  # "forbidden" | "invalid"


def _forbid(msg: str) -> CommandError:
    return CommandError("forbidden", msg)


def _invalid(msg: str) -> CommandError:
    return CommandError("invalid", msg)


def _vec3(raw) -> tuple[float, float, float]:
    try:
        x, y, z = (float(v) for v in raw)
    except (TypeError, ValueError):
        raise _invalid("at must be [X, Y, Z]") from None
    if not all(math.isfinite(v) and abs(v) <= COORD_LIMIT for v in (x, y, z)):
        raise _invalid("at is out of range")
    return (round(x, 3), round(y, 3), round(z, 3))


def _str(args: dict, key: str) -> str:
    v = args.get(key)
    if not isinstance(v, str) or not v:
        raise _invalid(f"{key} is required")
    return v


def can_move(viewer: Viewer, state: GameState, token_id: str) -> bool:
    t = state.tokens.get(token_id)
    if t is None:
        return False
    if viewer.is_gm:
        return True
    return t.kind == "crew" and t.ref == viewer.char and not t.hidden


def check_drag(viewer: Viewer, state: GameState, args: dict) -> tuple[str, tuple[float, float, float]]:
    """A live drag frame: relayed to others, never logged."""
    token = _str(args, "token")
    if not can_move(viewer, state, token):
        raise _forbid("you can't move that token")
    return token, _vec3(args.get("at"))


def _int(args: dict, key: str) -> int:
    v = args.get(key)
    if not isinstance(v, int) or isinstance(v, bool):
        raise _invalid(f"{key} must be a whole number")
    return v


def _stat(args: dict) -> str:
    stat = _str(args, "stat")
    if stat not in STATS:
        raise _invalid(f"stat must be one of {', '.join(STATS)}")
    return stat


def _the_roll(viewer: Viewer, state: GameState, args: dict, gm_too: bool) -> RollState:
    roll_id = _str(args, "roll")
    r = next((r for r in state.rolls if r.id == roll_id), None)
    if r is None:
        raise _invalid("unknown roll")
    if r.by != viewer.seat and not (gm_too and viewer.is_gm):
        raise _forbid("that's someone else's roll")
    return r


def _new_roll(state: GameState, content: Content, rng, now: float, **fields) -> Events:
    """Roll the dice. A seat has one roll open at a time, so a new one closes the last."""
    dice = rules.roll_dice(fields["sides"], rng)
    roll = RollState(
        id=f"r{state.seq + 1}",
        dice=dice,
        seed=rng.randrange(2**31),
        insult=rules.pick_insult(fields["stat"], content.insults, rng) if rules.is_nat1(dice) else None,
        started=now,
        **fields,
    )
    events: Events = [("roll.closed", {"roll": r.id}) for r in state.rolls if r.open and r.by == roll.by]
    events.append(("roll.started", {"roll": roll.model_dump()}))
    return events


def _roll_intent(viewer: Viewer, state: GameState, content: Content, kind: str, args: dict, rng, now: float) -> Events:
    if kind == "roll.start":
        if viewer.is_gm:
            raise _invalid("the GM rolls with gm.roll.start")
        char = content.characters[viewer.char]
        stat = _stat(args)
        entry = args.get("entry")
        if entry is not None and (not isinstance(entry, int) or isinstance(entry, bool) or not 0 <= entry < len(char.entries)):
            raise _invalid("entry must be the index of one of your skills or chrome")
        sides, bonus = rules.effective_die(char.stats[stat], entry is not None)
        return _new_roll(
            state, content, rng, now,
            by=viewer.seat, char=char.id, handle=char.id, stat=stat,
            entry=char.entries[entry].name if entry is not None else None, sides=sides, bonus=bonus,
        )

    if kind == "roll.reveal":
        r = _the_roll(viewer, state, args, gm_too=False)
        shown = min(_int(args, "shown"), len(r.dice))
        if not r.open or shown <= r.shown:
            return []
        return [("roll.revealed", {"roll": r.id, "shown": shown})]

    if kind == "roll.push":
        r = _the_roll(viewer, state, args, gm_too=False)
        if not r.open:
            raise _invalid("that roll is over")
        if r.char is None:
            raise _invalid("only crew rolls can be pushed")
        v = state.vitals.get(r.char)
        hp, entropy = (v.hp, v.entropy) if v else (HP_MAX, 2)
        if why := rules.push_refusal(r.dice, r.pushes, entropy):
            raise _invalid(why)
        return [
            ("roll.pushed", {"roll": r.id, "gain": rules.push_gain(r.dice)}),
            ("vitals.set", {"char": r.char, "hp": hp, "entropy": entropy - rules.PUSH_COST}),
        ]

    if kind == "roll.close":
        r = _the_roll(viewer, state, args, gm_too=True)
        return [("roll.closed", {"roll": r.id})] if r.open else []

    raise _invalid(f"unknown intent {kind!r}")


def _gm_roll(state: GameState, content: Content, args: dict, rng, now: float) -> Events:
    """An NPC rolls the die on its sheet for a stat. "Just a die" is only a die, with no stat, and always hidden."""
    token = args.get("token")
    if token is None:
        sides = _int(args, "sides")
        if sides not in DIE_SIDES:
            raise _invalid(f"sides must be one of {DIE_SIDES}")
        # no token to sit on, so nobody else could see it: GM only
        return _new_roll(state, content, rng, now, by="gm", token=None, handle="gm", stat=None, sides=sides, hidden=True)
    stat = _stat(args)
    if not isinstance(token, str):
        raise _invalid("token must be a token id or null")
    t = state.tokens.get(token)
    if t is None or t.kind != "npc":
        raise _invalid("the GM rolls for NPC tokens")
    if "sides" in args:
        raise _invalid("an NPC rolls the die on its sheet: send the stat, not sides")
    hidden = bool(args.get("hidden", False))
    if t.hidden and not hidden:
        raise _invalid("that token is hidden from players: make the roll hidden, or show the token first")
    sides = content.npcs[t.ref].stats[stat]
    return _new_roll(state, content, rng, now, by="gm", token=token, handle=t.ref, stat=stat, sides=sides, hidden=hidden)


def _holder(content: Content, args: dict, key: str = "holder") -> str:
    holder = _str(args, key)
    if holder not in content.characters:
        raise _invalid(f"{key} must be a character")
    return holder


def _held(state: GameState, holder: str, uid: str) -> InvEntry:
    e = next((e for e in state.inventory.get(holder, []) if e.uid == uid), None)
    if e is None:
        raise _invalid("they don't hold that")
    return e


def _count(args: dict, lowest: int) -> int:
    n = _int(args, "count")
    if not lowest <= n <= COUNT_MAX:
        raise _invalid(f"count must be {lowest}..{COUNT_MAX}")
    return n


def _gm_item(state: GameState, content: Content, kind: str, args: dict) -> Events:
    """Only the GM moves items. Counted items (credits) merge into what the holder already has."""
    holder = _holder(content, args)

    if kind == "gm.item.give":
        item_id = _str(args, "item")
        it = content.items.get(item_id)
        if not it:
            raise _invalid("unknown item")
        if not it.counted:
            if "count" in args:
                raise _invalid(f"{it.name} isn't counted")
            entry = InvEntry(uid=f"i{state.seq + 1}", item=item_id, new=True)
            return [("item.given", {"holder": holder, "entry": entry.model_dump()})]
        n = _count(args, 1)
        have = next((e for e in state.inventory.get(holder, []) if e.item == item_id), None)
        if have:
            return [("item.counted", {"holder": holder, "uid": have.uid, "count": min(COUNT_MAX, (have.count or 0) + n), "new": True})]
        entry = InvEntry(uid=f"i{state.seq + 1}", item=item_id, count=n, new=True)
        return [("item.given", {"holder": holder, "entry": entry.model_dump()})]

    e = _held(state, holder, _str(args, "uid"))

    if kind == "gm.item.take":
        return [("item.taken", {"holder": holder, "uid": e.uid})]

    if kind == "gm.item.move":
        to = _holder(content, args, "to")
        if to == holder:
            return []
        it = content.items.get(e.item)
        have = next((x for x in state.inventory.get(to, []) if x.item == e.item), None) if it and it.counted else None
        if have:
            total = min(COUNT_MAX, (have.count or 0) + (e.count or 0))
            return [
                ("item.taken", {"holder": holder, "uid": e.uid}),
                ("item.counted", {"holder": to, "uid": have.uid, "count": total, "new": True}),
            ]
        return [("item.moved", {"holder": holder, "uid": e.uid, "to": to})]

    if kind == "gm.item.count":
        it = content.items.get(e.item)
        if not it or not it.counted:
            raise _invalid("that item isn't counted")
        n = _count(args, 0)
        if n == e.count:
            return []
        return [("item.counted", {"holder": holder, "uid": e.uid, "count": n, "new": n > (e.count or 0)})]

    raise _invalid(f"unknown intent {kind!r}")


def film_playing(state: GameState, now: float) -> bool:
    f = state.stage.film
    return f is not None and now < f.ends


def _gm_stage(state: GameState, content: Content, kind: str, args: dict, now: float) -> Events:
    """Films and the TV. A film can't be stopped once it starts, so nothing here touches one that's playing."""
    if kind == "gm.film.play":
        cue = content.cutscenes.get(_str(args, "cue"))
        if not cue:
            raise _invalid("unknown cutscene")
        if not cue.file or not cue.length:
            raise _invalid(f"{cue.name} isn't made yet")
        if film_playing(state, now):
            raise _invalid("a film is playing: it can't be stopped, so wait for it to end")
        events: Events = []
        if state.stage.film:  # it ended a moment ago and the sweeper hasn't caught up
            events.append(("film.ended", {"cue": state.stage.film.cue}))
        at = round(now + FILM_LEAD[state.stage.setup], 3)
        events.append(("film.started", {"cue": cue.id, "at": at, "ends": round(at + cue.length, 3)}))
        return events + _cue_sets(state, content, cue)

    if film_playing(state, now):
        raise _invalid("a film is playing: change the TV once it ends")

    if kind == "gm.stage.setup":
        setup = _str(args, "setup")
        if setup not in SETUPS:
            raise _invalid(f"setup must be one of {', '.join(SETUPS)}")
        return [] if setup == state.stage.setup else [("stage.setup_set", {"setup": setup})]

    if kind == "gm.stage.camera":
        camera = _str(args, "camera")
        if camera not in CAMERAS:
            raise _invalid(f"camera must be one of {', '.join(CAMERAS)}")
        follow = args.get("follow", state.stage.follow)
        if camera == "follow" and follow is None:
            follow = next(iter(content.characters), None)
        if follow is not None and follow not in content.characters:
            raise _invalid("follow must be a crew member")
        if (camera, follow) == (state.stage.camera, state.stage.follow):
            return []
        return [("stage.camera_set", {"camera": camera, "follow": follow})]

    raise _invalid(f"unknown intent {kind!r}")


def _cue_sets(state: GameState, content: Content, cue) -> Events:
    """What a cue sets behind its film: the map, its mood and switches, and NPCs placed where the film leaves them."""
    st = cue.sets
    if not st:
        return []
    events: Events = []
    if st.party and state.party_map != st.map:
        events.append(("party.map_set", {"map": st.map}))
    if st.mood and state.maps[st.map].mood != st.mood:
        events.append(("map.mood_set", {"map": st.map, "mood": st.mood}))
    for sw, value in st.switches.items():
        if state.maps[st.map].switches.get(sw, 0) != value:
            events.append(("map.switch_set", {"map": st.map, "switch": sw, "value": value}))
    for t in st.tokens:
        tok = TokenState(kind="npc", ref=t.ref, map=st.map, at=t.at, hidden=t.hidden)
        events.append(("token.placed", {"token": t.id or t.ref, "state": tok.model_dump()}))
    return events


def _send_crew(state: GameState, content: Content, map_id: str) -> Events:
    """The whole crew to a map's entrance (its `arrive` spots, in crew order), and it becomes the party's map.
    A hidden crew token stays hidden. One that isn't on any map yet is placed."""
    m = content.maps.get(map_id)
    if not m:
        raise _invalid("unknown map")
    if not m.arrive:
        raise _invalid(f"{m.name} has nowhere for the crew to arrive")
    events: Events = []
    for i, char in enumerate(content.characters):
        at = list(m.arrive[i])
        tid = next((tid for tid, t in state.tokens.items() if t.kind == "crew" and t.ref == char), None)
        if tid is None:
            tok = TokenState(kind="crew", ref=char, map=map_id, at=tuple(at))
            events.append(("token.placed", {"token": char, "state": tok.model_dump()}))
        else:
            events.append(("token.sent", {"token": tid, "map": map_id, "at": at}))
    if state.party_map != map_id:
        events.append(("party.map_set", {"map": map_id}))
    return events


def sweep(state: GameState, now: float, online: set[str]) -> Events:
    """System housekeeping: rolls whose roller's screen stopped talking to us, and films that have ended."""
    events: Events = []
    if state.stage.film and now >= state.stage.film.ends:
        events.append(("film.ended", {"cue": state.stage.film.cue}))
    for r in state.rolls:
        if not r.open:
            continue
        age = now - r.started
        if age > STALE_CLOSE_AFTER or (r.by not in online and age > OFFLINE_CLOSE_AFTER):
            events.append(("roll.closed", {"roll": r.id}))
        elif r.shown < len(r.dice) and age > REVEAL_AFTER:
            events.append(("roll.revealed", {"roll": r.id, "shown": len(r.dice)}))
    return events


def handle(
    viewer: Viewer,
    state: GameState,
    content: Content,
    kind: str,
    args: dict,
    rng: rules.Rng | None = None,
    now: float = 0.0,
) -> Events:
    if not isinstance(args, dict):
        raise _invalid("args must be an object")
    rng = rng or random.SystemRandom()

    if kind == "token.move":
        token, at = check_drag(viewer, state, args)
        return [("token.moved", {"token": token, "at": list(at)})]

    if kind.startswith("roll."):
        return _roll_intent(viewer, state, content, kind, args, rng, now)

    if kind == "object.seen":
        if viewer.is_gm:
            raise _invalid("players mark what they've inspected")
        map_id, obj = _str(args, "map"), _str(args, "object")
        ms = state.maps.get(map_id)
        if map_id != viewer_map(state, viewer) or not ms or obj not in ms.shown:
            raise _invalid("there's nothing like that here")
        key = f"{map_id}/{obj}"
        return [] if key in state.seen.get(viewer.char, []) else [("object.seen", {"char": viewer.char, "key": key})]

    if kind == "item.seen":
        if viewer.is_gm:
            raise _invalid("only an item's holder marks it seen")
        e = _held(state, viewer.char, _str(args, "uid"))
        return [("item.seen", {"holder": viewer.char, "uid": e.uid})] if e.new else []

    if not kind.startswith("gm."):
        raise _invalid(f"unknown intent {kind!r}")
    if not viewer.is_gm:
        raise _forbid("GM only")

    if kind == "gm.token.hide":
        token = _str(args, "token")
        if token not in state.tokens:
            raise _invalid("unknown token")
        return [("token.hidden_set", {"token": token, "hidden": bool(args.get("hidden"))})]

    if kind == "gm.token.place":
        ref, map_id = _str(args, "ref"), _str(args, "map")
        if ref not in content.npcs:
            raise _invalid("only NPCs can be placed")
        if map_id not in content.maps:
            raise _invalid("unknown map")
        token, n = ref, 2
        while token in state.tokens:
            token, n = f"{ref}-{n}", n + 1
        tok = {"kind": "npc", "ref": ref, "map": map_id, "at": list(_vec3(args.get("at"))), "hidden": bool(args.get("hidden", False))}
        return [("token.placed", {"token": token, "state": tok})]

    if kind == "gm.token.remove":
        token = _str(args, "token")
        t = state.tokens.get(token)
        if t is None:
            raise _invalid("unknown token")
        if t.kind == "crew":
            raise _invalid("crew tokens can be hidden, not removed")
        return [("token.removed", {"token": token})]

    if kind == "gm.map.mood":
        map_id, mood = _str(args, "map"), _str(args, "mood")
        m = content.maps.get(map_id)
        if not m or mood not in {x.id for x in m.moods}:
            raise _invalid("unknown map or mood")
        return [("map.mood_set", {"map": map_id, "mood": mood})]

    if kind == "gm.map.switch":
        map_id, sw = _str(args, "map"), _str(args, "switch")
        m = content.maps.get(map_id)
        d = m.switch(sw) if m else None
        if not d:
            raise _invalid("unknown map or switch")
        value = args.get("value")
        if isinstance(value, bool):
            value = int(value)
        top = 1 if d.type == "bool" else d.max
        if not isinstance(value, int) or not 0 <= value <= top:
            raise _invalid(f"value must be 0..{top}")
        return [("map.switch_set", {"map": map_id, "switch": sw, "value": value})]

    if kind == "gm.object.show":
        map_id, obj = _str(args, "map"), _str(args, "object")
        m = content.maps.get(map_id)
        if not m or not m.object(obj):
            raise _invalid("unknown map or object")
        shown = bool(args.get("shown"))
        if (obj in state.maps[map_id].shown) == shown:
            return []
        return [("object.shown", {"map": map_id, "object": obj, "shown": shown})]

    if kind == "gm.crew.send":
        return _send_crew(state, content, _str(args, "map"))

    if kind == "gm.vitals.set":
        char = _str(args, "char")
        if char not in content.characters:
            raise _invalid("unknown character")
        cur = state.vitals.get(char)
        hp = args.get("hp", cur.hp if cur else HP_MAX)
        en = args.get("entropy", cur.entropy if cur else 2)
        if not isinstance(hp, int) or not isinstance(en, int) or isinstance(hp, bool) or isinstance(en, bool):
            raise _invalid("hp and entropy must be whole numbers")
        return [("vitals.set", {"char": char, "hp": max(0, min(HP_MAX, hp)), "entropy": max(0, min(ENTROPY_MAX, en))})]

    if kind == "gm.session.new":
        # Everyone starts a session with 2 Entropy. HP, pockets and the maps carry over.
        events: Events = []
        for char in content.characters:
            cur = state.vitals.get(char)
            if cur and cur.entropy != SESSION_ENTROPY:
                events.append(("vitals.set", {"char": char, "hp": cur.hp, "entropy": SESSION_ENTROPY}))
        return events

    if kind == "gm.roll.start":
        return _gm_roll(state, content, args, rng, now)

    if kind.startswith(("gm.film.", "gm.stage.")):
        return _gm_stage(state, content, kind, args, now)

    if kind.startswith("gm.item."):
        return _gm_item(state, content, kind, args)

    if kind == "gm.world.load_preset":
        preset = content.presets.get(_str(args, "preset"))
        if not preset:
            raise _invalid("unknown preset")
        return [("world.loaded", {"preset": preset.id, "state": state_from_preset(preset, content)})]

    raise _invalid(f"unknown intent {kind!r}")
