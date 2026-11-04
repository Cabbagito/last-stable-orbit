"""project(): the ONLY way state leaves the server.

Every frame a client receives is built here for that viewer. A player gets:
- the one map they are on (their own token's map, else the party map), and only that map's art;
- the tokens on that map that aren't hidden, with each NPC's public card (never its gm_note);
- every crew member's public sheet and vitals (the crew rail shows them);
- their own inventory only;
- each crew member's latest roll, and the latest public roll of each NPC they can see. The dice of a
  roll that isn't theirs arrive only as they land on the roller's screen. Hidden GM rolls never.
The GM gets everything, plus the NPC roster and the presets.
"""

from __future__ import annotations

from . import rules
from .auth import Viewer
from .content import Content
from .models import GameState, RollState

ASSET_PREFIX = "/assets/"


def url(path: str | None) -> str | None:
    return ASSET_PREFIX + path if path else None


def _map_view(content: Content, state: GameState, map_id: str) -> dict:
    d = content.maps[map_id]
    ms = state.maps.get(map_id)
    return {
        "id": d.id,
        "name": d.name,
        "subtitle": d.subtitle,
        "description": d.description,
        "display": list(d.display),
        "origin": list(d.origin),
        "moods": [{"id": m.id, "label": m.label, "base": url(m.base), "glow": url(m.glow)} for m in d.moods],
        "switches": [s.model_dump() for s in d.switches],
        "overlays": [{**o.model_dump(), "src": url(o.src)} for o in d.overlays],
        "mood": ms.mood if ms else d.moods[0].id,
        "values": dict(ms.switches) if ms else {},
    }


def _crew_view(content: Content, state: GameState) -> list[dict]:
    out = []
    for c in content.characters.values():
        v = state.vitals.get(c.id)
        out.append(
            {
                "id": c.id,
                "name": c.name,
                "short": c.short,
                "role": c.role,
                "portrait": url(c.portrait),
                "color": c.color,
                "stats": c.stats,
                "list": [{**e.model_dump(), "icon": url(e.icon)} for e in c.entries],
                "hp": v.hp if v else 6,
                "entropy": v.entropy if v else 2,
            }
        )
    return out


def _token_view(content: Content, tid: str, t, gm: bool) -> dict:
    base = {"id": tid, "kind": t.kind, "ref": t.ref, "map": t.map, "at": list(t.at)}
    if t.kind == "crew":
        c = content.characters[t.ref]
        base |= {"name": c.short, "role": c.role, "portrait": url(c.portrait), "color": c.color, "mood": "", "note": ""}
    else:
        n = content.npcs[t.ref]
        base |= {"name": n.name, "role": n.role, "portrait": url(n.portrait), "color": n.color, "mood": n.mood, "note": n.note}
        if gm:
            base["gm_note"] = n.gm_note
    if gm:
        base["hidden"] = t.hidden
    return base


def _inventory_view(content: Content, entries) -> list[dict]:
    out = []
    for e in entries:
        it = content.items.get(e.item)
        if it:
            out.append({"uid": e.uid, "item": {"id": it.id, "name": it.name, "icon": url(it.icon), "kind": it.kind}})
    return out


def roll_phase(r: RollState) -> str:
    """What everyone else sees: still rolling, exploded and rolling again, or landed."""
    n = len(r.dice)
    if r.shown == 0:
        return "roll"
    if r.shown < n:
        return "boom"
    if rules.is_nat1(r.dice):
        return "nat1"
    return "push" if r.pushes else "land"


def _roll_view(state: GameState, r: RollState, viewer: Viewer, visible_tokens: set[str]) -> dict:
    full = viewer.is_gm or r.by == viewer.seat
    phase = roll_phase(r)
    crew_token = next((tid for tid, t in state.tokens.items() if t.kind == "crew" and t.ref == r.char), None) if r.char else None
    token = crew_token if r.char else r.token
    out = {
        "id": r.id,
        "by": r.by,
        "char": r.char,
        "token": token if token in visible_tokens else None,
        "stat": r.stat,
        "sides": r.sides,
        "phase": phase,
        "open": r.open,
        "pushes": r.pushes,
        "pushed": r.pushed,
    }
    if phase == "nat1":
        out |= {"value": 1, "count": len(r.dice)}  # it fails, whatever the bonus: everyone sees the red 1
    elif phase in ("land", "push"):
        out |= {"value": rules.total(r.dice, r.bonus, r.pushed), "count": len(r.dice)}
    if full:
        out |= {
            "dice": list(r.dice),
            "bonus": r.bonus,
            "seed": r.seed,
            "insult": r.insult,
            "handle": r.handle,
            "entry": r.entry,
            "shown": r.shown,
            "hidden": r.hidden,
        }
    return out


def _rolls_view(state: GameState, viewer: Viewer, visible_tokens: set[str]) -> list[dict]:
    if viewer.is_gm:
        return [_roll_view(state, r, viewer, visible_tokens) for r in state.rolls]
    latest: dict[str, RollState] = {}  # one callout per crew member or NPC token: their newest roll
    for r in state.rolls:
        if r.hidden:
            continue
        if r.char is None and r.token not in visible_tokens:
            continue  # an NPC this player can't see
        latest[r.char or r.token] = r
    return [_roll_view(state, r, viewer, visible_tokens) for r in latest.values()]


def viewer_map(state: GameState, viewer: Viewer) -> str:
    """Split party: a player looks at the map their own token stands on."""
    if not viewer.is_gm:
        for t in state.tokens.values():
            if t.kind == "crew" and t.ref == viewer.char and not t.hidden:
                return t.map
    return state.party_map


def project(state: GameState, content: Content, viewer: Viewer) -> dict:
    gm = viewer.is_gm
    here = viewer_map(state, viewer)
    map_ids = list(content.maps) if gm else ([here] if here in content.maps else [])
    tokens = {
        tid: _token_view(content, tid, t, gm)
        for tid, t in state.tokens.items()
        if gm or (t.map in map_ids and not t.hidden)
    }
    holders = state.inventory.keys() if gm else [h for h in state.inventory if h == viewer.char]
    view = {
        "me": {"seat": viewer.seat, "role": viewer.role, "char": viewer.char},
        "party_map": here,
        "crew": _crew_view(content, state),
        "maps": {m: _map_view(content, state, m) for m in map_ids},
        "tokens": tokens,
        "inventory": {h: _inventory_view(content, state.inventory[h]) for h in holders},
        "rolls": _rolls_view(state, viewer, set(tokens)),
    }
    if gm:
        view["roster"] = [
            {"id": n.id, "name": n.name, "role": n.role, "portrait": url(n.portrait), "color": n.color}
            for n in content.npcs.values()
        ]
        view["presets"] = [{"id": p.id, "name": p.name} for p in content.presets.values()]
    return view


def referenced_assets(view) -> set[str]:
    """Every /assets/ path inside a projection: the files this viewer may fetch."""
    found: set[str] = set()

    def walk(v):
        if isinstance(v, str):
            if v.startswith(ASSET_PREFIX):
                found.add(v[len(ASSET_PREFIX):])
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, (list, tuple)):
            for x in v:
                walk(x)

    walk(view)
    return found
