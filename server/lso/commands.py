"""Turn a client intent into events: authorize, validate, then describe the change.

Nothing here touches the database or the network, so every rule is easy to test.
"""

from __future__ import annotations

import math
import random

from . import rules
from .auth import Viewer
from .content import Content
from .models import BURN_COST, CAMERAS, COUNT_MAX, DIE_SIDES, ENTROPY_MAX, STATS, GameState, InvEntry, RollState, SlotBank, SlotSeat, TokenState
from .state import state_from_preset
from .views import viewer_map

Events = list[tuple[str, dict]]
COORD_LIMIT = 500.0  # world units; far beyond any map, just stops garbage
SESSION_ENTROPY = 2  # what "New session" sets everyone's Entropy to

# The sweeper, for a roller whose laptop sleeps or whose tab closes mid-roll:
GM_ROLL_MODES = ("public", "hidden", "someone", "secret", "god")
REVEAL_AFTER = 45.0  # everyone sees the result even if the roller's screen never got there (6 exploding dice with every gate held run about 40 s)
OFFLINE_CLOSE_AFTER = 30.0  # a roll this old whose roller has gone away is closed
STALE_CLOSE_AFTER = 600.0  # nothing stays open longer than this

FILM_LEAD = 1.5  # a film starts this long after the GM presses Play. The TV has every film already
OPENING_LEAD = 0.75  # the opening's film starts on the first beat at least this long after Play, so the TV hears in time
BURN_LEAD = 0.4  # and every Burn film, so a Burn starts almost at once
BURN_HOLD = 0.75  # seconds a Burn film's last frame stays up before the hard cut back


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
    return t.kind == "crew" and t.ref == viewer.char and not t.hidden and not state.stage.opening


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
        hp, entropy = (v.hp, v.entropy) if v else (content.characters[r.char].health, 2)
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
    """An NPC rolls the die on its sheet for a stat, in one of the modes on its card (Round 17): Public, Hidden, Secret
    or God, or Someone, Secret or God for an NPC players can't see. "Just a die" has no stat: Public and Hidden are both
    God rolls, with and without the number, and Secret is only the GM's."""
    token = args.get("token")
    mode = args.get("mode", "public")
    if mode not in GM_ROLL_MODES:
        raise _invalid(f"mode must be one of {', '.join(GM_ROLL_MODES)}")
    flags = {"hidden": mode == "secret", "sealed": mode in ("hidden", "someone"), "god": mode == "god"}
    if token is None:
        sides = _int(args, "sides")
        if sides not in DIE_SIDES:
            raise _invalid(f"sides must be one of {DIE_SIDES}")
        if mode not in ("public", "hidden", "secret"):
            raise _invalid("just a die is Public, Hidden or Secret")
        flags = {"hidden": mode == "secret", "sealed": mode == "hidden", "god": mode != "secret"}
        return _new_roll(state, content, rng, now, by="gm", token=None, handle="gm", stat=None, sides=sides, **flags)
    stat = _stat(args)
    if not isinstance(token, str):
        raise _invalid("token must be a token id or null")
    t = state.tokens.get(token)
    if t is None or t.kind != "npc":
        raise _invalid("the GM rolls for NPC tokens")
    if "sides" in args:
        raise _invalid("an NPC rolls the die on its sheet: send the stat, not sides")
    if t.hidden and mode in ("public", "hidden"):
        raise _invalid("that token is hidden from players: roll as Someone, Secret or God, or show the token first")
    if not t.hidden and mode == "someone":
        raise _invalid("players can see that token: roll as Public, Hidden, Secret or God")
    sides = content.npcs[t.ref].stats[stat]
    return _new_roll(state, content, rng, now, by="gm", token=token, handle=t.ref, stat=stat, sides=sides, **flags)


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
    f, o = state.stage.film, state.stage.opening
    return (f is not None and now < f.ends) or (o is not None and o.ends is not None and now < o.ends)


def burn_playing(state: GameState, now: float) -> bool:
    b = state.stage.burn
    return b is not None and now < b.ends


