"""Content (read-only YAML) and game state models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

STATS = ("body", "reflex", "tech", "intel", "cool", "empathy")
DIE_SIDES = (4, 6, 8, 10, 12, 20)
HP_MAX = 6
ENTROPY_MAX = 6

Vec3 = tuple[float, float, float]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------- content


class ListEntry(Strict):
    """A skill or a piece of chrome. Both sit in one list and use the same one-per-roll pick."""

    name: str
    kind: Literal["skill", "chrome"]
    downside: str | None = None
    icon: str | None = None  # path under assets/, or None for a text-only row
    text: str = ""  # the tooltip: what it is or does (chrome especially)


def _six_dice(v: dict[str, int]) -> dict[str, int]:
    """A sheet's stats: exactly the six, each one of the dice, in sheet order."""
    if set(v) != set(STATS):
        raise ValueError(f"stats must have exactly {', '.join(STATS)}")
    bad = {k: d for k, d in v.items() if d not in DIE_SIDES}
    if bad:
        raise ValueError(f"stat dice must be one of {DIE_SIDES}: {bad}")
    return {k: v[k] for k in STATS}


class Character(Strict):
    id: str
    name: str  # full name, on the sheet
    short: str  # rail and token name
    role: str  # "The Thief"
    portrait: str
    color: str = "#ff4fa3"
    stats: dict[str, int]
    entries: list[ListEntry] = Field(default_factory=list, alias="list")  # YAML key: list

    @field_validator("stats")
    @classmethod
    def _stats(cls, v: dict[str, int]) -> dict[str, int]:
        return _six_dice(v)


class Npc(Strict):
    id: str
    name: str
    role: str = ""
    portrait: str
    color: str = "#8f88a3"
    stats: dict[str, int]  # the die for each stat; the GM rolls an NPC by stat. Never sent to players.
    mood: str = ""
    note: str = ""
    gm_note: str = ""  # never sent to players
    codex: str | None = None  # its Codex entry, once the Codex exists (M6)

    @field_validator("stats")
    @classmethod
    def _stats(cls, v: dict[str, int]) -> dict[str, int]:
        return _six_dice(v)


COUNT_MAX = 999_999


class Item(Strict):
    """Something a character can hold. Clues are items too: a note, an audio log."""

    id: str
    name: str
    icon: str
    kind: Literal["gear", "weapon", "tool", "cash", "key", "note", "audio"] = "gear"
    text: str = ""  # the tooltip: what it is, what it says. Only its holder and the GM ever see it.
    counted: bool = False  # credits: one entry holding an amount, instead of one entry per piece
    codex: str | None = None


class Mood(Strict):
    id: str
    label: str
    base: str
    glow: str | None = None


class Switch(Strict):
    id: str
    label: str
    type: Literal["bool", "level"] = "bool"
    max: int = 1
    moods: list[str] = []  # moods it applies to; empty = all


class Overlay(Strict):
    """A full-frame layer shown when the map is in `mood` and switch `switch` equals `value`."""

    id: str
    src: str
    layer: Literal["patch", "gas"] = "patch"
    mood: str
    switch: str
    value: int = 1


class MapObject(Strict):
    """Something in the world a player can inspect, such as a mural. Players see it once the GM reveals it."""

    id: str
    name: str
    at: Vec3  # where its marker sits
    text: str
    closeup: tuple[float, float] | None = None  # centre of the card's close-up, in the map's display px (art framing, not a position)
    codex: str | None = None


