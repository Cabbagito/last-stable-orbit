"""project(): the ONLY way state leaves the server.

Every frame a client receives is built here for that viewer. A player gets:
- the one map they are on (their own token's map, else the party map), and only that map's art;
- the objects on it the GM has revealed (a mural, the slot machines), each marked with whether they've inspected it;
- the tokens on that map that aren't hidden, with each NPC's public card (never its gm_note or its dice);
- every crew member's public sheet and vitals (the crew rail shows them);
- their own inventory only, with each item's text (clues are items, so this is where they hide);
- each crew member's latest roll, and the latest roll of each NPC they can see, its dice only as they land on the
  roller's screen. The GM's roll modes (Round 17) filter the rest, see _rolls_view and _roll_view: Secret never
  arrives, a sealed roll (Hidden, Someone) never says how it came out, and God names only an NPC this viewer can see. Just a die's God roll has its number unless it's sealed.
The GM gets everything, plus the NPC roster, the presets, the item catalogue and the cue list.

The slots: anyone who can see the machines sees how many seats are taken and whether they work. What happens at a
machine goes only to the player sitting at it, never to the GM. The rates go only to whoever can audit them. The TV
hears of the flood, and of nothing else.

Each map also carries its decals and camera cones (everyone sees those). Only the GM gets its pins, the Key
board's "what's where".

The TV (the Stage seat) gets what a player gets with no seat: the party map (or, following one of the crew, the
map they're on), its visible tokens and revealed
objects, the crew's public sheets, and no pockets at all. It sees a roll as a player does. And it gets every film's
file, to have them ready, because only the TV plays films.

The Codex: a player gets only the entries the GM has unlocked, and on each page only the blocks that are open.
A locked entry's id, name and art never leave the server: not in the Codex, not in See also, not on a Codex button
in the Scene. Pages never list what anyone carries. The TV gets no Codex. The GM gets every entry, marked.

The Station: everyone but the TV gets all of Ergo's places, but a place the crew hasn't been to (and the GM hasn't
shown) is dark: no lit overlay and no map preview, and the core goes by "The core". Players see where each of the
crew stands, but only on lit places, and never a hidden token.

Films: only the TV gets the files and plays them, with all the sound. A player's laptop gets only when a film
starts and ends, and shows the opening's waiting loop meanwhile. A Burn's film plays on the TV too, but the laptops never go
dark for one: they get who is burning (not the file) and stay on the game, with the Burn's mark on the burner's
token and rail ring.

The opening: only the TV gets the film, the sound and the timing. While it's on, a player's feed has only the waiting
loop and its still, and their laptop shows that and nothing else until the film ends.
"""

from __future__ import annotations

from . import rules
from .auth import Viewer
from .content import Content
from .models import GameState, RollState

ASSET_PREFIX = "/assets/"


def url(path: str | None) -> str | None:
    return ASSET_PREFIX + path if path else None


def codex_open(state: GameState, content: Content, viewer: Viewer) -> set[str]:
    """The Codex entries this viewer may know exist."""
    if viewer.is_gm:
        return set(content.codex)
    if viewer.is_stage:
        return set()
    return {k for k in state.codex if k in content.codex}


def _link(entry: str | None, open_: set[str]) -> str | None:
    return entry if entry in open_ else None


def _slots_card(state: GameState, content: Content, key: str) -> dict:
    """What a slot machine's card shows anyone who can see it: how full it is, and whether it works. Who's sitting
    there, and what they've lost, stays out of it."""
    bank = state.slots.get(key)
    return {"kind": "slots", "seats": content.slots.seats, "taken": len(bank.seats) if bank else 0, "pull": content.slots.pull, "out": bool(bank and bank.out)}


def _objects_view(state: GameState, content: Content, d, ms, viewer: Viewer, open_: set[str]) -> list[dict]:
    """Players get only what the GM has revealed, each marked with whether they've inspected it."""
    shown = set(ms.shown) if ms else set()
    seen = set(state.seen.get(viewer.char or "", []))
    out = []
    for o in d.objects:
        if not viewer.is_gm and o.id not in shown:
            continue
        v = {"id": o.id, "name": o.name, "at": list(o.at), "text": o.text, "closeup": list(o.closeup) if o.closeup else None, "codex": _link(o.codex, open_)}
        v |= {"shown": o.id in shown} if viewer.is_gm else {"seen": f"{d.id}/{o.id}" in seen}
        if o.game == "slots" and content.slots:
            v["game"] = _slots_card(state, content, f"{d.id}/{o.id}")
            if v["game"]["out"]:
                v["text"] = content.slots.out_text
        out.append(v)
    return out


