"""Content (read-only YAML) and game state models."""

from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

STATS = ("body", "reflex", "tech", "intel", "cool", "empathy")
DIE_SIDES = (4, 6, 8, 10, 12, 20)
ENTROPY_MAX = 6
BURN_COST = 2  # Entropy a Burn spends
RULES = 6  # the rules version a saved game is on: 1 gave each character their own health, 2 the Codex, 3 the Station,
# 4 the heist maps (the Executive tower became four separate decks; the Secure floor and the Bot bays were redrawn),
# 5 the story consolidated with the live bible (each character's letter replaced the invitation; the old man was cut),
# 6 the music credit moved from the login screen to a Codex page, unlocked for the crew

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


class BurnCut(Strict):
    """One of a Burn's films, with its sound baked in. Ves has two: in a fight, and just vanishing."""

    id: str
    label: str = ""  # how the sheet names it when there's a choice
    file: str
    length: float = Field(gt=0, le=10)  # seconds


class Burn(Strict):
    """A character's signature move: 2 Entropy, no roll, and its film on the TV. Peter applies what it does."""

    name: str
    when: str  # "On her turn", "Any time"
    text: str
    icon: str
    color: str  # the Burn row's sweep and flash
    react: Literal["roll", "hurt"] | None = None  # its row pulses after a die lands (Recount) or someone is hurt (Not them)
    cuts: list[BurnCut] = Field(min_length=1)

    def cut(self, cut_id: str | None) -> BurnCut | None:
        return self.cuts[0] if cut_id is None else next((c for c in self.cuts if c.id == cut_id), None)


class Character(Strict):
    id: str
    name: str  # full name, on the sheet
    short: str  # rail and token name
    role: str  # "The Thief"
    portrait: str
    color: str = "#ff4fa3"
    health: int = Field(ge=1, le=20)  # the most health they can have, and where they start
    stats: dict[str, int]
    entries: list[ListEntry] = Field(default_factory=list, alias="list")  # YAML key: list
    burn: Burn | None = None

    @field_validator("stats")
    @classmethod
    def _stats(cls, v: dict[str, int]) -> dict[str, int]:
        return _six_dice(v)


class NpcBurn(Strict):
    """A Burn of an NPC's (Lucan's): a film on the TV, no Entropy (Peter keeps count in his head), nothing on the laptops.
    Only the GM ever learns it exists, until it plays."""

    id: str
    name: str
    text: str
    file: str
    length: float = Field(gt=0, le=20)  # seconds


class Npc(Strict):
    id: str
    name: str
    role: str = ""
    group: str = "Others"  # where it sits in the GM's Add list
    portrait: str
    color: str = "#8f88a3"
    stats: dict[str, int]  # the die for each stat; the GM rolls an NPC by stat. Never sent to players.
    mood: str = ""
    note: str = ""
    gm_note: str = ""  # never sent to players
    codex: str | None = None  # its Codex entry, once the Codex exists (M6)
    size: float = 1  # token size: the spider mech is a double-size token
    health: int = Field(ge=1, le=20)  # the enemy card's health. Players see it only as the HP ring, while it's in a fight
    burns: list[NpcBurn] = []  # GM only, never sent to players

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


Hum = Literal["bar", "street", "none", "beat"]  # how a glow flickers: the bar's 7 s, the street's 9 s, none, or Alert's pulse


class Mood(Strict):
    id: str
    label: str
    base: str
    glow: str | None = None
    hum: Hum | None = None  # this mood's own flicker, else the map's


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
    game: Literal["slots"] | None = None  # something you can sit down and play, from its card