class MapDef(Strict):
    id: str
    name: str
    subtitle: str = ""
    description: str = ""  # alt text for the map art
    display: tuple[int, int]  # world div size in px (art drawn at 2x)
    origin: tuple[float, float]  # proj(X,Y,Z) = [((X-Y)*30+ox)*2, ((X+Y)*15 - Z*36 + oy)*2]
    moods: list[Mood]
    switches: list[Switch] = []
    overlays: list[Overlay] = []
    objects: list[MapObject] = []

    @model_validator(mode="after")
    def _refs(self) -> "MapDef":
        ids = [o.id for o in self.objects]
        if len(ids) != len(set(ids)):
            raise ValueError("object ids must be unique on a map")
        mood_ids = {m.id for m in self.moods}
        sw = {s.id: s for s in self.switches}
        for s in self.switches:
            if unknown := set(s.moods) - mood_ids:
                raise ValueError(f"switch {s.id} names unknown moods {unknown}")
        for o in self.overlays:
            if o.mood not in mood_ids:
                raise ValueError(f"overlay {o.id} names unknown mood {o.mood}")
            if o.switch not in sw:
                raise ValueError(f"overlay {o.id} names unknown switch {o.switch}")
        return self

    def switch(self, switch_id: str) -> Switch | None:
        return next((s for s in self.switches if s.id == switch_id), None)

    def object(self, object_id: str) -> MapObject | None:
        return next((o for o in self.objects if o.id == object_id), None)


class PresetToken(Strict):
    id: str | None = None
    kind: Literal["crew", "npc"]
    ref: str
    map: str
    at: Vec3
    hidden: bool = False


class PresetItem(Strict):
    item: str
    count: int = Field(ge=0, le=COUNT_MAX)


class MapState(Strict):
    mood: str
    switches: dict[str, int] = {}
    shown: list[str] = []  # objects players can see and inspect


class Vitals(Strict):
    hp: int = HP_MAX
    entropy: int = 2


class Preset(Strict):
    """A whole-table arrangement the GM can load: positions, moods, vitals, inventories."""

    id: str
    name: str
    default: bool = False
    party_map: str
    maps: dict[str, MapState] = {}
    tokens: list[PresetToken] = []
    vitals: dict[str, Vitals] = {}  # missing crew get HP 6, Entropy 2
    inventory: dict[str, list[str | PresetItem]] = {}  # holder -> item ids, or {item, count} for counted items


# ---------------------------------------------------------------- state


class TokenState(Strict):
    kind: Literal["crew", "npc"]
    ref: str
    map: str
    at: Vec3
    hidden: bool = False


class InvEntry(Strict):
    uid: str
    item: str
    count: int | None = None  # counted items only
    new: bool = False  # handed over and not yet looked at by its holder


class RollState(Strict):
    """One roll, from the moment the dice are rolled (on the server) until the roller closes their roll screen.

    The roller's screen gets every die at once to play the animation; everyone else learns them as they
    land there (`shown`), so the result appears on the token and in the crew rail at the same moment.
    """

    id: str
    by: str  # the seat that rolled: a character id, or "gm"
    char: str | None = None  # crew rolls: whose Entropy a push spends
    token: str | None = None  # GM rolls: the NPC token the callout sits on (None: just a die, always hidden)
    handle: str  # the name in the roll screen's terminal prompt
    stat: str  # body..empathy: the animation and colour
    entry: str | None = None  # the skill or chrome picked, if any
    sides: int
    bonus: int = 0
    dice: list[int]
    seed: int  # the animation's randomness, so a reload paints the same scene
    insult: str | None = None  # natural 1 only
    hidden: bool = False  # GM rolls only: players never hear of it
    shown: int = 0  # dice that have landed on the roller's screen
    pushes: int = 0
    pushed: int = 0  # total added by pushes
    open: bool = True
    started: float = 0.0  # server time, for the sweeper


class GameState(Strict):
    seq: int = 0  # seq of the last applied event
    party_map: str = ""  # where viewers without a token on a map look
    maps: dict[str, MapState] = {}
    tokens: dict[str, TokenState] = {}
    vitals: dict[str, Vitals] = {}
    inventory: dict[str, list[InvEntry]] = {}
    rolls: list[RollState] = Field(default_factory=list)  # open rolls, then the most recent closed ones
    seen: dict[str, list[str]] = {}  # character -> "map/object" keys they have inspected
