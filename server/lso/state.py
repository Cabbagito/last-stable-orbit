"""The reducer: apply one logged event to the game state. Pure, so replaying the log rebuilds the state."""

from __future__ import annotations

from .content import Content
from .models import GameState, InvEntry, MapState, Preset, PresetItem, RollState, TokenState, Vitals

KEEP_CLOSED_ROLLS = 20  # closed rolls kept in the state for the GM's history; the log keeps all of them


class UnknownEvent(ValueError):
    pass


def _roll(s: GameState, roll_id: str) -> RollState:
    r = next((r for r in s.rolls if r.id == roll_id), None)
    if r is None:
        raise ValueError(f"no roll {roll_id!r}")
    return r


def _trim_rolls(s: GameState) -> None:
    closed = [r for r in s.rolls if not r.open]
    drop = {r.id for r in closed[: max(0, len(closed) - KEEP_CLOSED_ROLLS)]}
    if drop:
        s.rolls = [r for r in s.rolls if r.id not in drop]


def state_from_preset(preset: Preset, content: Content) -> dict:
    """The full state a preset describes, as plain data for a `world.loaded` event."""
    maps = {m_id: MapState(mood=m.moods[0].id).model_dump() for m_id, m in content.maps.items()}
    for m_id, ms in preset.maps.items():
        maps[m_id] = ms.model_dump()
    tokens: dict[str, dict] = {}
    for t in preset.tokens:
        tid = t.id or t.ref
        n = 2
        while tid in tokens:
            tid, n = f"{t.id or t.ref}-{n}", n + 1
        tokens[tid] = TokenState(kind=t.kind, ref=t.ref, map=t.map, at=t.at, hidden=t.hidden).model_dump()
    vitals = {c: (preset.vitals.get(c) or Vitals()).model_dump() for c in content.characters}
    inventory = {c: [] for c in content.characters}
    for holder, entries in preset.inventory.items():
        inventory[holder] = [
            InvEntry(uid=f"{holder}-{i + 1}", item=e.item, count=e.count).model_dump()
            if isinstance(e, PresetItem)
            else InvEntry(uid=f"{holder}-{i + 1}", item=e).model_dump()
            for i, e in enumerate(entries)
        ]
    return {"party_map": preset.party_map, "maps": maps, "tokens": tokens, "vitals": vitals, "inventory": inventory}


def _entry(s: GameState, holder: str, uid: str) -> InvEntry:
    e = next((e for e in s.inventory.get(holder, []) if e.uid == uid), None)
    if e is None:
        raise ValueError(f"{holder} holds no {uid!r}")
    return e


def apply(state: GameState, seq: int, ev_type: str, data: dict) -> GameState:
    s = state.model_copy(deep=True)
    s.seq = seq
    if ev_type == "world.loaded":
        fresh = GameState.model_validate({**data["state"], "seq": seq})
        return fresh
    if ev_type == "token.moved":
        s.tokens[data["token"]].at = tuple(data["at"])
    elif ev_type == "token.placed":
        s.tokens[data["token"]] = TokenState.model_validate(data["state"])
    elif ev_type == "token.removed":
        s.tokens.pop(data["token"], None)
    elif ev_type == "token.hidden_set":
        s.tokens[data["token"]].hidden = bool(data["hidden"])
    elif ev_type == "map.mood_set":
        s.maps[data["map"]].mood = data["mood"]
    elif ev_type == "map.switch_set":
        s.maps[data["map"]].switches[data["switch"]] = int(data["value"])
    elif ev_type == "vitals.set":
        v = s.vitals.setdefault(data["char"], Vitals())
        v.hp, v.entropy = int(data["hp"]), int(data["entropy"])
    elif ev_type == "object.shown":
        ms = s.maps[data["map"]]
        ms.shown = [o for o in ms.shown if o != data["object"]] + ([data["object"]] if data["shown"] else [])
    elif ev_type == "object.seen":
        keys = s.seen.setdefault(data["char"], [])
        if data["key"] not in keys:
            keys.append(data["key"])
    elif ev_type == "item.given":
        s.inventory.setdefault(data["holder"], []).append(InvEntry.model_validate(data["entry"]))
    elif ev_type == "item.taken":
        e = _entry(s, data["holder"], data["uid"])
        s.inventory[data["holder"]].remove(e)
    elif ev_type == "item.moved":
        e = _entry(s, data["holder"], data["uid"])
        s.inventory[data["holder"]].remove(e)
        e.new = True  # news to its new holder
        s.inventory.setdefault(data["to"], []).append(e)
    elif ev_type == "item.counted":
        e = _entry(s, data["holder"], data["uid"])
        e.count = int(data["count"])
        e.new = e.new or bool(data.get("new"))
    elif ev_type == "item.seen":
        _entry(s, data["holder"], data["uid"]).new = False
    elif ev_type == "roll.started":
        s.rolls.append(RollState.model_validate(data["roll"]))
    elif ev_type == "roll.revealed":
        r = _roll(s, data["roll"])
        r.shown = max(r.shown, min(len(r.dice), int(data["shown"])))
    elif ev_type == "roll.pushed":
        r = _roll(s, data["roll"])
        r.shown, r.pushes, r.pushed = len(r.dice), r.pushes + 1, r.pushed + int(data["gain"])
    elif ev_type == "roll.closed":
        r = _roll(s, data["roll"])
        r.shown, r.open = len(r.dice), False
        _trim_rolls(s)
    else:
        raise UnknownEvent(ev_type)
    return s
