"""Load and cross-check the YAML content once at boot. Fail loudly on broken references."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from pydantic import ValidationError

from .models import CODEX_SECTIONS, STATS, Character, CodexEntry, CodexSection, Cutscene, Item, MapDef, Npc, Overview, Preset, PresetItem, SlotsGame, Station

log = logging.getLogger("lso.content")


class ContentError(RuntimeError):
    pass


@dataclass
class Content:
    characters: dict[str, Character] = field(default_factory=dict)
    npcs: dict[str, Npc] = field(default_factory=dict)
    items: dict[str, Item] = field(default_factory=dict)
    maps: dict[str, MapDef] = field(default_factory=dict)
    presets: dict[str, Preset] = field(default_factory=dict)
    insults: dict[str, list[str]] = field(default_factory=dict)  # "any" plus one pool per stat
    cutscenes: dict[str, Cutscene] = field(default_factory=dict)  # in the order the GM will use them
    codex: dict[str, CodexEntry] = field(default_factory=dict)  # in reading order within each section
    codex_sections: list[CodexSection] = field(default_factory=list)  # the landing's five rows, in order
    station: Station | None = None  # the Station tab's cross-section
    overviews: dict[str, Overview] = field(default_factory=dict)  # little games the GM sends to players' screens
    slots: SlotsGame | None = None  # the slot machines' rules
    missing_assets: list[str] = field(default_factory=list)

    @property
    def default_preset(self) -> Preset:
        marked = [p for p in self.presets.values() if p.default]
        if len(marked) != 1:
            raise ContentError("exactly one preset needs `default: true`")
        return marked[0]


def _read(path: Path):
    try:
        return yaml.safe_load(path.read_text()) or []
    except yaml.YAMLError as e:
        raise ContentError(f"{path}: {e}") from e


def _parse(model, raw, where: str):
    try:
        return model.model_validate(raw)
    except ValidationError as e:
        raise ContentError(f"{where}: {e}") from e


def _by_id(model, rows, where: str) -> dict:
    out = {}
    for i, raw in enumerate(rows):
        obj = _parse(model, raw, f"{where}[{i}]")
        if obj.id in out:
            raise ContentError(f"{where}: duplicate id {obj.id!r}")
        out[obj.id] = obj
    return out


def load_content(content_dir: Path, assets_dir: Path | None = None) -> Content:
    c = Content()
    c.characters = _by_id(Character, _read(content_dir / "characters.yaml"), "characters.yaml")
    c.npcs = _by_id(Npc, _read(content_dir / "npcs.yaml"), "npcs.yaml")
    c.items = _by_id(Item, _read(content_dir / "items.yaml"), "items.yaml")
    maps = [_parse(MapDef, _read(p), f"maps/{p.name}") for p in sorted((content_dir / "maps").glob("*.yaml"))]
    for m in sorted(maps, key=lambda m: m.order):
        if m.id in c.maps:
            raise ContentError(f"maps: duplicate id {m.id!r}")
        c.maps[m.id] = m
    for p in sorted((content_dir / "presets").glob("*.yaml")):
        pr = _parse(Preset, _read(p), f"presets/{p.name}")
        c.presets[pr.id] = pr
    cut = content_dir / "cutscenes.yaml"
    c.cutscenes = _by_id(Cutscene, _read(cut), "cutscenes.yaml") if cut.is_file() else {}
    cdx = content_dir / "codex.yaml"
    if cdx.is_file():
        raw = _read(cdx) or {}
        if not isinstance(raw, dict):
            raise ContentError("codex.yaml: expected sections and entries")
        c.codex_sections = [_parse(CodexSection, r, f"codex.yaml sections[{i}]") for i, r in enumerate(raw.get("sections") or [])]
        c.codex = _by_id(CodexEntry, raw.get("entries") or [], "codex.yaml entries")
    stn = content_dir / "station.yaml"
    if stn.is_file():
        c.station = _parse(Station, _read(stn), "station.yaml")
    ov = content_dir / "overviews.yaml"
    c.overviews = _by_id(Overview, _read(ov), "overviews.yaml") if ov.is_file() else {}
    sl = content_dir / "slots.yaml"
    if sl.is_file():
        try:
            c.slots = SlotsGame.model_validate(_read(sl))
        except ValidationError as e:
            raise ContentError(f"slots.yaml: {e}") from e
    ins = content_dir / "insults.yaml"
    c.insults = _insults((_read(ins) or {}) if ins.is_file() else {})
    if clash := set(c.characters) & set(c.npcs):
        raise ContentError(f"ids used by both a character and an NPC: {clash}")
    check_refs(c)
    if assets_dir is not None:
        c.missing_assets = [a for a in sorted(asset_paths(c)) if not (assets_dir / a).is_file()]
        for a in c.missing_assets:
            log.warning("missing asset: %s", a)
    return c


def _insults(raw) -> dict[str, list[str]]:
    if not isinstance(raw, dict):
        raise ContentError("insults.yaml: expected a mapping of stat -> list of lines")
    allowed = {"any", *STATS}
    out: dict[str, list[str]] = {}
    for k, lines in raw.items():
        if k not in allowed:
            raise ContentError(f"insults.yaml: unknown key {k!r} (use any, {', '.join(STATS)})")
        if not isinstance(lines, list) or not all(isinstance(x, str) and x.strip() for x in lines):
            raise ContentError(f"insults.yaml: {k} must be a list of lines")
        out[k] = [x.strip() for x in lines]
    return out


def check_refs(c: Content) -> None:
    problems: list[str] = []
    c.default_preset  # noqa: B018 - raises if not exactly one
    if c.slots and c.slots.currency not in c.items:
        problems.append(f"slots: unknown currency {c.slots.currency!r}")
    if c.slots:
        problems += [f"slots: unknown audit character {a!r}" for a in c.slots.audit if a not in c.characters]
    if not c.slots:
        problems += [f"map {m.id}: object {o.id} is a game, but there's no slots.yaml" for m in c.maps.values() for o in m.objects if o.game]
    for pr in c.presets.values():
        where = f"preset {pr.id}"
        if pr.party_map not in c.maps:
            problems.append(f"{where}: unknown party_map {pr.party_map!r}")
        for map_id, ms in pr.maps.items():
            m = c.maps.get(map_id)
            if not m:
                problems.append(f"{where}: unknown map {map_id!r}")
                continue
            if ms.mood not in {x.id for x in m.moods}:
                problems.append(f"{where}: map {map_id} has no mood {ms.mood!r}")
            for sw, val in ms.switches.items():
                d = m.switch(sw)
                if not d or not 0 <= val <= (1 if d.type == "bool" else d.max):
                    problems.append(f"{where}: bad switch {map_id}.{sw}={val}")
            problems += [f"{where}: map {map_id} has no object {o!r}" for o in ms.shown if not m.object(o)]
        for t in pr.tokens:
            pool = c.characters if t.kind == "crew" else c.npcs
            if t.ref not in pool:
                problems.append(f"{where}: token ref {t.ref!r} is not a known {t.kind}")
            if t.map not in c.maps:
                problems.append(f"{where}: token {t.ref} on unknown map {t.map!r}")
        for holder, entries in pr.inventory.items():
            if holder not in c.characters:
                problems.append(f"{where}: inventory holder {holder!r} is not a character")
            counted: set[str] = set()
            for e in entries:
                item_id = e.item if isinstance(e, PresetItem) else e
                it = c.items.get(item_id)
                if not it:
                    problems.append(f"{where}: unknown item {item_id!r}")
                elif it.counted != isinstance(e, PresetItem):
                    problems.append(
                        f"{where}: {holder}'s {item_id} needs " + ("{item, count}" if it.counted else "no count, it isn't counted")
                    )
                elif it.counted and item_id in counted:
                    problems.append(f"{where}: {holder} holds {item_id} twice; give one count instead")
                else:
                    counted |= {item_id} if it.counted else set()
        problems += [f"{where}: vitals for unknown character {k!r}" for k in pr.vitals if k not in c.characters]
        problems += [
            f"{where}: {k} has {v.hp} health, more than their {c.characters[k].health}"
            for k, v in pr.vitals.items()
            if k in c.characters and v.hp > c.characters[k].health
        ]
    for m in c.maps.values():
        if m.arrive and len(m.arrive) < len(c.characters):
            problems.append(f"map {m.id}: arrive has {len(m.arrive)} spots for {len(c.characters)} crew")
    for cue in c.cutscenes.values():
        if not cue.sets:
            continue
        where, st = f"cutscene {cue.id}", cue.sets
        m = c.maps.get(st.map)
        if not m:
            problems.append(f"{where}: unknown map {st.map!r}")
            continue
        if st.mood and st.mood not in {x.id for x in m.moods}:
            problems.append(f"{where}: map {st.map} has no mood {st.mood!r}")
        for sw, val in st.switches.items():
            d = m.switch(sw)
            if not d or not 0 <= val <= (1 if d.type == "bool" else d.max):
                problems.append(f"{where}: bad switch {st.map}.{sw}={val}")
        problems += [f"{where}: token ref {t.ref!r} is not an NPC" for t in st.tokens if t.ref not in c.npcs]
        problems += [f"{where}: token id {t.id!r} is a crew member's" for t in st.tokens if t.id in c.characters]
    problems += _codex_problems(c)
    if c.station:
        problems += [f"station.yaml: unknown map {m!r}" for p in c.station.places for m in [p.map, *p.also] if m not in c.maps]
    places = {p.map for p in c.station.places} if c.station else set()
    for pr in c.presets.values():
        problems += [f"preset {pr.id}: station {m!r} isn't a place on the Station" for m in pr.station if m not in places]
    if problems:
        raise ContentError("content references are broken:\n  " + "\n  ".join(problems))


def codex_keys(c: Content) -> set[str]:
    """Everything the GM can unlock: each entry, and each locked block as "entry/block"."""
    return set(c.codex) | {f"{e.id}/{b.id}" for e in c.codex.values() for b in e.blocks if b.locked}


def _codex_problems(c: Content) -> list[str]:
    problems: list[str] = []
    if c.codex and [s.id for s in c.codex_sections] != list(CODEX_SECTIONS):
        problems.append(f"codex.yaml: sections must be {', '.join(CODEX_SECTIONS)}, in that order")
    for e in c.codex.values():
        where = f"codex entry {e.id}"
        problems += [f"{where}: see also {s!r} isn't an entry" for s in e.see if s not in c.codex]
        if e.crew and e.crew not in c.characters:
            problems.append(f"{where}: unknown crew {e.crew!r}")
        if e.npc and e.npc not in c.npcs:
            problems.append(f"{where}: unknown NPC {e.npc!r}")
        if e.item and e.item not in c.items:
            problems.append(f"{where}: unknown item {e.item!r}")
        if not (e.name or e.crew or e.npc or e.item):
            problems.append(f"{where}: needs a name")
    crew_pages = [e.crew for e in c.codex.values() if e.crew]
    if len(crew_pages) != len(set(crew_pages)):
        problems.append("codex: a crew member has two pages")
    # what the Scene's Codex buttons point at
    refs = [(f"NPC {n.id}", n.codex) for n in c.npcs.values()] + [(f"item {i.id}", i.codex) for i in c.items.values()]
    refs += [(f"map {m.id} object {o.id}", o.codex) for m in c.maps.values() for o in m.objects]
    problems += [f"{who}: codex {ref!r} isn't an entry" for who, ref in refs if ref and ref not in c.codex]
    keys = codex_keys(c)
    for pr in c.presets.values():
        problems += [f"preset {pr.id}: codex {k!r} isn't an entry or a locked block" for k in pr.codex if k not in keys]
    return problems


def asset_paths(c: Content) -> set[str]:
    paths: set[str] = set()
    for ch in c.characters.values():
        paths.add(ch.portrait)
        paths |= {e.icon for e in ch.entries if e.icon}
        if ch.burn:
            paths.add(ch.burn.icon)
            paths |= {x.file for x in ch.burn.cuts}
    paths |= {n.portrait for n in c.npcs.values()}
    paths |= {i.icon for i in c.items.values()}
    for m in c.maps.values():
        for mood in m.moods:
            paths.add(mood.base)
            if mood.glow:
                paths.add(mood.glow)
        paths |= {o.src for o in m.overlays}
        paths |= {d.src for d in m.decals}
    for cue in c.cutscenes.values():
        paths |= {p for p in (cue.file, cue.still) if p}
    for sec in c.codex_sections:
        paths |= {t.src for t in sec.tiles + sec.strip}
    if c.station:
        paths |= {c.station.art, c.station.hole} | {p.lit for p in c.station.places}
    for e in c.codex.values():
        paths.add(e.art.src)
        paths |= {r.icon for r in e.rows if r.icon} | {s.src for s in e.shots}
    for o in c.overviews.values():
        paths |= {p for p in (o.device, o.mask) if p}
    if c.slots:
        paths |= set(c.slots.art.model_dump().values())
    return paths