def _burn(state: GameState, content: Content, char: str, cut_id, now: float) -> Events:
    """A Burn: 2 Entropy, no roll, and its film on the TV. What it does, Peter applies."""
    c = content.characters[char]
    if not c.burn:
        raise _invalid(f"{c.short} has no Burn")
    if cut_id is not None and not isinstance(cut_id, str):
        raise _invalid("cut must be one of the Burn's films")
    cut = c.burn.cut(cut_id)
    if not cut:
        raise _invalid(f"{c.burn.name} has no film {cut_id!r}")
    v = state.vitals.get(char)
    hp, entropy = (v.hp, v.entropy) if v else (c.health, 2)
    if entropy < BURN_COST:
        raise _invalid(f"a Burn costs {BURN_COST} Entropy")
    if state.stage.opening or film_playing(state, now):
        raise _invalid("a film is playing: Burn once it ends")
    if burn_playing(state, now):
        raise _invalid("a Burn is playing: wait for it to end")
    events: Events = [("burn.ended", {"char": state.stage.burn.char})] if state.stage.burn else []
    at = round(now + BURN_LEAD, 3)
    return events + [
        ("vitals.set", {"char": char, "hp": hp, "entropy": entropy - BURN_COST}),
        ("burn.started", {"char": char, "cut": cut.id, "at": at, "ends": round(at + cut.length + BURN_HOLD, 3)}),
    ]


def _gm_stage(state: GameState, content: Content, kind: str, args: dict, now: float) -> Events:
    """Films and the TV. A film can't be stopped once it starts, so nothing here touches one that's playing."""
    if kind == "gm.film.play":
        cue = content.cutscenes.get(_str(args, "cue"))
        if not cue:
            raise _invalid("unknown cutscene")
        if not cue.file or not cue.length:
            raise _invalid(f"{cue.name} isn't made yet")
        if state.stage.opening:
            raise _invalid("the opening is on: play the film once it has ended")
        if film_playing(state, now):
            raise _invalid("a film is playing: it can't be stopped, so wait for it to end")
        if burn_playing(state, now):
            raise _invalid("a Burn is playing: play the film once it ends")
        events: Events = []
        if state.stage.film:  # it ended a moment ago and the sweeper hasn't caught up
            events.append(("film.ended", {"cue": state.stage.film.cue}))
        at = round(now + FILM_LEAD, 3)
        events.append(("film.started", {"cue": cue.id, "at": at, "ends": round(at + cue.length, 3)}))
        return events + _cue_sets(state, content, cue)

    if film_playing(state, now):
        raise _invalid("a film is playing: change the TV once it ends")

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

    if kind == "gm.stage.join":
        show = args.get("show")
        if not isinstance(show, bool):
            raise _invalid("show must be true or false")
        return [] if show == state.stage.join else [("stage.join_set", {"show": show})]

    raise _invalid(f"unknown intent {kind!r}")


def beat_after(loop_at: float, pressed: float, beat: float) -> float:
    """The first beat of the loop at least OPENING_LEAD seconds after the press."""
    return round(loop_at + math.ceil(max(0.0, pressed + OPENING_LEAD - loop_at) / beat) * beat, 3)


def _gm_opening(state: GameState, content: Content, kind: str, args: dict, now: float) -> Events:
    """The opening: on, the TV loops and players are held. Play starts the film, which can't be stopped; its end lets them in."""
    game, o = content.opening, state.stage.opening
    if not game:
        raise _invalid("this campaign has no opening")

    if kind == "gm.opening.set":
        on = args.get("on")
        if not isinstance(on, bool):
            raise _invalid("on must be true or false")
        if on == (o is not None):
            return []
        if not on:
            if o.film_at is not None:
                raise _invalid("the film has started: it can't be stopped, so wait for it to end")
            return [("opening.cleared", {})]
        if film_playing(state, now) or burn_playing(state, now):
            raise _invalid("a film is playing: turn the opening on once it ends")
        return [("opening.armed", {"loop_at": round(now, 3)})]

    if kind == "gm.opening.play":
        if o is None:
            raise _invalid("turn the opening on first")
        if o.film_at is not None:
            raise _invalid("the film has already started")
        film_at = beat_after(o.loop_at, now, game.beat)
        events: Events = [("opening.started", {"film_at": film_at, "ends": round(film_at + game.length, 3)})]
        return events + ([("stage.join_set", {"show": False})] if state.stage.join else [])  # everyone's in

    raise _invalid(f"unknown intent {kind!r}")


