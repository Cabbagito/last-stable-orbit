"""project(): the ONLY way state leaves the server.

Every frame a client receives is built here for that viewer. A player gets:
- the one map they are on (their own token's map, else the party map), and only that map's art;
- the objects on it the GM has revealed (a mural, the slot machines), each marked with whether they've inspected it;
- the tokens on that map that aren't hidden, with each NPC's public card (never its gm_note or its dice);
- every crew member's public sheet and vitals (the crew rail shows them);
- their own inventory only, with each item's text (clues are items, so this is where they hide);
- each crew member's latest roll, and the latest public roll of each NPC they can see. The dice of a
  roll that isn't theirs arrive only as they land on the roller's screen. Hidden GM rolls never.
The GM gets everything, plus the NPC roster, the presets, the item catalogue and the cue list.

Each map also carries its decals and camera cones (everyone sees those). Only the GM gets its pins, the Key
board's "what's where".

The TV (the Stage seat) gets what a player gets with no seat: the party map (or, following one of the crew, the
map they're on), its visible tokens and revealed
objects, the crew's public sheets, and no pockets at all. It also gets each public roll's dice as it starts, as
the roller's screen does, to play the same animation in its band; it shows each die as the roller's screen
lands it. And it gets every film's file, to have them ready, because at the table only the TV plays films.

Films: a player's laptop gets a film's file only while it plays, and only when its laptop plays it (no TV, or
online). With a TV it gets only when the film starts and ends, and shows the black hole meanwhile.
"""

from __future__ import annotations

from . import rules
from .auth import Viewer
from .content import Content
from .models import GameState, RollState

ASSET_PREFIX = "/assets/"


def url(path: str | None) -> str | None:
    return ASSET_PREFIX + path if path else None


def _objects_view(state: GameState, d, ms, viewer: Viewer) -> list[dict]:
    """Players get only what the GM has revealed, each marked with whether they've inspected it."""
    shown = set(ms.shown) if ms else set()
    seen = set(state.seen.get(viewer.char or "", []))
    out = []
    for o in d.objects:
        if not viewer.is_gm and o.id not in shown:
            continue
        v = {"id": o.id, "name": o.name, "at": list(o.at), "text": o.text, "closeup": list(o.closeup) if o.closeup else None, "codex": o.codex}
        v |= {"shown": o.id in shown} if viewer.is_gm else {"seen": f"{d.id}/{o.id}" in seen}
        out.append(v)
    return out


def _map_view(content: Content, state: GameState, map_id: str, viewer: Viewer) -> dict:
    d = content.maps[map_id]
    ms = state.maps.get(map_id)
    out = {
        "id": d.id,
        "name": d.name,
        "subtitle": d.subtitle,
        "description": d.description,
        "display": list(d.display),
        "origin": list(d.origin),
        "moods": [{"id": m.id, "label": m.label, "base": url(m.base), "glow": url(m.glow), "hum": m.hum or d.hum} for m in d.moods],
        "switches": [s.model_dump() for s in d.switches],
        "overlays": [{**o.model_dump(), "src": url(o.src)} for o in d.overlays],
        "decals": [{**x.model_dump(), "src": url(x.src)} for x in d.decals],
        "hum": d.hum,
        "order": d.order,  # frames go out with sorted keys, so the GM's lists sort by this
        "cameras": {
            "switch": d.cameras.switch,
            "color": d.cameras.color,
            "cones": [{"mood": c.mood, "z": c.z, "pts": d.cameras.polygon(c)} for c in d.cameras.cones],
        }
        if d.cameras
        else None,
        "feed": d.feed.model_dump() if d.feed else None,
        "floors": [f.model_dump() for f in d.floors],
        "mood": ms.mood if ms else d.moods[0].id,
        "values": dict(ms.switches) if ms else {},
        "objects": _objects_view(state, d, ms, viewer),
    }
    if viewer.is_gm:
        out["pins"] = [p.model_dump() for p in d.pins]  # the Key board's "what's where", for the GM's eyes only
        out["arrive"] = bool(d.arrive)
    return out


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
                "health": c.health,
                "hp": v.hp if v else c.health,
                "entropy": v.entropy if v else 2,
                "burn": _burn_view(c.burn),
            }
        )
    return out


def _burn_view(b) -> dict | None:
    """A Burn is public, like the skills. Its films go to every screen, so whichever plays it has them ready."""
    if not b:
        return None
    cuts = [{"id": x.id, "label": x.label, "src": url(x.file), "length": x.length} for x in b.cuts]
    return {"name": b.name, "when": b.when, "text": b.text, "icon": url(b.icon), "color": b.color, "react": b.react, "cuts": cuts}