class Decal(Strict):
    """A small piece of art set into the map, such as the moving black hole in the Promenade's window. Drawn as the
    board draws it: a clipped box of `box` px, placed by a CSS matrix, holding the image at `img` (left, top, w, h).
    These are art framing in display px, not positions."""

    id: str
    src: str
    box: tuple[float, float]
    matrix: tuple[float, float, float, float, float, float]
    img: tuple[float, float, float, float]
    filter: str | None = None
    moods: list[str] = []  # moods it shows in; empty = all
    opacity: dict[str, float] = {}  # or its opacity in each mood (missing moods: hidden), as the Terminal room's face
    over: bool = False  # drawn over the glow, not under it
    blend: str | None = None  # a CSS mix-blend-mode
    clip: str | None = None  # a CSS clip-path on the image
    pixelated: bool = False
    fade: float = 0.7  # seconds it takes to fade between moods


class Feed(Strict):
    """The Terminal room's wall screen: the two clocks and the station's events, set into the wall by a CSS matrix
    (display px). Two level switches drive it: minutes down here, and how many of the events have happened."""

    box: tuple[float, float]
    matrix: tuple[float, float, float, float, float, float]
    title: str
    minutes: str  # switch: crew minutes at the core
    factor: float  # station minutes per crew minute
    events: str  # switch: how many lines of `lines` show
    lines: list[str]


class Cone(Strict):
    """One camera's view on the floor: from `at` (world X, Y), facing `deg`, `spread` degrees wide, `reach` long."""

    mood: str | None = None  # the mood it belongs to; none = every mood
    at: tuple[float, float]
    deg: float
    spread: float
    reach: float
    bounds: tuple[float, float, float, float] | None = None  # its own walls, else the map's


class Cameras(Strict):
    """The cameras drawn on a map's walls. Their cones show while the bool switch `switch` is on, for everyone."""

    switch: str
    bounds: tuple[float, float, float, float]  # x0, y0, x1, y1: cones stop at the walls
    steps: int = 6  # arc segments, as the board draws them
    color: str = "#c9bcff"  # ISCO's white-violet; the company's cameras are steel blue
    cones: list[Cone]

    def polygon(self, c: Cone) -> list[list[float]]:
        """The cone as world X, Y points on the floor, the way the Maps boards draw it."""
        x0, y0, x1, y1 = c.bounds or self.bounds
        pts = [[c.at[0], c.at[1]]]
        for i in range(self.steps + 1):
            a = math.radians(c.deg - c.spread / 2 + c.spread * i / self.steps)
            pts.append([round(max(x0, min(x1, c.at[0] + c.reach * math.cos(a))), 3), round(max(y0, min(y1, c.at[1] + c.reach * math.sin(a))), 3)])
        return pts


class Pin(Strict):
    """A labelled point from the map's Key board ("what's where"). Only the GM sees pins."""

    k: str  # the Key's number or letter
    label: str
    at: Vec3


class MapDef(Strict):
    id: str
    name: str
    subtitle: str = ""
    description: str = ""  # alt text for the map art
    display: tuple[int, int]  # world div size in px (art drawn at 2x)
    origin: tuple[float, float]  # proj(X,Y,Z) = [((X-Y)*30+ox)*2, ((X+Y)*15 - Z*36 + oy)*2]
    order: int = 100  # where it comes in the GM's lists: the order the story reaches it
    hum: Hum = "bar"  # how its glow flickers, as on its board
    moods: list[Mood]
    switches: list[Switch] = []
    overlays: list[Overlay] = []
    decals: list[Decal] = []
    cameras: Cameras | None = None
    feed: Feed | None = None
    objects: list[MapObject] = []
    pins: list[Pin] = []
    arrive: list[Vec3] = []  # where the crew land when the GM sends them here, in crew order

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
        for d in self.decals:
            if unknown := (set(d.moods) | set(d.opacity)) - mood_ids:
                raise ValueError(f"decal {d.id} names unknown moods {unknown}")
        if self.feed:
            for k in (self.feed.minutes, self.feed.events):
                if not sw.get(k) or sw[k].type != "level":
                    raise ValueError(f"the feed needs a level switch {k!r}")
            if sw[self.feed.events].max > len(self.feed.lines):
                raise ValueError("the feed's events switch goes past its lines")
        if self.cameras:
            s = sw.get(self.cameras.switch)
            if not s or s.type != "bool":
                raise ValueError(f"cameras need a bool switch {self.cameras.switch!r}")
            for c in self.cameras.cones:
                if c.mood is not None and c.mood not in mood_ids:
                    raise ValueError(f"a camera cone names unknown mood {c.mood}")
        return self

    def switch(self, switch_id: str) -> Switch | None:
        return next((s for s in self.switches if s.id == switch_id), None)

    def object(self, object_id: str) -> MapObject | None:
        return next((o for o in self.objects if o.id == object_id), None)