def _map_view(content: Content, state: GameState, map_id: str, viewer: Viewer, open_: set[str]) -> dict:
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
            "cones": [{"mood": c.mood, "pts": d.cameras.polygon(c)} for c in d.cameras.cones],
        }
        if d.cameras
        else None,
        "feed": d.feed.model_dump() if d.feed else None,
        "mood": ms.mood if ms else d.moods[0].id,
        "values": dict(ms.switches) if ms else {},
        "objects": _objects_view(state, content, d, ms, viewer, open_),
    }
    if viewer.is_gm:
        out["pins"] = [p.model_dump() for p in d.pins]  # the Key board's "what's where", for the GM's eyes only
        out["arrive"] = bool(d.arrive)
    return out


def _crew_view(content: Content, state: GameState, viewer: Viewer) -> list[dict]:
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
                "burn": _burn_view(c.burn, viewer),
            }
        )
    return out


def _burn_view(b, viewer: Viewer) -> dict | None:
    """A Burn is public, like the skills. Only the TV gets its films, and has them all ready."""
    if not b:
        return None
    cuts = [{"id": x.id, "label": x.label, "length": x.length} | ({"src": url(x.file)} if viewer.is_stage else {}) for x in b.cuts]
    return {"name": b.name, "when": b.when, "text": b.text, "icon": url(b.icon), "color": b.color, "react": b.react, "cuts": cuts}


def crew_page(content: Content, char: str) -> str | None:
    return next((e.id for e in content.codex.values() if e.crew == char), None)


def _token_view(content: Content, tid: str, t, gm: bool, open_: set[str]) -> dict:
    base = {"id": tid, "kind": t.kind, "ref": t.ref, "map": t.map, "at": list(t.at)}
    if t.kind == "crew":
        c = content.characters[t.ref]
        page = _link(crew_page(content, c.id), open_)
        base |= {"name": c.short, "role": c.role, "portrait": url(c.portrait), "color": c.color, "mood": "", "note": "", "codex": page}
    else:
        n = content.npcs[t.ref]
        base |= {"name": n.name, "role": n.role, "portrait": url(n.portrait), "color": n.color, "mood": n.mood, "note": n.note, "codex": _link(n.codex, open_), "size": n.size}
        if gm:
            base |= {"gm_note": n.gm_note, "stats": n.stats}  # an NPC's dice are the GM's secret
            base |= {"hp": n.health if t.hp is None else t.hp, "health": n.health}  # and so is its health, outside a fight
    if gm:
        base["hidden"] = t.hidden
    return base


def _item_view(it, open_: set[str]) -> dict:
    return {"id": it.id, "name": it.name, "icon": url(it.icon), "kind": it.kind, "text": it.text, "counted": it.counted, "codex": _link(it.codex, open_)}


def _inventory_view(content: Content, entries, open_: set[str]) -> list[dict]:
    out = []
    for e in entries:
        it = content.items.get(e.item)
        if it:
            out.append({"uid": e.uid, "item": _item_view(it, open_), "count": e.count, "new": e.new})
    return out


def _art(a) -> dict:
    return {**a.placed(), "src": url(a.src)}


