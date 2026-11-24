"""Bot bay racing: the race, and the final against CSAT-1.

The picked players prep their own bots on their laptops (dress, tune, fuel, rev); the server rolls the tune and keeps
each prep; when the last one revs, the TV runs the race from the seed (web/src/race/sim.ts, whose own tests check it
against the prototype and check the balance). Fuel is the first thing a player ever takes out of their own pockets.
A player never learns what their fuel does, only what the bot said.
"""

import json
import struct

import pytest

from lso import sheet
from lso.auth import Viewer
from lso.config import ROOT
from lso.content import load_content
from lso.engine import Engine
from lso.store import Store
from lso.views import project, referenced_assets

GM = Viewer("gm", "gm")
STAGE = Viewer("stage", "stage")
LALE, MARLO, TALLY, VES, TOMO = (Viewer(c, "player") for c in ("lale", "marlo", "tally", "ves", "tomo"))


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


@pytest.fixture(scope="module")
def g(content):
    return content.race


class Dice:
    """The tune's dice: each roll comes off `rolls` in turn (then 2s). Everything else is a fixed draw."""

    def __init__(self):
        self.rolls: list[int] = []

    def randint(self, a, b):
        return self.rolls.pop(0) if self.rolls else 2

    def randrange(self, stop):
        return 4242 % stop


@pytest.fixture
def clock():
    class C:
        t = 1000.0

        def __call__(self):
            return self.t

    return C()


@pytest.fixture
def dice():
    return Dice()


@pytest.fixture
def engine(content, tmp_path, clock, dice):
    return Engine(content, Store(tmp_path / "t.db"), rng=dice, clock=clock)


async def run(engine, viewer, kind, args):
    ack, _ = await engine.run(viewer, None, kind, args)
    return ack


async def ok(engine, viewer, kind, args):
    ack = await run(engine, viewer, kind, args)
    assert ack["ok"], ack
    return ack


def view(engine, viewer):
    return project(engine.state, engine.content, viewer)


async def give(engine, char, item):
    await ok(engine, GM, "gm.item.give", {"holder": char, "item": item})
    return next(e.uid for e in reversed(engine.state.inventory[char]) if e.item == item)


async def send(engine, which, chars):
    await ok(engine, GM, "gm.overview.send", {"overview": which, "chars": chars})
    return engine.state.race.id


async def prep(engine, viewer, rid, uid=None, level=0.8, look=None, name="ZOOM", num="9"):
    look = look or {"spoiler": 1, "stripes": 2, "wheels": 3, "topper": 1, "face": 4, "paint": 2, "lights": 1}
    await ok(engine, viewer, "race.dress", {"id": rid, "look": look, "name": name, "num": num})
    await ok(engine, viewer, "race.tune", {"id": rid})
    await ok(engine, viewer, "race.fuel", {"id": rid, "uid": uid})
    await ok(engine, viewer, "race.rev", {"id": rid, "level": level})


# ---------------------------------------------------------------- the numbers


def test_the_numbers_are_the_prototypes(g):
    assert (g.laps.race, g.laps.final, g.hold) == (5, 3, 14)
    assert [(t.name, t.grip, t.from_) for t in g.tunes] == [("LOOSE WHEEL", 0.7, 0), ("STOCK", 1.0, 5), ("TIGHT", 1.15, 7), ("GLUED", 1.3, 9)]
    assert [(r.name, r.launch, r.below) for r in g.revs] == [("SLUGGISH", 0.2, 0.5), ("CLEAN", 0.6, 0.78), ("PERFECT", 1, 0.88), ("STALLED", -1, None)]
    assert [h.name for h in g.house] == ["MOPSY", "UNIT 9", "BIG SCRUB", "DUSTIN", "SIR SUDS"]
    assert (g.house_bot.grip, g.house_bot.fuel, g.house_bot.launch) == (1, 1, 0.6)
    assert (g.csat.grip, g.csat.fuel, g.csat.launch) == (1.2, 1, 0.7)
    fx = {k: v.model_dump(exclude_defaults=True) for k, v in g.effects.items()}
    assert fx == {"fast2": {"fuel": 1.02}, "fast": {"fuel": 1.012}, "slow": {"fuel": 0.99}, "grip": {"grip": 0.1}, "loose": {"grip": -0.15},
                  "chaos": {"chaos": True}, "stink": {"stink": True}, "cup": {"fuel": 1.08}, "none": {}}  # cup: sim.test.ts checks 1.08