class CueToken(Strict):
    """An NPC a cue puts on the map behind its film (placed, or moved there if it's already somewhere)."""

    id: str | None = None  # the token; defaults to the NPC's id
    ref: str
    at: Vec3
    hidden: bool = False


class CueSets(Strict):
    """What a cue sets behind its film, so play resumes in the right place when it ends."""

    map: str
    mood: str | None = None
    switches: dict[str, int] = {}
    tokens: list[CueToken] = []
    party: bool = True  # also make it the map the party looks at


class Cutscene(Strict):
    """One film, started by the GM and played to the end with no controls. A cue with no file isn't made yet."""

    id: str
    name: str
    act: str  # the heading it sits under in the GM's list
    sub: str = ""  # "36 s, ends act 3"
    ends: str = ""  # where play resumes, for the GM
    file: str | None = None  # the video under assets/, with its sound baked in
    length: float | None = None  # seconds; required with a file
    still: str | None = None  # the GM's thumbnail; never sent to players
    sets: CueSets | None = None

    @model_validator(mode="after")
    def _made(self) -> "Cutscene":
        if self.file and not (self.length and self.length > 0):
            raise ValueError(f"cutscene {self.id} has a file, so it needs its length in seconds")
        return self


class Opening(Strict):
    """The campaign's opening: a waiting loop, then the film, with the sound of both in one separate file."""

    name: str
    sub: str = ""
    loop: str  # the picture loop, no sound
    film: str  # played muted: its sound is in `audio`
    audio: str  # the music loop, then the film's sound, back to back
    still: str  # the loop's first frame: its poster, and the GM's thumbnail
    length: float = Field(gt=0)  # the film, in seconds
    beat: float = Field(gt=0)  # seconds between the music's beats: the film starts on one
    resets_to: str  # the preset the GM's Reset the game puts everything back to


CodexSec = Literal["chars", "items", "world", "lore", "rules"]
CODEX_SECTIONS: tuple[str, ...] = ("chars", "items", "world", "lore", "rules")


class CodexTile(Strict):
    """A piece of art in a section's row on the Codex landing, or in its strip: px from the art's left edge and from
    the row's middle, and its drawn width. Art framing, not positions."""

    src: str
    l: float  # noqa: E741 - the board's name
    t: float
    w: float


class CodexSection(Strict):
    id: CodexSec
    name: str
    short: str  # in the strip's section links
    tiles: list[CodexTile]
    strip: list[CodexTile] = []  # the section page's strip, when it differs from the landing row


# How a picture sits on its card and page, as the Codex boards place it (Cdx3Main's art()): the source's width in
# px, the x to centre on, the source y at the card's top, the card's whole-number zoom, and See also's zoom.
ART_KINDS = {
    "bust": {"px": 96, "cx": 48, "y0": 0, "k": 5.4, "km": 2, "pos": "50% 10%"},  # a 96 px portrait
    "icon": {"px": 48, "cx": 24, "y0": -14, "k": 6, "km": 2, "pos": "50% 50%"},  # a 48 px item or rules icon
    "crop": {"y0": 0, "k": 2, "km": 1, "pos": "50% 50%"},  # a piece of a map or a big picture: set px and cx
}