def _entry_view(state: GameState, content: Content, e, viewer: Viewer, open_: set[str]) -> dict:
    """One page as this viewer may read it: only its open blocks, and See also only to entries they can open."""
    gm = viewer.is_gm
    read = set(state.codex_read.get(viewer.char or "", []))

    def bkey(b):
        return f"{e.id}/{b.id}"

    blocks = []
    for b in e.blocks:
        unlocked = not b.locked or bkey(b) in state.codex
        if not unlocked and not gm:
            continue
        v = {"id": b.id, "h": b.h, "text": b.text}
        if gm:
            v |= {"locked": b.locked, "unlocked": unlocked}
        else:
            v["new"] = b.locked and bkey(b) not in read
        blocks.append(v)
    name, role = e.name, e.role
    out: dict = {
        "id": e.id,
        "sec": e.sec,
        "label": e.label,
        "sub": e.sub,
        "art": _art(e.art),
        "lead": e.lead,
        "quote": e.quote,
        "blocks": blocks,
        "rows_label": e.rows_label,
        "rows": [{"icon": url(r.icon), "n": r.n, "d": r.d} for r in e.rows],
        "facts": [list(f) for f in e.facts],
        "shots_label": e.shots_label,
        "shots": [{"src": url(x.src), "cap": x.cap, "pos": x.pos} for x in e.shots],
        "crew": None,
        "npc": None,
    }
    if e.crew:
        c = content.characters[e.crew]
        name, role = name or c.name, role or c.role
        out["crew"] = {
            "id": c.id,
            "stats": c.stats,
            "health": c.health,
            "color": c.color,
            "skills": [{"icon": url(k.icon), "name": k.name, "text": k.text, "downside": k.downside} for k in c.entries],
            "burn": {"name": c.burn.name, "when": c.burn.when, "text": c.burn.text, "icon": url(c.burn.icon)} if c.burn else None,
        }
    elif e.npc:
        n = content.npcs[e.npc]
        name, role = name or n.name, role or n.role
        out["npc"] = {"mood": n.mood}
    elif e.item:
        it = content.items[e.item]
        name = name or it.name
    out |= {"name": name, "role": role}
    if gm:
        out["unlocked"] = e.id in state.codex
    else:
        out["new"] = e.id not in read or any(b.get("new") for b in blocks)
    return out


def _station_view(state: GameState, content: Content, viewer: Viewer) -> dict | None:
    st = content.station
    if viewer.is_stage or not st:
        return None
    gm = viewer.is_gm
    lit = set(state.station)
    places = []
    for p in st.places:
        on = p.map in lit
        known = on or gm  # the GM always sees what it is
        m = content.maps[p.map]
        v = {
            "id": p.map,
            "name": p.name if known or not p.dark_name else p.dark_name,
            "where": p.where,
            "blurb": p.blurb,
            "tags": [{"x": t.x, "y": t.y, "text": t.text if known or not t.dark else t.dark} for t in p.tags],
            "chip": list(p.chip),
            "hots": [list(h) for h in p.hots],
            "lit": on,
            "overlay": url(p.lit) if known else None,
            "preview": url(m.moods[0].base) if known else None,
        }
        places.append(v)
    crew = []
    for t in state.tokens.values():
        if t.kind != "crew" or t.map not in {p.map for p in st.places}:
            continue
        if gm or (not t.hidden and t.map in lit):
            crew.append({"char": t.ref, "map": t.map} | ({"hidden": t.hidden} if gm else {}))
    order = list(content.characters)
    crew.sort(key=lambda c: order.index(c["char"]))
    labels = [x.model_dump() for x in st.labels]
    return {"art": url(st.art), "hole": url(st.hole), "labels": labels, "places": places, "crew": crew}


def _codex_view(state: GameState, content: Content, viewer: Viewer, open_: set[str]) -> dict | None:
    if viewer.is_stage or not content.codex:
        return None
    entries = [_entry_view(state, content, e, viewer, open_) for e in content.codex.values() if e.id in open_]
    by_id = {x["id"]: x for x in entries}
    for x, e in zip(entries, (content.codex[x["id"]] for x in entries)):
        x["see"] = [{"id": s, "name": by_id[s]["name"], "art": by_id[s]["art"]} for s in e.see if s in by_id]
    sections = []
    for sec in content.codex_sections:
        mine = [x for x in entries if x["sec"] == sec.id]
        tile = lambda t: {"src": url(t.src), "l": t.l, "t": t.t, "w": t.w}  # noqa: E731
        sections.append(
            {
                "id": sec.id,
                "name": sec.name,
                "short": sec.short,
                "tiles": [tile(t) for t in sec.tiles],
                "strip": [tile(t) for t in (sec.strip or sec.tiles)],
                "count": len(mine),
                "new": sum(1 for x in mine if x.get("new")),
            }
        )
    return {"sections": sections, "entries": entries}


