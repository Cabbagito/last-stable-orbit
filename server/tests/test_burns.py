"""The rules change of 2026-11-04: each character's own health, Burns and their films, and a failed skill's downside
on the TV once the GM calls the roll a failure."""

import pytest

from lso.auth import Viewer
from lso.config import ROOT
from lso.content import load_content
from lso.engine import Engine
from lso.models import RULES, GameState
from lso.store import Store
from lso.views import project, referenced_assets

GM = Viewer("gm", "gm")
STAGE = Viewer("stage", "stage")
VES = Viewer("ves", "player")
TALLY = Viewer("tally", "player")
HEALTH = {"lale": 5, "marlo": 5, "tally": 7, "ves": 4, "tomo": 9}


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def engine(content, tmp_path, clock):
    return Engine(content, Store(tmp_path / "t.db"), clock=clock)


async def run(engine, viewer, kind, args):
    ack, _ = await engine.run(viewer, None, kind, args)
    return ack


def crew(view, char):
    return next(c for c in view["crew"] if c["id"] == char)


# ---------------------------------------------------------------- health


def test_each_character_has_their_own_health(engine, content):
    assert {c: content.characters[c].health for c in HEALTH} == HEALTH
    v = project(engine.state, engine.content, VES)
    assert {c["id"]: (c["health"], c["hp"]) for c in v["crew"]} == {c: (h, h) for c, h in HEALTH.items()}


async def test_the_gm_sets_health_up_to_each_characters_own(engine):
    assert (await run(engine, GM, "gm.vitals.set", {"char": "tomo", "hp": 12}))["ok"]
    assert (await run(engine, GM, "gm.vitals.set", {"char": "ves", "hp": 12}))["ok"]
    assert engine.state.vitals["tomo"].hp == 9 and engine.state.vitals["ves"].hp == 4


def test_an_old_save_moves_to_each_characters_health(content, tmp_path):
    """Saved when everyone had 6: whoever was full is full again, someone hurt stays hurt, nobody keeps more."""
    store = Store(tmp_path / "old.db")
    Engine(content, store)
    old = GameState.model_validate(store.load_snapshot()[1])
    old.rules = 0
    for c in HEALTH:
        old.vitals[c].hp = 6
    old.vitals["tomo"].hp, old.vitals["ves"].hp = 3, 5
    store.commit("system", None, [], old.model_dump(mode="json"), {})
    e = Engine(content, store)
    assert {c: e.state.vitals[c].hp for c in HEALTH} == {"lale": 5, "marlo": 5, "tally": 7, "ves": 4, "tomo": 3}
    assert e.state.rules == RULES
    # and only once: a later boot leaves Tomo hurt
    e.state.vitals["tomo"].hp = 6
    store.commit("system", None, [], e.state.model_dump(mode="json"), {})
    assert Engine(content, store).state.vitals["tomo"].hp == 6


# ---------------------------------------------------------------- Burns


async def test_a_burn_spends_two_entropy_and_plays_on_the_tv(engine, clock):
    ack = await run(engine, VES, "burn.use", {})
    assert ack["ok"], ack
    assert engine.state.vitals["ves"].entropy == 0
    b = engine.state.stage.burn
    assert (b.char, b.cut) == ("ves", "fight") and b.ends - b.at == 2.5
    tv = project(engine.state, engine.content, STAGE)["stage"]["burn"]
    assert tv["src"] == "/assets/films/burns/gone.mp4" and tv["sound"] and tv["name"] == "Gone"
    # with a TV, the laptops go dark instead of playing it
    for viewer in (VES, TALLY, GM):
        laptop = project(engine.state, engine.content, viewer)["stage"]["burn"]
        assert laptop["char"] == "ves" and "src" not in laptop
    # and it ends by itself
    clock.t = b.ends + 0.1
    assert await engine.sweep(set())
    assert engine.state.stage.burn is None
    assert project(engine.state, engine.content, VES)["stage"]["burn"] is None


async def test_without_a_tv_every_laptop_plays_the_burn(engine):
    await run(engine, GM, "gm.stage.setup", {"setup": "notv"})
    assert (await run(engine, TALLY, "burn.use", {}))["ok"]
    for viewer, sound in ((VES, False), (TALLY, False), (GM, True)):
        b = project(engine.state, engine.content, viewer)["stage"]["burn"]
        assert b["src"] == "/assets/films/burns/recount.mp4" and b["sound"] is sound
    assert "src" not in project(engine.state, engine.content, STAGE)["stage"]["burn"]