class CodexArt(Strict):
    src: str
    kind: Literal["bust", "icon", "crop"] = "crop"
    px: float | None = None
    cx: float | None = None
    y0: float | None = None
    my: float | None = None  # See also's top, when it differs from the card's
    k: float | None = None
    km: float | None = None
    pos: str | None = None  # the page's object-position
    z: float = 1  # the page's zoom on a crop

    @model_validator(mode="after")
    def _sized(self) -> "CodexArt":
        if self.kind == "crop" and (self.px is None or self.cx is None):
            raise ValueError(f"a crop of {self.src} needs px (its width) and cx (where to centre)")
        return self

    def placed(self) -> dict:
        d = {**ART_KINDS[self.kind], **{k: v for k, v in self.model_dump().items() if v is not None}}
        d.setdefault("my", d["y0"])
        return d


class CodexBlock(Strict):
    """A section of a page. A `locked` one stays hidden until the GM unlocks it, so a page grows: the saint, then
    the man, then the truth."""

    id: str
    h: str
    text: str
    locked: bool = False


class CodexRow(Strict):
    icon: str | None = None
    n: str
    d: str = ""


class CodexShot(Strict):
    src: str
    cap: str
    pos: str = "50% 50%"  # object-position, as the board's shots


class CodexEntry(Strict):
    """One Codex page. `crew`, `npc` or `item` ties it to that sheet: a crew page shows its stats, health, skills and
    Burn, an NPC's its mood. Text is draft, for Peter to edit."""

    id: str
    sec: CodexSec
    name: str = ""  # defaults to the sheet's name
    role: str = ""  # the line under the name on its card
    label: str = ""  # the small line over the page's name
    sub: str = ""
    art: CodexArt
    crew: str | None = None
    npc: str | None = None
    item: str | None = None
    lead: str = ""
    quote: str = ""
    blocks: list[CodexBlock] = []
    rows_label: str = ""
    rows: list[CodexRow] = []
    facts: list[tuple[str, str]] = []
    see: list[str] = []
    shots_label: str = ""
    shots: list[CodexShot] = []

    @model_validator(mode="after")
    def _one_sheet(self) -> "CodexEntry":
        if sum(x is not None for x in (self.crew, self.npc, self.item)) > 1:
            raise ValueError(f"codex entry {self.id} ties to more than one sheet")
        ids = [b.id for b in self.blocks]
        if len(ids) != len(set(ids)):
            raise ValueError(f"codex entry {self.id}: block ids must be unique")
        return self


class StationTag(Strict):
    x: float
    y: float
    text: str
    dark: str | None = None  # what it reads until the place is shown (the core)


class StationPlace(Strict):
    """One place on the Station's cross-section: a map, its label and blurb, the overlay that lights it once the crew
    has been there, and the boxes you hover. Positions are display px on the 1100 x 840 picture (art framing)."""

    map: str
    name: str
    dark_name: str | None = None
    where: str
    blurb: str
    lit: str
    tags: list[StationTag]
    chip: tuple[float, float]
    hots: list[tuple[float, float, float, float]] = Field(min_length=1)


class StationLabel(Strict):
    x: float
    y: float
    text: str


class Station(Strict):
    art: str
    hole: str
    labels: list[StationLabel] = []
    places: list[StationPlace]

    @model_validator(mode="after")
    def _once(self) -> "Station":
        ids = [p.map for p in self.places]
        if len(ids) != len(set(ids)):
            raise ValueError("a map shows on the Station once")
        return self


class SurveyOption(Strict):
    id: str
    label: str
    points: int = 0  # bad points this answer adds
    sends: bool = False  # this answer alone gets you sent in, whatever the total


class SurveyQuestion(Strict):
    """One page of a survey. `stars` scores by `stars_points`; `one` and `many` by their options; `text` by `flag`."""

    id: str
    kind: Literal["stars", "one", "many", "text"]
    text: str
    header: str = ""  # the page's top line; a question without one is numbered ("QUESTION 2 / 5")
    hint: str = ""
    options: list[SurveyOption] = []
    stars_points: list[int] = []  # one star .. five stars
    flag: list[str] = []  # text: words that cost `points`; a trailing * matches any ending ("wait*")
    points: int = 0  # text: what a flagged word costs

    @model_validator(mode="after")
    def _shape(self) -> "SurveyQuestion":
        if self.kind == "stars" and len(self.stars_points) != 5:
            raise ValueError(f"question {self.id}: stars needs five stars_points, one star first")
        if self.kind in ("one", "many") and len(self.options) < 2:
            raise ValueError(f"question {self.id}: needs at least two options")
        if self.kind == "text" and not self.flag:
            raise ValueError(f"question {self.id}: a text question needs its flag words")
        return self