def test_the_house_bots_wear_colours_no_player_does(g):
    assert not {h.color for h in g.house} & {b.color for b in g.crew.values()}


@pytest.mark.parametrize(("dice", "tune"), [([1], "LOOSE WHEEL"), ([1, 20], "LOOSE WHEEL"), ([4], "LOOSE WHEEL"), ([5], "STOCK"), ([6], "STOCK"),
                                            ([7], "TIGHT"), ([8], "TIGHT"), ([9], "GLUED"), ([20, 3], "GLUED"), ([6, 3], "GLUED")])
def test_the_tune_ladder(g, dice, tune):
    assert g.tunes[g.tune(dice)].name == tune  # a natural 1 is a loose wheel even when it explodes into more


@pytest.mark.parametrize(("level", "rev"), [(0, "SLUGGISH"), (0.49, "SLUGGISH"), (0.5, "CLEAN"), (0.779, "CLEAN"), (0.78, "PERFECT"), (0.879, "PERFECT"), (0.88, "STALLED"), (1, "STALLED")])
def test_the_rev_bands(g, level, rev):
    assert g.rev(level).name == rev


def test_every_item_burns_with_its_own_line(g, content):
    assert set(content.items) <= set(g.fuel), "items with no fuel line: " + ", ".join(sorted(set(content.items) - set(g.fuel)))
    assert all(f.line and f.line == f.line.upper() for f in g.fuel.values())
    assert g.fuel_of("something-new") == g.fallback and g.effects[g.fallback.fx] == g.effects["none"]
    assert g.fuel["satisfaction-cup"].fx == "cup"


def flac_length(path) -> float:
    data = path.read_bytes()
    assert data[:4] == b"fLaC"
    info = data[8:42]  # STREAMINFO, the first metadata block
    rate = int.from_bytes(info[10:13], "big") >> 4
    total = struct.unpack(">Q", info[10:18])[0] & ((1 << 36) - 1)
    return total / rate


@pytest.mark.parametrize(("which", "secs"), [("grid", 19.2), ("race", 51.2), ("final", 48.0)])
def test_each_song_is_exactly_its_loop(g, which, secs):
    song = getattr(g.sound.music, which)
    assert song.length == pytest.approx(secs)
    assert abs(flac_length(ROOT / "assets" / g.sound.file(song.file)) - secs) < 0.0001


def test_lights_go_reaches_its_go_before_the_race_does(g):
    assert flac_length(ROOT / "assets" / g.sound.file("lights_go")) > 3.3  # the GO is at 3.3 s, when the race starts


# ---------------------------------------------------------------- the race, from the GM's send to the TV's result


async def test_the_picked_players_prep_and_nobody_else_hears_of_it(engine, g):
    await send(engine, "race", ["ves", "tomo"])
    for v in (VES, TOMO):
        me = view(engine, v)["race"]
        assert me["name"] == g.crew[v.char].name and me["num"] == g.crew[v.char].num and me["color"] == g.crew[v.char].color
        assert me["tune"] is None and me["fuel"] is None and not me["done"]
        assert me["die"] == engine.content.characters[v.char].stats["tech"]
        assert view(engine, v)["overview"]["race"] == "race"
    for v in (MARLO, LALE, TALLY, GM):
        assert view(engine, v)["race"] is None
    assert view(engine, MARLO)["overview"] is None
    assert set(view(engine, GM)["overviews"]["open"]) == {"ves", "tomo"}  # who has it open: the GM's whole view of it