def _cue_sets(state: GameState, content: Content, cue) -> Events:
    """What a cue sets behind its film: the map, its mood and switches, and NPCs placed where the film leaves them."""
    st = cue.sets
    if not st:
        return []
    events: Events = []
    if st.party and state.party_map != st.map:
        events.append(("party.map_set", {"map": st.map}))
    if st.party:
        events += _lit(state, content, st.map)
    if st.mood and state.maps[st.map].mood != st.mood:
        events.append(("map.mood_set", {"map": st.map, "mood": st.mood}))
    for sw, value in st.switches.items():
        if state.maps[st.map].switches.get(sw, 0) != value:
            events.append(("map.switch_set", {"map": st.map, "switch": sw, "value": value}))
    for t in st.tokens:
        tok = TokenState(kind="npc", ref=t.ref, map=st.map, at=t.at, hidden=t.hidden)
        events.append(("token.placed", {"token": t.id or t.ref, "state": tok.model_dump()}))
    return events


def _gm_overview(state: GameState, content: Content, kind: str, args: dict) -> Events:
    """The GM tab's Events: send an overview to some of the crew, or take one back. Sending one replaces what's open."""
    if kind == "gm.overview.send":
        ov = content.overviews.get(_str(args, "overview"))
        if not ov:
            raise _invalid("unknown overview")
        chars = args.get("chars")
        if not isinstance(chars, list) or not chars or not all(isinstance(c, str) and c in content.characters for c in chars):
            raise _invalid("pick one or more of the crew")
        chars = [c for c in content.characters if c in chars]
        return [("overview.sent", {"kind": ov.id, "chars": chars, "id": f"o{state.seq + 1}"})]
    if kind == "gm.overview.recall":
        char = _str(args, "char")
        if char not in content.characters:
            raise _invalid("unknown character")
        return [("overview.closed", {"char": char})] if char in state.overviews else []
    raise _invalid(f"unknown intent {kind!r}")


def _slots_key(content: Content, args: dict) -> str:
    """The "map/object" of a slot machine named in an intent."""
    map_id, obj = _str(args, "map"), _str(args, "object")
    m = content.maps.get(map_id)
    if not content.slots or not m or not any(o.id == obj and o.game == "slots" for o in m.objects):
        raise _invalid("there are no slot machines there")
    return f"{map_id}/{obj}"


def _my_seat(viewer: Viewer, state: GameState) -> tuple[str, SlotBank, SlotSeat]:
    for key, bank in state.slots.items():
        for x in bank.seats:
            if x.char == viewer.char:
                return key, bank, x
    raise _invalid("you aren't at a machine")


def _credits_changed(state: GameState, currency: str, char: str, delta: int) -> Events:
    """Change someone's credits; the machines are the one thing that touches them without the GM."""
    e = next((e for e in state.inventory.get(char, []) if e.item == currency), None)
    if e:
        return [("item.counted", {"holder": char, "uid": e.uid, "count": max(0, min(COUNT_MAX, (e.count or 0) + delta))})]
    entry = InvEntry(uid=f"slots-{state.seq + 1}-{char}", item=currency, count=max(0, min(COUNT_MAX, delta)))
    return [("item.given", {"holder": char, "entry": entry.model_dump()})]


def _slots_intent(viewer: Viewer, state: GameState, content: Content, kind: str, args: dict, rng, now: float) -> Events:
    game = content.slots
    if not game or not viewer.char:
        raise _invalid("the machines are for the crew")
    char = viewer.char

    if kind == "slots.sit":
        key = _slots_key(content, args)
        map_id, obj = key.split("/", 1)
        ms = state.maps.get(map_id)
        if map_id != viewer_map(state, viewer) or not ms or obj not in ms.shown:
            raise _invalid("there are no slot machines here")
        if any(x.char == char for b in state.slots.values() for x in b.seats):
            raise _invalid("you're already sitting at a machine")
        bank = state.slots.get(key) or SlotBank()
        if bank.out:
            raise _invalid("the machines are out of service")
        taken = {x.unit for x in bank.seats}
        unit = next((u for u in range(1, game.seats + 1) if u not in taken), None)
        if unit is None:
            raise _invalid("all the seats are taken")
        return [("slots.sat", {"key": key, "char": char, "unit": unit})]

    key, bank, seat = _my_seat(viewer, state)

    if kind == "slots.pull":
        if seat.page != "play":
            raise _invalid("you can't pull now")
        have = next((e.count or 0 for e in state.inventory.get(char, []) if e.item == game.currency), 0)
        if not seat.free and have < game.pull:
            raise _invalid("insert credits")
        reels, near = rules.spin_reels(rng, game.near_percent, force_near=seat.free)
        line = game.near_line if near else game.miss_lines[rng.randrange(len(game.miss_lines))]
        cost = 0 if seat.free else game.pull
        events: Events = _credits_changed(state, game.currency, char, -cost) if cost else []
        return events + [("slots.pulled", {"key": key, "char": char, "cost": cost, "reels": reels, "near": near, "line": line})]

    if kind == "slots.stand":
        if seat.page != "play":
            raise _invalid("you can't stand up now")
        if seat.lost == 0:  # nothing to pay back: you just get up
            return [("slots.left", {"key": key, "char": char})]
        return [("slots.stood", {"key": key, "char": char, "until": bank.until if bank.until is not None else now + game.window})]

    if kind == "slots.sit_back":
        if seat.page != "wait":
            raise _invalid("you're already sitting")
        return [("slots.sat_back", {"key": key, "char": char})]

    if kind == "slots.free":
        if seat.page != "lucky":
            raise _invalid("there's no free spin to take")
        return [("slots.free", {"key": key, "char": char})]

    if kind == "slots.leave":
        if seat.page not in ("lucky", "flood", "out"):
            raise _invalid("stand up first")
        return [("slots.left", {"key": key, "char": char})]

    raise _invalid(f"unknown intent {kind!r}")