class SurveyEnding(Strict):
    """A last page: what the device says, and the line left on the map once it's closed."""

    title: list[str]  # big lines
    line: str = ""
    text: str = ""
    status: str = ""  # a blinking line by the button
    button: str
    toast: str


class SurveyIntro(Strict):
    header: str
    title: list[str]
    stat: str = ""  # a figure under the title, e.g. STATION SATISFACTION 99.97%
    value: str = ""
    text: str
    begin: str = "BEGIN"
    decline: str = ""  # a way to walk away; leave it out if there's none


class Survey(Strict):
    intro: SurveyIntro
    questions: list[SurveyQuestion]
    limit: int  # sent in with more bad points than this
    busy: str = "SUBMITTING"
    busy_text: str = ""
    fine: SurveyEnding
    sent: SurveyEnding
    later: SurveyEnding | None = None  # the decline's page; needed with intro.decline


class GolfGreen(Strict):
    """The mini-golf green. The game plays out on the player's screen; these are its switches."""

    header: str
    well: Literal["off", "gentle", "strong"] = "gentle"  # how hard the green pulls toward the cup
    sweeper: bool = True  # the groundskeeping bot
    turnstile: bool = True
    curve: bool = True  # dragging sideways bends the putt


class Overview(Strict):
    """A little game the GM sends to players' screens, over the map: a survey on a device's live screen, or a green.
    The verdict shows on the player's own screen only; nothing comes back to the GM."""

    id: str
    name: str
    device: str | None = None  # a survey's art, drawn at 3x over a 900 x 900 box; the screen shows through its face
    screen: tuple[int, int, int, int] | None = None  # where the screen sits in that box: left, top, width, height
    mask: str | None = None  # the screen's shape, an alpha mask stretched over it
    tint: Literal["amber", "violet", "paper"] = "amber"
    burns: bool = False  # cigar burns on the glass
    survey: Survey | None = None
    golf: GolfGreen | None = None

    @model_validator(mode="after")
    def _one_game(self) -> "Overview":
        if bool(self.survey) == bool(self.golf):
            raise ValueError(f"overview {self.id}: needs a survey or a green, not both")
        if self.survey:
            if not self.device or not self.screen:
                raise ValueError(f"overview {self.id}: a survey needs its device and screen")
            if bool(self.survey.intro.decline) != bool(self.survey.later):
                raise ValueError(f"overview {self.id}: intro.decline and the later page go together")
        return self


class SlotsArt(Strict):
    lit_a: str
    lit_b: str
    dark: str
    crank_up: str
    crank_mid: str
    crank_down: str
    reel: str
    coin: str


class SlotsGame(Strict):
    """The slot machines' rules (content/slots.yaml). A pull never pays; standing up pays back what you lost, by how
    many of the crew stand in the same few seconds."""

    seats: int
    pull: int
    currency: str
    window: float
    near_percent: int
    paid_back: list[int]  # percent of what you lost, by how many stood at once
    flood_seconds: float
    near_line: str
    miss_lines: list[str]
    out_text: str
    audit: list[str] = []
    art: SlotsArt

    @model_validator(mode="after")
    def _one_rate_per_seat(self) -> "SlotsGame":
        if len(self.paid_back) != self.seats:
            raise ValueError("slots: paid_back needs one rate per seat")
        return self


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
    hp: int  # 0 up to the character's health
    entropy: int = 2


class MapGroupEntry(Strict):
    map: str
    under: int = Field(default=0, ge=0, le=2)  # how far it's tucked under the map above it (the vault, under the Secure floor)