def roll_phase(r: RollState) -> str:
    """How a roll stands: still rolling, exploded and rolling again, or landed."""
    n = len(r.dice)
    if r.shown == 0:
        return "roll"
    if r.shown < n:
        return "boom"
    if rules.is_nat1(r.dice):
        return "nat1"
    return "push" if r.pushes else "land"


def _gm_tag(state: GameState, r: RollState) -> str:
    """What the GM's own banner calls one of their rolls. Public has no tag."""
    if r.by != "gm":
        return ""
    if r.god:
        return "GOD · HIDDEN" if r.sealed else "GOD"
    if r.hidden:
        return "SECRET"
    if not r.sealed:
        return ""
    t = state.tokens.get(r.token) if r.token else None
    return "HIDDEN" if t and not t.hidden else "SOMEONE"


def _roll_view(state: GameState, r: RollState, viewer: Viewer, visible_tokens: set[str]) -> dict:
    full = viewer.is_gm or r.by == viewer.seat
    crew_token = next((tid for tid, t in state.tokens.items() if t.kind == "crew" and t.ref == r.char), None) if r.char else None
    token = crew_token if r.char else r.token
    seen = token in visible_tokens
    # a sealed roll says it happened and what kind it was: never its dice, how many, a natural 1, or an explosion
    sealed = not full and (r.sealed or (r.god and token is not None and not seen))
    phase = roll_phase(r)
    if sealed:
        phase = "seal" if r.shown >= len(r.dice) else "roll"
    out = {
        "id": r.id,
        "by": r.by,
        "char": r.char,
        "token": token if seen else None,
        "stat": r.stat,
        "sides": 20 if sealed and r.stat is None else r.sides,  # just a die shows nothing about the die
        "phase": phase,
        "open": r.open,
        "pushes": r.pushes,
        "pushed": r.pushed,
        "failed": r.failed or phase == "nat1",
        "sealed": sealed,
        "god": r.god,
        "started": r.started,  # a God roll's die hits at one moment on every screen
    }
    if r.entry:
        out["entry"] = r.entry  # the banner says which skill, and a failed one's downside shows for everyone
    if phase == "boom":
        out["chain"] = sum(r.dice[: r.shown])
    elif phase == "nat1":
        out |= {"value": 1, "count": len(r.dice), "insult": r.insult}  # it fails, whatever the bonus: everyone sees the red 1
    elif phase in ("land", "push"):
        out |= {"value": rules.total(r.dice, r.bonus, r.pushed), "count": len(r.dice)}
        if len(r.dice) > 1:
            out["chain"] = sum(r.dice[:-1])
    if full:
        out |= {
            "dice": list(r.dice),
            "bonus": r.bonus,
            "seed": r.seed,
            "insult": r.insult,
            "handle": r.handle,
            "shown": r.shown,
            "hidden": r.hidden,
        }
    if viewer.is_gm:
        out["tag"] = _gm_tag(state, r)
    return out


def _rolls_view(state: GameState, viewer: Viewer, visible_tokens: set[str]) -> list[dict]:
    if viewer.is_gm:
        return [_roll_view(state, r, viewer, visible_tokens) for r in state.rolls]
    here = viewer_map(state, viewer)
    latest: dict[str, RollState] = {}  # one per crew member or NPC token: their newest roll
    for r in state.rolls:
        if r.hidden:
            continue  # Secret
        if r.char is None and r.token not in visible_tokens and not r.god:
            t = state.tokens.get(r.token) if r.token else None
            if not (r.sealed and t and t.map == here):
                continue  # an NPC this player can't see, unless it's Someone in the room with them
        who = r.char or r.token or "die"
        latest.pop(who, None)  # kept in the order they rolled: the last one here is the newest of all
        latest[who] = r
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


