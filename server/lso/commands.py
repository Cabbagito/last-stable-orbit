"""Turn a client intent into events: authorize, validate, then describe the change.

Nothing here touches the database or the network, so every rule is easy to test.
"""

from __future__ import annotations

import math
import random

from . import rules
from .auth import Viewer
from .content import Content
from .models import DIE_SIDES, ENTROPY_MAX, HP_MAX, STATS, GameState, RollState
from .state import state_from_preset

Events = list[tuple[str, dict]]
COORD_LIMIT = 500.0  # world units; far beyond any map, just stops garbage

# The sweeper, for a roller whose laptop sleeps or whose tab closes mid-roll:
REVEAL_AFTER = 45.0  # everyone sees the result even if the roller's screen never got there (6 exploding dice with every gate held run about 40 s)
OFFLINE_CLOSE_AFTER = 30.0  # a roll this old whose roller has gone away is closed
STALE_CLOSE_AFTER = 600.0  # nothing stays open longer than this


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
    sides = _int(args, "sides")
    if sides not in DIE_SIDES:
        raise _invalid(f"sides must be one of {DIE_SIDES}")
    stat = _stat(args)
    token = args.get("token")
    hidden = bool(args.get("hidden", False))
    handle = "gm"
    if token is not None:
        if not isinstance(token, str):
            raise _invalid("token must be a token id or null")
        t = state.tokens.get(token)
        if t is None or t.kind != "npc":
            raise _invalid("the GM rolls for NPC tokens")
        if t.hidden and not hidden:
            raise _invalid("that token is hidden from players: make the roll hidden, or show the token first")
        handle = t.ref
    else:
        hidden = True  # just a die, with no token to sit on: only the GM sees it
    return _new_roll(state, content, rng, now, by="gm", token=token, handle=handle, stat=stat, sides=sides, hidden=hidden)


def sweep(state: GameState, now: float, online: set[str]) -> Events:
    """System housekeeping for rolls whose roller's screen stopped talking to us."""
    events: Events = []
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

    if kind == "gm.roll.start":
        return _gm_roll(state, content, args, rng, now)

    if kind == "gm.world.load_preset":
        preset = content.presets.get(_str(args, "preset"))
        if not preset:
            raise _invalid("unknown preset")
        return [("world.loaded", {"preset": preset.id, "state": state_from_preset(preset, content)})]

    raise _invalid(f"unknown intent {kind!r}")