async def test_the_tv_has_the_whole_grid_and_waits_for_the_last_rev(engine, g, clock):
    rid = await send(engine, "race", ["ves", "tomo"])
    tv = view(engine, STAGE)["race"]
    assert tv["start"] is None and tv["laps"] == 5 and tv["seed"] == engine.state.race.seed
    assert [e["id"] for e in tv["entries"]] == ["ves", "tomo", "house0", "house1", "house2"]
    assert [e["name"] for e in tv["entries"][2:]] == ["MOPSY", "UNIT 9", "BIG SCRUB"]
    await prep(engine, TOMO, rid)
    assert view(engine, STAGE)["race"]["start"] is None
    clock.t = 1010.0
    await prep(engine, VES, rid, level=0.95)
    tv = view(engine, STAGE)["race"]
    assert tv["start"] == pytest.approx(1010.0 + g.lead)
    ves = tv["entries"][0]
    assert (ves["name"], ves["num"], ves["launch"]) == ("ZOOM", "9", -1)  # past the green: a stall on the line
    assert ves["look"] == {"spoiler": 1, "stripes": 2, "wheels": 3, "topper": 1, "face": 4, "paint": 2, "lights": 1}
    assert all(src.startswith("/assets/") for src in tv["sound"]["files"].values())
    assert tv["sound"]["files"]["horn"] == "/assets/sounds/droid/main_approach.mp3"


async def test_the_tune_is_one_roll_of_their_tech_on_the_servers_dice(engine, dice):
    rid = await send(engine, "race", ["tally"])  # Tally's Tech is a d20
    dice.rolls = [20, 20, 3]
    await ok(engine, TALLY, "race.tune", {"id": rid})
    tune = view(engine, TALLY)["race"]["tune"]
    assert tune == {"dice": [20, 20, 3], "total": 43, "name": "GLUED", "bad": False}
    dice.rolls = [1]
    await ok(engine, TALLY, "race.tune", {"id": rid})  # no second go
    assert view(engine, TALLY)["race"]["tune"]["total"] == 43


async def test_a_natural_1_is_a_loose_wheel(engine, dice):
    rid = await send(engine, "race", ["lale"])
    dice.rolls = [1]
    await ok(engine, LALE, "race.tune", {"id": rid})
    assert view(engine, LALE)["race"]["tune"]["name"] == "LOOSE WHEEL"
    assert view(engine, LALE)["race"]["tune"]["bad"]
    assert view(engine, STAGE)["race"]["entries"][0]["grip"] == 0.7


async def test_the_steps_go_in_order(engine):
    rid = await send(engine, "race", ["ves"])
    assert not (await run(engine, VES, "race.fuel", {"id": rid, "uid": None}))["ok"]  # tune it first
    await ok(engine, VES, "race.tune", {"id": rid})
    assert not (await run(engine, VES, "race.rev", {"id": rid, "level": 0.8}))["ok"]  # fuel it first
    await ok(engine, VES, "race.fuel", {"id": rid, "uid": None})
    assert not (await run(engine, VES, "race.rev", {"id": rid, "level": "fast"}))["ok"]
    await ok(engine, VES, "race.rev", {"id": rid, "level": 0.8})
    before = engine.state.seq
    await ok(engine, VES, "race.rev", {"id": rid, "level": 0.1})  # done is done: no replay
    await ok(engine, VES, "race.dress", {"id": rid, "look": {}, "name": "X", "num": "1"})
    assert engine.state.seq == before


async def test_a_dress_is_checked(engine):
    rid = await send(engine, "race", ["ves"])
    assert not (await run(engine, VES, "race.dress", {"id": rid, "look": {"spoiler": 9}, "name": "A", "num": "1"}))["ok"]
    assert not (await run(engine, VES, "race.dress", {"id": rid, "look": {"hat": 1}, "name": "A", "num": "1"}))["ok"]
    await ok(engine, VES, "race.dress", {"id": rid, "look": {"spoiler": 4}, "name": "  the mop\n king of everything ", "num": "a1b2c3"})
    me = view(engine, VES)["race"]
    assert (me["name"], me["num"], me["look"]["spoiler"]) == ("THE MOP KI", "12", 4)


# ---------------------------------------------------------------- fuel: out of their own pockets, for good