def _stage_view(state: GameState, content: Content, viewer: Viewer, online: frozenset[str], join: dict | None) -> dict:
    st = state.stage
    out: dict = {"camera": st.camera, "follow": st.follow, "film": None}
    if join and (viewer.is_gm or viewer.is_stage):  # the wifi password: never on a player's feed
        out["join"] = join | {"show": st.join}
    f, game = st.film, content.opening
    if f and f.cue in content.cutscenes:
        cue = content.cutscenes[f.cue]
        film: dict = {"at": f.at, "ends": f.ends}
        if viewer.is_stage:
            film["src"] = url(cue.file)
        if viewer.is_gm:
            film |= {"cue": cue.id, "name": cue.name}
        if viewer.char and game:  # the waiting loop, to look at meanwhile: nothing about this film
            film |= {"loop": url(game.loop), "still": url(game.still)}
        out["film"] = film
    o = st.opening
    if o and game and viewer.char:
        out["held"] = {"loop": url(game.loop), "still": url(game.still)}
    elif viewer.is_stage or viewer.is_gm:
        times = {"loop_at": o.loop_at, "film_at": o.film_at, "ends": o.ends} if o and game else None
        out["opening"] = times | {"loop": url(game.loop), "film": url(game.film), "audio": url(game.audio), "still": url(game.still)} if times and viewer.is_stage else times
    if viewer.is_gm and game:
        out["opening_film"] = {"name": game.name, "sub": game.sub, "still": url(game.still), "length": game.length}
    b = st.burn
    if b and b.char in content.characters and content.characters[b.char].burn:
        burn = content.characters[b.char].burn
        cut = burn.cut(b.cut) or burn.cuts[0]
        out["burn"] = {"char": b.char, "name": burn.name, "color": burn.color, "at": b.at, "ends": b.ends}
        if viewer.is_stage:
            out["burn"]["src"] = url(cut.file)
    else:
        out["burn"] = None
    if viewer.is_stage and st.flood and content.slots:  # only the TV plays it
        art = content.slots.art
        out["flood"] = {"at": st.flood.at, "ends": st.flood.ends, "paid": st.flood.paid, "art": {"lit_a": url(art.lit_a), "lit_b": url(art.lit_b), "crank_up": url(art.crank_up), "coin": url(art.coin)}}
    if viewer.is_gm:
        out["tv"] = "stage" in online
        out["cues"] = [
            {
                "id": c.id,
                "name": c.name,
                "act": c.act,
                "sub": c.sub,
                "ends": c.ends,
                "still": url(c.still),
                "length": c.length,
                "ready": bool(c.file),
            }
            for c in content.cutscenes.values()
        ]
    if viewer.is_stage:
        out["films"] = [url(c.file) for c in content.cutscenes.values() if c.file]  # fetched ahead, so a cue starts at once
    return out


def _place_name(state: GameState, content: Content, map_id: str, viewer: Viewer) -> str:
    """A map's name, as the Station tells it: a dark place keeps its dark name for anyone but the GM."""
    name = content.maps[map_id].name
    if viewer.is_gm or not content.station or map_id in state.station:
        return name
    p = next((p for p in content.station.places if p.map == map_id), None)
    return p.dark_name if p and p.dark_name else name


def _fights_view(state: GameState, content: Content, viewer: Viewer, here: str) -> list[dict]:
    """M8. The GM gets every fight; a player only the fight on the map they're looking at; the TV every fight, one row
    each. A hidden token is never anyone's but the GM's to see.
    An NPC's health goes out only here, while it's in a fight; its dice and notes never do."""
    gm, tv = viewer.is_gm, viewer.is_stage
    maps = [m for m in content.maps if m in state.fights]
    if not gm and not tv:
        maps = [m for m in maps if m == here]
    elif tv:
        maps.sort(key=lambda m: m != here)  # the map the TV shows comes first
    out = []
    for m in maps:
        f = state.fights[m]
        fighters = []
        for tid in f.order:
            t = state.tokens.get(tid)
            if t is None or (t.hidden and not gm):
                continue
            if t.kind == "crew":
                c = content.characters[t.ref]
                v = state.vitals.get(c.id)
                d = {"name": c.short, "portrait": url(c.portrait), "color": c.color, "hp": v.hp if v else c.health, "health": c.health}
            else:
                n = content.npcs[t.ref]
                d = {"name": n.name, "portrait": url(n.portrait), "color": n.color, "hp": n.health if t.hp is None else t.hp, "health": n.health}
            d |= {"token": tid, "kind": t.kind, "ref": t.ref, "ini": f.ini.get(tid, 0), "joined": f.joined.get(tid, f.started)}
            fighters.append(d)
        seen = {x["token"] for x in fighters}
        cur = f.order[f.turn] if f.order else None
        v = {
            "map": m,
            "name": _place_name(state, content, m, viewer),
            "fighters": fighters,
            "round": f.round,
            "now": cur if cur in seen else None,
            "rolled": [x for x in f.rolled if x in seen],
            "started": f.started,
        }
        out.append(v)
    return out