def _slots_close(state: GameState, game, key: str, bank: SlotBank, now: float) -> Events:
    """The stand window is over: count who stood, and pay each their own lost x the rate. All the seats at once is the
    flood."""
    standing = sorted((x for x in bank.seats if x.page == "wait"), key=lambda x: x.unit)
    paid = {x.char: rules.payback(x.lost, len(standing), game.paid_back) for x in standing}
    events: Events = []
    for char, amount in paid.items():
        events += _credits_changed(state, game.currency, char, amount)
    return events + [("slots.paid", {"key": key, "paid": paid, "flood": len(standing) == game.seats, "at": now, "ends": now + game.flood_seconds})]


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
    return events + _lit(state, content, map_id)


def _lit(state: GameState, content: Content, map_id: str) -> Events:
    """The crew is going somewhere: it lights up on the Station."""
    places = {p.map for p in content.station.places} if content.station else set()
    return [("station.shown", {"map": map_id, "shown": True})] if map_id in places and map_id not in state.station else []


def _send_token(state: GameState, content: Content, token: str, map_id: str) -> Events:
    """One token to another map's entrance, on the first spot nobody is standing on. Up the stairs, down the vent:
    the GM moves whoever goes, and the party's map stays where it is."""
    t = state.tokens.get(token)
    if t is None:
        raise _invalid("unknown token")
    m = content.maps.get(map_id)
    if not m:
        raise _invalid("unknown map")
    if not m.arrive:
        raise _invalid(f"{m.name} has nowhere to arrive")
    if t.map == map_id:
        return []
    taken = {tuple(x.at) for x in state.tokens.values() if x.map == map_id}
    at = next((a for a in m.arrive if tuple(a) not in taken), m.arrive[0])
    return [("token.sent", {"token": token, "map": map_id, "at": list(at)})] + (_lit(state, content, map_id) if t.kind == "crew" else [])


# ---------------------------------------------------------------- fights (M8)


def _reflex(state: GameState, content: Content, token: str) -> tuple[int, bool]:
    """A fighter's Reflex die, from their sheet, and whether they're crew."""
    t = state.tokens[token]
    if t.kind == "crew":
        return content.characters[t.ref].stats["reflex"], True
    return content.npcs[t.ref].stats["reflex"], False


def is_down(state: GameState, content: Content, token: str) -> bool:
    """At 0 health: a down fighter keeps their place in the order, but Next skips them."""
    t = state.tokens.get(token)
    if t is None:
        return True
    if t.kind == "crew":
        v = state.vitals.get(t.ref)
        return v is not None and v.hp <= 0
    return t.hp is not None and t.hp <= 0


def _fight_tokens(state: GameState, map_id: str, raw) -> list[str]:
    if not isinstance(raw, list) or not all(isinstance(x, str) for x in raw):
        raise _invalid("tokens must be a list of token ids")
    if len(set(raw)) != len(raw):
        raise _invalid("a token is listed twice")
    for tid in raw:
        t = state.tokens.get(tid)
        if t is None:
            raise _invalid(f"unknown token {tid!r}")
        if t.map != map_id:
            raise _invalid(f"{tid} isn't on that map")
    return raw