async def test_burning_takes_the_item_and_tells_them_only_the_line(engine, g):
    rid = await send(engine, "race", ["tomo"])
    uid = await give(engine, "tomo", "hip-flask")
    await ok(engine, TOMO, "race.tune", {"id": rid})
    assert view(engine, TOMO)["race"]["names"]["hip-flask"] == "HIP FLASK"
    await ok(engine, TOMO, "race.fuel", {"id": rid, "uid": uid})
    assert all(e.uid != uid for e in engine.state.inventory["tomo"])
    me = view(engine, TOMO)["race"]
    assert me["fuel"] == {"item": "hip-flask", "name": "HIP FLASK", "line": g.fuel["hip-flask"].line}
    assert view(engine, STAGE)["race"]["entries"][0]["fuel"] == 1.02


async def test_key_items_burn_too(engine):
    rid = await send(engine, "race", ["lale"])
    uid = await give(engine, "lale", "letter-lale")
    await ok(engine, LALE, "race.tune", {"id": rid})
    await ok(engine, LALE, "race.fuel", {"id": rid, "uid": uid})
    assert all(e.uid != uid for e in engine.state.inventory["lale"])


async def test_a_gamble_and_a_stink_reach_the_race(engine):
    rid = await send(engine, "race", ["ves", "tomo"])
    await prep(engine, VES, rid, uid=await give(engine, "ves", "used-noodles"))
    await prep(engine, TOMO, rid, uid=await give(engine, "tomo", "damp-sock"))
    ves, tomo = view(engine, STAGE)["race"]["entries"][:2]
    assert ves.get("chaos") and not ves.get("stink") and tomo.get("stink") and not tomo.get("chaos")


async def test_a_player_burns_only_from_their_own_pockets_and_only_their_own_bot(engine):
    rid = await send(engine, "race", ["ves", "tomo"])
    theirs = await give(engine, "tomo", "hip-flask")
    await ok(engine, VES, "race.tune", {"id": rid})
    assert not (await run(engine, VES, "race.fuel", {"id": rid, "uid": theirs}))["ok"]
    assert any(e.uid == theirs for e in engine.state.inventory["tomo"])
    assert not (await run(engine, MARLO, "race.tune", {"id": rid}))["ok"]  # not in the race
    assert not (await run(engine, GM, "race.tune", {"id": rid}))["ok"]  # the GM doesn't prep for anyone
    assert not (await run(engine, STAGE, "race.tune", {"id": rid}))["ok"]


async def test_nobody_burns_anything_once_their_prep_is_closed(engine):
    uid = await give(engine, "ves", "hip-flask")
    assert not (await run(engine, VES, "race.fuel", {"id": "o1", "uid": uid}))["ok"]  # no race at all
    rid = await send(engine, "race", ["ves"])
    await ok(engine, GM, "gm.overview.recall", {"char": "ves"})
    assert engine.state.race is None
    assert not (await run(engine, VES, "race.fuel", {"id": rid, "uid": uid}))["ok"]
    assert any(e.uid == uid for e in engine.state.inventory["ves"])


async def test_burning_chrome_that_raises_a_maximum_brings_it_down(engine, content):
    rid = await send(engine, "race", ["ves"])
    piece = next(i for i in content.items.values() if i.raises == "health")
    uid = await give(engine, "ves", piece.id)
    top = sheet.max_health(engine.state, content, "ves")
    engine.state.vitals["ves"].hp = top  # topped up to the raised maximum
    await ok(engine, VES, "race.tune", {"id": rid})
    await ok(engine, VES, "race.fuel", {"id": rid, "uid": uid})
    assert all(e.uid != uid for e in engine.state.inventory["ves"])
    assert engine.state.vitals["ves"].hp == sheet.max_health(engine.state, content, "ves") == top - 1


# ---------------------------------------------------------------- leaks


def _walk(v):
    if isinstance(v, dict):
        for k, x in v.items():
            yield k
            yield from _walk(x)
    elif isinstance(v, list):
        for x in v:
            yield from _walk(x)


