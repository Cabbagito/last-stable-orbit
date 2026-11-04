"""Load and cross-check the YAML content once at boot. Fail loudly on broken references."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from pydantic import ValidationError

from .models import STATS, Character, Item, MapDef, Npc, Preset

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
    for p in sorted((content_dir / "maps").glob("*.yaml")):
        m = _parse(MapDef, _read(p), f"maps/{p.name}")
        c.maps[m.id] = m
    for p in sorted((content_dir / "presets").glob("*.yaml")):
        pr = _parse(Preset, _read(p), f"presets/{p.name}")
        c.presets[pr.id] = pr
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
        for t in pr.tokens:
            pool = c.characters if t.kind == "crew" else c.npcs
            if t.ref not in pool:
                problems.append(f"{where}: token ref {t.ref!r} is not a known {t.kind}")
            if t.map not in c.maps:
                problems.append(f"{where}: token {t.ref} on unknown map {t.map!r}")
        for holder, items in pr.inventory.items():
            if holder not in c.characters:
                problems.append(f"{where}: inventory holder {holder!r} is not a character")
            problems += [f"{where}: unknown item {i!r}" for i in items if i not in c.items]
        problems += [f"{where}: vitals for unknown character {k!r}" for k in pr.vitals if k not in c.characters]
    if problems:
        raise ContentError("content references are broken:\n  " + "\n  ".join(problems))


def asset_paths(c: Content) -> set[str]:
    paths: set[str] = set()
    for ch in c.characters.values():
        paths.add(ch.portrait)
        paths |= {e.icon for e in ch.entries if e.icon}
    paths |= {n.portrait for n in c.npcs.values()}
    paths |= {i.icon for i in c.items.values()}
    for m in c.maps.values():
        for mood in m.moods:
            paths.add(mood.base)
            if mood.glow:
                paths.add(mood.glow)
        paths |= {o.src for o in m.overlays}
    return paths