async def test_a_burn_needs_two_entropy_and_a_quiet_screen(engine, clock):
    assert (await run(engine, GM, "gm.vitals.set", {"char": "ves", "entropy": 1}))["ok"]
    ack = await run(engine, VES, "burn.use", {})
    assert not ack["ok"] and "2 Entropy" in ack["error"]
    assert (await run(engine, TALLY, "burn.use", {}))["ok"]
    ack = await run(engine, GM, "gm.burn.use", {"char": "lale"})
    assert not ack["ok"] and "Burn is playing" in ack["error"]
    clock.t += 3
    ack = await run(engine, GM, "gm.film.play", {"cue": "shotgun"})
    assert ack["ok"], ack
    clock.t += 2
    ack = await run(engine, GM, "gm.burn.use", {"char": "lale"})
    assert not ack["ok"] and "film is playing" in ack["error"]


async def test_ves_can_just_vanish(engine):
    assert not (await run(engine, VES, "burn.use", {"cut": "nope"}))["ok"]
    assert (await run(engine, VES, "burn.use", {"cut": "quiet"}))["ok"]
    assert project(engine.state, engine.content, STAGE)["stage"]["burn"]["src"] == "/assets/films/burns/gone-quiet.mp4"


async def test_only_players_burn_their_own_and_the_gm_burns_for_anyone(engine):
    ack = await run(engine, GM, "burn.use", {})
    assert not ack["ok"]
    ack = await run(engine, VES, "gm.burn.use", {"char": "tomo"})
    assert not ack["ok"] and ack["code"] == "forbidden"
    assert (await run(engine, GM, "gm.burn.use", {"char": "tomo"}))["ok"]
    assert engine.state.vitals["tomo"].entropy == 0 and engine.state.stage.burn.char == "tomo"


def test_every_screen_has_every_burn_film_ready(engine):
    """Burns are public, like skills, and every screen loads the films ahead so they start at once."""
    films = {f"films/burns/{n}.mp4" for n in ("on-your-feet", "cheap-shot", "recount", "gone", "gone-quiet", "not-them")}
    for viewer in (VES, STAGE, GM):
        v = project(engine.state, engine.content, viewer)
        assert films <= referenced_assets(v)
        assert crew(v, "tomo")["burn"]["react"] == "hurt" and crew(v, "tally")["burn"]["react"] == "roll"
        assert [c["id"] for c in crew(v, "ves")["burn"]["cuts"]] == ["fight", "quiet"]


# ---------------------------------------------------------------- downsides


class Dice:
    """A scripted die: each randint returns the next value."""

    def __init__(self, *values):
        self.values = list(values)

    def randint(self, a, b):
        return self.values.pop(0)

    def randrange(self, stop):
        return 7


async def test_the_gm_calls_a_skill_roll_a_failure(engine):
    engine.rng = Dice(3)
    assert (await run(engine, VES, "roll.start", {"stat": "reflex", "entry": 0}))["ok"]
    rid = engine.state.rolls[-1].id
    ack = await run(engine, GM, "gm.roll.failed", {"roll": rid})
    assert not ack["ok"] and "landed" in ack["error"]
    await run(engine, VES, "roll.reveal", {"roll": rid, "shown": 1})
    assert not (await run(engine, VES, "gm.roll.failed", {"roll": rid}))["ok"]
    assert (await run(engine, GM, "gm.roll.failed", {"roll": rid}))["ok"]
    tv = next(r for r in project(engine.state, engine.content, STAGE)["rolls"] if r["id"] == rid)
    assert tv["failed"] and tv["entry"] == "Been in worse vents"
    # a plain roll has no downside to show
    engine.rng = Dice(3)
    await run(engine, VES, "roll.start", {"stat": "reflex"})
    rid = engine.state.rolls[-1].id
    await run(engine, VES, "roll.reveal", {"roll": rid, "shown": 1})
    assert not (await run(engine, GM, "gm.roll.failed", {"roll": rid}))["ok"]


async def test_a_natural_one_always_fails(engine):
    engine.rng = Dice(1)
    await run(engine, VES, "roll.start", {"stat": "reflex", "entry": 1})
    rid = engine.state.rolls[-1].id
    await run(engine, VES, "roll.reveal", {"roll": rid, "shown": 1})
    tv = next(r for r in project(engine.state, engine.content, STAGE)["rolls"] if r["id"] == rid)
    assert tv["failed"] and tv["phase"] == "nat1"