class MapGroup(Strict):
    """One heading in the GM's map picker, with its maps in the order they're listed."""

    title: str
    maps: list[str | MapGroupEntry]

    def entries(self) -> list[MapGroupEntry]:
        return [MapGroupEntry(map=m) if isinstance(m, str) else m for m in self.maps]


class Preset(Strict):
    """A whole-table arrangement the GM can load: positions, moods, vitals, inventories."""

    id: str
    name: str
    session: str = ""  # the heading it's under on the GM's Session page
    blurb: str = ""  # one line under its picture there
    card: str | None = None  # its picture there
    default: bool = False
    party_map: str
    maps: dict[str, MapState] = {}
    tokens: list[PresetToken] = []
    vitals: dict[str, Vitals] = {}  # missing crew get their full health and 2 Entropy
    inventory: dict[str, list[str | PresetItem]] = {}  # holder -> item ids, or {item, count} for counted items
    codex: list[str] = []  # Codex entries unlocked for the crew ("entry"), and locked blocks ("entry/block")
    station: list[str] = []  # places lit on the Station; the party map and the crew's maps are added


class ScenarioStep(Strict):
    type: str  # a GM command, run after the world is loaded
    args: dict = {}


class Scenario(Preset):
    """A setup to test from: only the sandbox's Bench can load one."""

    note: str = ""
    after: list[ScenarioStep] = []


# ---------------------------------------------------------------- state


class TokenState(Strict):
    kind: Literal["crew", "npc"]
    ref: str
    map: str
    at: Vec3
    hidden: bool = False
    hp: int | None = None  # NPCs: health left once hurt (None: full). It stays after a fight: a hurt guard stays hurt


class Fight(Strict):
    """A fight on one map (M8). The GM picks who's in it, and everyone's Reflex, rolled once when it starts, sets the
    turn order. The app never knows the number to beat or who attacks whom."""

    order: list[str]  # token ids, first to last
    rolled: list[str] = []  # the order the GM picked them in: the strip shows them so while the dice land, then sorts
    ini: dict[str, int] = {}  # each fighter's Reflex total
    joined: dict[str, float] = {}  # server time each fighter's dice were rolled, for the landing on every screen
    turn: int = 0  # index into order
    round: int = 1
    started: float = 0.0


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
    token: str | None = None  # GM rolls: the NPC token it belongs to (None: just a die)
    handle: str  # the name in the roll screen's terminal prompt
    stat: str | None  # body..empathy: the look and colour. None: "just a die", which has no stat
    entry: str | None = None  # the skill or chrome picked, if any
    sides: int
    bonus: int = 0
    dice: list[int]
    seed: int  # the animation's randomness, so a reload paints the same scene
    insult: str | None = None  # natural 1 only
    hidden: bool = False  # GM rolls only: Secret. Players and the TV never hear of it
    sealed: bool = False  # GM rolls only: Hidden or Someone, or a Hidden "just a die". Everyone sees it happen, nobody but the GM sees how it came out
    god: bool = False  # GM rolls only: the whole-screen God roll (Round 17)
    shown: int = 0  # dice that have landed on the roller's screen
    pushes: int = 0
    pushed: int = 0  # total added by pushes
    failed: bool = False  # the GM called it a failure (a natural 1 always is): a skill's downside shows on the TV
    open: bool = True
    started: float = 0.0  # server time, for the sweeper


CAMERAS = ("crew", "follow", "roller")  # the TV's camera: the whole crew, one of them, or cut to whoever rolls
CAMERA_ZOOM_MAX = 4  # how many steps the GM can zoom the TV's shot each way
CAMERA_PAN_MAX = 30  # and move it, each way


class Sound(Strict):
    """One clip on the GM's soundboard."""

    id: str
    name: str
    file: str  # under assets/


class SoundCategory(Strict):
    """One button on the GM's top bar, and the sounds it opens."""

    id: str
    name: str
    sounds: list[Sound] = Field(min_length=1)


class SoundPlayed(Strict):
    """A press on the soundboard, at `at` (server time). The TV plays each one it hasn't played."""

    id: str
    at: float


