"""Turn a client intent into events: authorize, validate, then describe the change.

Nothing here touches the database or the network, so every rule is easy to test.
"""

from __future__ import annotations

import math

from .auth import Viewer
from .content import Content
from .models import ENTROPY_MAX, HP_MAX, GameState
from .state import state_from_preset

Events = list[tuple[str, dict]]
COORD_LIMIT = 500.0  # world units; far beyond any map, just stops garbage


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


def handle(viewer: Viewer, state: GameState, content: Content, kind: str, args: dict) -> Events:
    if not isinstance(args, dict):
        raise _invalid("args must be an object")

    if kind == "token.move":
        token, at = check_drag(viewer, state, args)
        return [("token.moved", {"token": token, "at": list(at)})]

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

    if kind == "gm.world.load_preset":
        preset = content.presets.get(_str(args, "preset"))
        if not preset:
            raise _invalid("unknown preset")
        return [("world.loaded", {"preset": preset.id, "state": state_from_preset(preset, content)})]

    raise _invalid(f"unknown intent {kind!r}")