async def test_no_player_is_ever_sent_what_fuel_does(engine, g):
    rid = await send(engine, "race", ["ves", "tomo"])
    await prep(engine, VES, rid, uid=await give(engine, "ves", "used-noodles"))
    await ok(engine, TOMO, "race.tune", {"id": rid})
    await ok(engine, TOMO, "race.fuel", {"id": rid, "uid": await give(engine, "tomo", "hip-flask")})
    for v in (LALE, MARLO, TALLY, VES, TOMO):
        pv = view(engine, v)
        keys = set(_walk(pv["race"] or {})) | set(_walk(pv["overview"] or {}))
        assert not keys & {"fx", "effects", "grip", "fuel_x", "chaos", "stink", "launch", "entries", "seed"}, v.char
        text = json.dumps(pv)
        assert "GAMBLE" not in text and "QUICK" not in text


async def test_players_not_in_the_race_get_nothing(engine):
    rid = await send(engine, "race", ["ves"])
    await prep(engine, VES, rid)
    for v in (LALE, MARLO, TALLY, TOMO):
        pv = view(engine, v)
        assert pv["race"] is None and pv["overview"] is None


async def test_the_tv_can_fetch_everything_it_needs(engine):
    await send(engine, "final", ["marlo"])
    tv = view(engine, STAGE)
    for path in referenced_assets(tv["race"]):
        assert (ROOT / "assets" / path).is_file(), path


# ---------------------------------------------------------------- the final, recall, and the end


async def test_the_final_is_one_player_against_csat(engine, g, clock):
    assert not (await run(engine, GM, "gm.overview.send", {"overview": "final", "chars": ["ves", "tomo"]}))["ok"]
    rid = await send(engine, "final", ["marlo"])
    tv = view(engine, STAGE)["race"]
    assert tv["final"] and tv["laps"] == 3
    assert [e["id"] for e in tv["entries"]] == ["marlo", "csat"] and tv["entries"][1]["csat"]
    me = view(engine, MARLO)["race"]
    assert me["final"] and me["name"] == "ALIBI"  # a fresh bot, full prep
    await prep(engine, MARLO, rid)
    assert view(engine, STAGE)["race"]["start"] == pytest.approx(clock.t + g.lead + g.intro)  # CSAT-1 rolls in first


async def test_a_new_race_replaces_the_old_one_everywhere(engine):
    await send(engine, "race", ["ves", "tomo"])
    rid = await send(engine, "race", ["lale"])
    assert set(engine.state.race.preps) == {"lale"} and engine.state.race.id == rid
    assert set(view(engine, GM)["overviews"]["open"]) == {"lale"}


async def test_taking_back_the_last_one_still_prepping_starts_the_race(engine, clock, g):
    rid = await send(engine, "race", ["ves", "tomo"])
    await prep(engine, TOMO, rid)
    await ok(engine, GM, "gm.overview.recall", {"char": "ves"})
    assert list(engine.state.race.preps) == ["tomo"]
    assert engine.state.race.start == pytest.approx(clock.t + g.lead)


async def test_sending_a_racer_something_else_takes_them_out(engine):
    await send(engine, "race", ["ves", "tomo"])
    await ok(engine, GM, "gm.overview.send", {"overview": "golf", "chars": ["ves"]})
    assert list(engine.state.race.preps) == ["tomo"]


async def test_once_its_running_it_runs_and_then_closes_itself(engine, clock, g):
    rid = await send(engine, "race", ["ves"])
    await prep(engine, VES, rid)
    start = engine.state.race.start
    await ok(engine, GM, "gm.overview.recall", {"char": "ves"})  # the TV's race goes on
    assert engine.state.race and engine.state.race.start == start
    clock.t = start + 100
    await engine.sweep(set())
    assert engine.state.race is not None
    clock.t = start + 3.3 + 100 + g.hold
    await engine.sweep(set())
    assert engine.state.race is None and view(engine, STAGE)["race"] is None


async def test_its_prep_closes_on_the_laptops_when_the_race_does(engine, clock, g):
    rid = await send(engine, "race", ["ves", "tomo"])
    await prep(engine, VES, rid)
    await prep(engine, TOMO, rid)
    assert set(engine.state.overviews) == {"ves", "tomo"}
    clock.t = engine.state.race.start + 3.3 + 100 + g.hold
    await engine.sweep(set())
    assert engine.state.overviews == {}