def _overview_view(state: GameState, content: Content, viewer: Viewer) -> dict | None:
    """The overview open on this player's screen, whole: how it scores is no secret, and nothing comes back. Only
    the player it was sent to gets it; the GM sees who has one open, the TV and the other players nothing."""
    o = state.overviews.get(viewer.char) if viewer.char else None
    ov = content.overviews.get(o.kind) if o else None
    if not ov:
        return None
    return {**ov.model_dump(), "kind": ov.id, "id": o.id, "device": url(ov.device), "mask": url(ov.mask)}


def _slots_view(state: GameState, content: Content, viewer: Viewer) -> dict | None:
    """The machine this player is sitting at. Theirs alone: nobody else, the GM included, hears how it's going."""
    game = content.slots
    if not game or not viewer.char:
        return None
    for key, bank in state.slots.items():
        x = next((x for x in bank.seats if x.char == viewer.char), None)
        if x:
            return {
                "unit": x.unit,
                "page": x.page,
                "pulls": x.pulls,
                "free": x.free,
                "payout": x.payout,
                "reels": x.reels,
                "spin": x.spin,
                "near": x.near,
                "line": x.line,
                "pull": game.pull,
                "window": game.window,
                "until": bank.until if x.page == "wait" else None,
                "art": {k: url(v) for k, v in game.art.model_dump().items()},
                "audit": {"paid_back": game.paid_back, "window": game.window} if x.char in game.audit else None,
            }
    return None


def project(state: GameState, content: Content, viewer: Viewer, online: frozenset[str] = frozenset(), join: dict | None = None, bench: dict | None = None) -> dict:
    gm = viewer.is_gm
    here = viewer_map(state, viewer)
    open_ = codex_open(state, content, viewer)
    map_ids = list(content.maps) if gm else ([here] if here in content.maps else [])
    tokens = {
        tid: _token_view(content, tid, t, gm, open_)
        for tid, t in state.tokens.items()
        if gm or (t.map in map_ids and not t.hidden)
    }
    # a player's own pockets, never anyone else's; the TV has none
    holders = list(content.characters) if gm else [viewer.char] if viewer.char else []
    view = {
        "me": {"seat": viewer.seat, "role": viewer.role, "char": viewer.char},
        "party_map": here,
        "crew": _crew_view(content, state, viewer),
        "maps": {m: _map_view(content, state, m, viewer, open_) for m in map_ids},
        "tokens": tokens,
        "inventory": {h: _inventory_view(content, state.inventory.get(h, []), open_) for h in holders},
        "codex": _codex_view(state, content, viewer, open_),
        "station": _station_view(state, content, viewer),
        "rolls": _rolls_view(state, viewer, set(tokens)),
        "stage": _stage_view(state, content, viewer, online, join),
        "fights": _fights_view(state, content, viewer, here),
        "overview": _overview_view(state, content, viewer),
        "slots": _slots_view(state, content, viewer),
    }
    if gm:
        view["roster"] = [
            {"id": n.id, "name": n.name, "role": n.role, "group": n.group, "portrait": url(n.portrait), "color": n.color}
            for n in content.npcs.values()
        ]
        view["map_groups"] = [{"title": g.title, "maps": [{"id": e.map, "under": e.under} for e in g.entries()]} for g in content.map_groups]
        if bench is not None:
            view["bench"] = bench  # the sandbox's, and only ever the GM's
        view["presets"] = [{"id": p.id, "name": p.name, "session": p.session, "blurb": p.blurb, "card": url(p.card)} for p in content.presets.values()]
        view["items"] = [_item_view(it, open_) for it in content.items.values()]  # the catalogue, for giving
        view["overviews"] = {  # the Events section: what can be sent, and whose screen has one open now
            "games": [{"id": o.id, "name": o.name} for o in content.overviews.values()],
            "open": {c: {"kind": o.kind, "id": o.id} for c, o in state.overviews.items()},
        }
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