class FilmState(Strict):
    """A film playing now: every screen that plays it starts it at `at` (server time) and stops at `ends`."""

    cue: str
    at: float
    ends: float


class BurnState(Strict):
    """A Burn's film playing now, on the same screens a cutscene plays on, from `at` to `ends` (server time)."""

    char: str
    cut: str
    at: float
    ends: float


class NpcBurnState(Strict):
    """An NPC's Burn film playing now, on the TV only, from `at` to `ends` (server time)."""

    npc: str
    burn: str
    at: float
    ends: float


class OpeningState(Strict):
    """The opening is on: the TV loops and players are held on the black hole until it ends. Times are the server's."""

    loop_at: float  # the music loop's start: every position in the loop is counted from here
    film_at: float | None = None  # the film starts here, on a beat of the loop. Once it's set it can't be stopped
    ends: float | None = None


class FloodState(Strict):
    """Everyone stood at once: the machines pay out, big on the TV."""

    at: float
    ends: float
    paid: list[int]  # what each machine paid


class StageState(Strict):
    """The TV: its camera, and the film or Burn playing now, if any."""

    camera: Literal["crew", "follow", "roller"] = "crew"
    follow: str | None = None  # a character, for the "follow" camera
    zoom: int = 0  # the GM's nudge to the shot, in steps closer (or further, below 0)
    pan: tuple[int, int] = (0, 0)  # and steps off its centre, across and down
    film: FilmState | None = None
    opening: OpeningState | None = None
    burn: BurnState | None = None
    npc_burn: NpcBurnState | None = None  # GM and TV only
    flood: FloodState | None = None
    join: bool = True  # the join card is on the TV, if the server has one, until the GM hides it
    sounds: list[SoundPlayed] = []  # the last few soundboard presses, for the TV


class SlotSeat(Strict):
    """One of the crew at a machine. `lost` is what they've put in since they sat down; only the server knows it."""

    char: str
    unit: int  # which machine, from 1
    page: Literal["play", "wait", "lucky", "flood", "out"] = "play"
    lost: int = 0
    pulls: int = 0
    free: bool = False  # the next pull is the free spin
    payout: int = 0  # the last payback
    reels: list[int] = [3, 1, 2]  # where each reel stopped
    spin: int = 0  # counts pulls, so the screen knows a new one to animate
    near: bool = False
    line: str = ""


class SlotBank(Strict):
    """A row of slot machines: who's sitting at them, and the stand window, which the first stand opens."""

    seats: list[SlotSeat] = []
    until: float | None = None  # when the open stand window closes
    out: bool = False  # out of service


class OverviewState(Strict):
    """An overview the GM sent to one player. It stays until they close it (or the GM takes it back)."""

    kind: str  # the overview's id in overviews.yaml
    id: str  # this sending, so a reload or a resend starts it fresh


class GameState(Strict):
    seq: int = 0  # seq of the last applied event
    rules: int = 0  # the rules version this game is on (RULES); boot brings an older game up to date
    party_map: str = ""  # where viewers without a token on a map look
    maps: dict[str, MapState] = {}
    tokens: dict[str, TokenState] = {}
    vitals: dict[str, Vitals] = {}
    inventory: dict[str, list[InvEntry]] = {}
    rolls: list[RollState] = Field(default_factory=list)  # open rolls, then the most recent closed ones
    seen: dict[str, list[str]] = {}  # character -> "map/object" keys they have inspected
    stage: StageState = Field(default_factory=StageState)
    codex: list[str] = []  # unlocked for the whole crew: entry ids, and "entry/block" for a locked block
    codex_read: dict[str, list[str]] = {}  # character -> the unlocked keys they've read; the rest are new to them
    station: list[str] = []  # maps lit on the Station for the crew: they've been there, or the GM showed them
    fights: dict[str, Fight] = {}  # map id -> the fight on it: one per map, so a split party can have two
    overviews: dict[str, OverviewState] = {}  # character -> the overview open on their screen, one at a time
    slots: dict[str, SlotBank] = {}  # "map/object" -> the machines there: who's seated, and whether they still work