def _gm_fight(state: GameState, content: Content, kind: str, args: dict, rng, now: float) -> Events:
    """A fight belongs to a map. Its order comes from everyone's Reflex, rolled once on the server when it starts (or
    when someone joins); the GM moves it on with Next and applies every result by hand."""
    map_id = _str(args, "map")
    if map_id not in content.maps:
        raise _invalid("unknown map")
    f = state.fights.get(map_id)

    def roll(tid: str) -> int:
        return sum(rules.roll_dice(_reflex(state, content, tid)[0], rng))

    def order_of(ini: dict[str, int]) -> list[str]:
        return rules.turn_order({tid: (v, *_reflex(state, content, tid)) for tid, v in ini.items()})

    if kind == "gm.fight.start":
        if f:
            raise _invalid("there's already a fight on that map")
        tokens = _fight_tokens(state, map_id, args.get("tokens"))
        if len(tokens) < 2:
            raise _invalid("a fight needs at least two")
        # a hidden NPC joins in plain sight: the strip never shows a slot for something players can't see
        events: Events = [("token.hidden_set", {"token": t, "hidden": False}) for t in tokens if state.tokens[t].hidden]
        ini = {t: roll(t) for t in tokens}
        events.append(("fight.started", {"map": map_id, "order": order_of(ini), "rolled": tokens, "ini": ini, "at": now}))
        return events
    if f is None:
        raise _invalid("there's no fight on that map")

    if kind == "gm.fight.next":
        n, t, rnd = len(f.order), f.turn, f.round
        for _ in range(n):
            t += 1
            if t >= n:
                t, rnd = 0, rnd + 1
            if not is_down(state, content, f.order[t]):
                break
        return [("fight.turned", {"map": map_id, "turn": t, "round": rnd})]

    if kind == "gm.fight.add":
        (tid,) = _fight_tokens(state, map_id, [_str(args, "token")])
        if tid in f.order:
            raise _invalid("they're already in the fight")
        events = [("token.hidden_set", {"token": tid, "hidden": False})] if state.tokens[tid].hidden else []
        ini = {**f.ini, tid: roll(tid)}
        order = order_of(ini)
        # whoever's turn it is keeps it
        events.append(("fight.joined", {"map": map_id, "token": tid, "ini": ini[tid], "order": order, "turn": order.index(f.order[f.turn]), "at": now}))
        return events

    if kind == "gm.fight.remove":
        tid = _str(args, "token")
        if tid not in f.order:
            raise _invalid("they aren't in the fight")
        return [("fight.left", {"map": map_id, "token": tid})]

    if kind == "gm.fight.end":
        return [("fight.ended", {"map": map_id})]

    raise _invalid(f"unknown intent {kind!r}")