def _token_view(content: Content, tid: str, t, gm: bool) -> dict:
    base = {"id": tid, "kind": t.kind, "ref": t.ref, "map": t.map, "at": list(t.at)}
    if t.kind == "crew":
        c = content.characters[t.ref]
        base |= {"name": c.short, "role": c.role, "portrait": url(c.portrait), "color": c.color, "mood": "", "note": "", "codex": None}
    else:
        n = content.npcs[t.ref]
        base |= {"name": n.name, "role": n.role, "portrait": url(n.portrait), "color": n.color, "mood": n.mood, "note": n.note, "codex": n.codex, "size": n.size}
        if gm:
            base |= {"gm_note": n.gm_note, "stats": n.stats}  # an NPC's dice are the GM's secret
    if gm:
        base["hidden"] = t.hidden
    return base


def _item_view(it) -> dict:
    return {"id": it.id, "name": it.name, "icon": url(it.icon), "kind": it.kind, "text": it.text, "counted": it.counted, "codex": it.codex}


def _inventory_view(content: Content, entries) -> list[dict]:
    out = []
    for e in entries:
        it = content.items.get(e.item)
        if it:
            out.append({"uid": e.uid, "item": _item_view(it), "count": e.count, "new": e.new})
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
    full = viewer.is_gm or viewer.is_stage or r.by == viewer.seat  # the TV gets public rolls only
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
        "failed": r.failed or phase == "nat1",
    }
    if out["failed"] and r.entry:
        out["entry"] = r.entry  # a failed skill's downside shows for everyone, so everyone knows which skill
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
    """Split party: a player looks at the map their own token stands on. The TV, when it follows one of the crew,
    looks at theirs."""
    who = viewer.char if viewer.role == "player" else state.stage.follow if viewer.is_stage and state.stage.camera == "follow" else None
    if who:
        for t in state.tokens.values():
            if t.kind == "crew" and t.ref == who and not t.hidden:
                return t.map
    return state.party_map


def plays_film(setup: str, viewer: Viewer) -> bool:
    """Which screens play a film: the TV, if there is one; otherwise every laptop, the GM's included."""
    return viewer.is_stage if setup == "tv" else not viewer.is_stage


def _stage_view(state: GameState, content: Content, viewer: Viewer, online: frozenset[str]) -> dict:
    st = state.stage
    out: dict = {"setup": st.setup, "camera": st.camera, "follow": st.follow, "film": None}
    f = st.film
    if f and f.cue in content.cutscenes:
        cue = content.cutscenes[f.cue]
        film: dict = {"at": f.at, "ends": f.ends}
        if plays_film(st.setup, viewer):
            # sound from one device at the table: the TV, or the GM's laptop when there's no TV
            film |= {"src": url(cue.file), "sound": viewer.is_stage or viewer.is_gm or st.setup == "online"}
        if viewer.is_gm:
            film |= {"cue": cue.id, "name": cue.name}
        out["film"] = film
    b = st.burn
    if b and b.char in content.characters and content.characters[b.char].burn:
        burn = content.characters[b.char].burn
        cut = burn.cut(b.cut) or burn.cuts[0]
        out["burn"] = {"char": b.char, "name": burn.name, "color": burn.color, "at": b.at, "ends": b.ends}
        if plays_film(st.setup, viewer):
            out["burn"] |= {"src": url(cut.file), "sound": viewer.is_stage or viewer.is_gm or st.setup == "online"}
    else:
        out["burn"] = None
    if viewer.is_gm:
        out["tv"] = "stage" in online
        out["cues"] = [
            {
                "id": c.id,
                "name": c.name,
                "sub": c.sub,
                "ends": c.ends,
                "still": url(c.still),
                "length": c.length,
                "ready": bool(c.file),
                "played": c.id in st.played,
            }
            for c in content.cutscenes.values()
        ]
    if viewer.is_stage:
        out["films"] = [url(c.file) for c in content.cutscenes.values() if c.file]  # fetched ahead, so a cue starts at once
    return out


def project(state: GameState, content: Content, viewer: Viewer, online: frozenset[str] = frozenset()) -> dict:
    gm = viewer.is_gm
    here = viewer_map(state, viewer)
    map_ids = list(content.maps) if gm else ([here] if here in content.maps else [])
    tokens = {
        tid: _token_view(content, tid, t, gm)
        for tid, t in state.tokens.items()
        if gm or (t.map in map_ids and not t.hidden)
    }
    # a player's own pockets, never anyone else's; the TV has none
    holders = list(content.characters) if gm else [viewer.char] if viewer.char else []
    view = {
        "me": {"seat": viewer.seat, "role": viewer.role, "char": viewer.char},
        "party_map": here,
        "crew": _crew_view(content, state),
        "maps": {m: _map_view(content, state, m, viewer) for m in map_ids},
        "tokens": tokens,
        "inventory": {h: _inventory_view(content, state.inventory.get(h, [])) for h in holders},
        "rolls": _rolls_view(state, viewer, set(tokens)),
        "stage": _stage_view(state, content, viewer, online),
    }
    if gm:
        view["roster"] = [
            {"id": n.id, "name": n.name, "role": n.role, "portrait": url(n.portrait), "color": n.color}
            for n in content.npcs.values()
        ]
        view["presets"] = [{"id": p.id, "name": p.name} for p in content.presets.values()]
        view["items"] = [_item_view(it) for it in content.items.values()]  # the catalogue, for giving
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