def sweep(state: GameState, now: float, online: set[str], content: Content | None = None, seated: set[str] | None = None) -> Events:
    """System housekeeping: rolls whose roller's screen stopped talking to us, films that have ended, and the slots'
    stand windows and flood. `seated` is who still counts as being at the table: anyone else loses their machine."""
    events: Events = []
    game = content.slots if content else None
    for key, bank in state.slots.items() if game else ():
        if bank.until is not None and now >= bank.until:
            events += _slots_close(state, game, key, bank, now)
        if seated is not None:
            events += [("slots.left", {"key": key, "char": x.char}) for x in bank.seats if x.char not in seated and x.page != "wait"]
    if state.stage.flood and now >= state.stage.flood.ends:
        events.append(("slots.flood_ended", {}))
    if state.stage.opening and state.stage.opening.ends is not None and now >= state.stage.opening.ends:
        events.append(("opening.ended", {}))
    if state.stage.film and now >= state.stage.film.ends:
        events.append(("film.ended", {"cue": state.stage.film.cue}))
    if state.stage.burn and now >= state.stage.burn.ends:
        events.append(("burn.ended", {"char": state.stage.burn.char}))
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

    if viewer.char and state.stage.opening:
        raise _forbid("the opening is on: you're let in when it ends")

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

    if kind.startswith("slots."):
        return _slots_intent(viewer, state, content, kind, args, rng, now)

    if kind == "codex.read":
        # a player opened a page: it, and the blocks they can see on it, aren't new to them any more
        if not viewer.char:
            raise _invalid("players mark what they've read")
        e = content.codex.get(_str(args, "entry"))
        if not e or e.id not in state.codex:
            raise _invalid("there's no page like that")
        keys = [e.id] + [f"{e.id}/{b.id}" for b in e.blocks if b.locked and f"{e.id}/{b.id}" in state.codex]
        fresh = [k for k in keys if k not in state.codex_read.get(viewer.char, [])]
        return [("codex.read", {"char": viewer.char, "keys": fresh})] if fresh else []

    if kind == "burn.use":
        if not viewer.char:
            raise _invalid("the GM burns for someone with gm.burn.use")
        return _burn(state, content, viewer.char, args.get("cut"), now)

    if kind == "overview.close":
        # the player is done with it. What they answered stays on their screen
        if not viewer.char:
            raise _invalid("only the player it was sent to closes an overview")
        o = state.overviews.get(viewer.char)
        return [("overview.closed", {"char": viewer.char})] if o and o.id == args.get("id") else []

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

    if kind == "gm.token.send":
        return _send_token(state, content, _str(args, "token"), _str(args, "map"))

    if kind == "gm.vitals.set":
        char = _str(args, "char")
        if char not in content.characters:
            raise _invalid("unknown character")
        cur = state.vitals.get(char)
        top = content.characters[char].health
        hp = args.get("hp", cur.hp if cur else top)
        en = args.get("entropy", cur.entropy if cur else 2)
        if not isinstance(hp, int) or not isinstance(en, int) or isinstance(hp, bool) or isinstance(en, bool):
            raise _invalid("hp and entropy must be whole numbers")
        return [("vitals.set", {"char": char, "hp": max(0, min(top, hp)), "entropy": max(0, min(ENTROPY_MAX, en))})]

    if kind == "gm.codex.unlock":
        # for the whole crew: an entry, or one locked block of it
        e = content.codex.get(_str(args, "entry"))
        if not e:
            raise _invalid("unknown Codex entry")
        key = e.id
        if args.get("block") is not None:
            b = next((b for b in e.blocks if b.id == args.get("block")), None)
            if not b or not b.locked:
                raise _invalid(f"{e.name or e.id} has no locked block {args.get('block')!r}")
            key = f"{e.id}/{b.id}"
        on = bool(args.get("unlocked", True))
        return [] if (key in state.codex) == on else [("codex.set", {"keys": [key], "unlocked": on})]

    if kind == "gm.station.show":
        map_id = _str(args, "map")
        if not content.station or map_id not in {p.map for p in content.station.places}:
            raise _invalid("that isn't a place on the Station")
        shown = bool(args.get("shown", True))
        return [] if (map_id in state.station) == shown else [("station.shown", {"map": map_id, "shown": shown})]

    if kind == "gm.burn.use":
        return _burn(state, content, _holder(content, args, "char"), args.get("cut"), now)

    if kind == "gm.roll.failed":
        # Peter names the number, so only he knows a roll failed. A failed skill roll shows its downside on the TV.
        r = _the_roll(viewer, state, args, gm_too=True)
        if r.char is None or r.entry is None:
            raise _invalid("only a crew roll that used a skill has a downside")
        if r.shown < len(r.dice):
            raise _invalid("the dice haven't landed yet")
        return [] if r.failed else [("roll.failed", {"roll": r.id})]

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

    if kind.startswith("gm.fight."):
        return _gm_fight(state, content, kind, args, rng, now)

    if kind == "gm.npc.hp":
        token = _str(args, "token")
        t = state.tokens.get(token)
        if t is None or t.kind != "npc":
            raise _invalid("only an NPC token has health here: the crew's is gm.vitals.set")
        hp = args.get("hp")
        if not isinstance(hp, int) or isinstance(hp, bool):
            raise _invalid("hp must be a whole number")
        top = content.npcs[t.ref].health
        hp = max(0, min(top, hp))
        cur = top if t.hp is None else t.hp
        return [] if hp == cur else [("npc.hp_set", {"token": token, "hp": hp})]

    if kind.startswith("gm.opening."):
        return _gm_opening(state, content, kind, args, now)

    if kind.startswith(("gm.film.", "gm.stage.")):
        return _gm_stage(state, content, kind, args, now)

    if kind.startswith("gm.overview."):
        return _gm_overview(state, content, kind, args)

    if kind == "gm.slots.service":
        key = _slots_key(content, args)
        out = bool(args.get("out", True))
        bank = state.slots.get(key)
        return [] if bool(bank and bank.out) == out else [("slots.service", {"key": key, "out": out})]

    if kind.startswith("gm.item."):
        return _gm_item(state, content, kind, args)

    if kind == "gm.world.load_preset":
        preset = content.presets.get(_str(args, "preset"))
        if not preset:
            raise _invalid("unknown preset")
        data = {"preset": preset.id, "state": state_from_preset(preset, content)}
        return [("world.loaded", data | {"scene": True} if args.get("scene") is True else data)]

    raise _invalid(f"unknown intent {kind!r}")
