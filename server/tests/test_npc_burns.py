"""Lucan's three Burns: only the GM sees them, the GM plays them, and only the TV ever gets their films. A player's laptop
never hears of them, not even while one plays."""

import json

import pytest

from lso.auth import Viewer
from lso.config import ROOT
from lso.content import load_content
from lso.engine import Engine
from lso.store import Store
from lso.views import project, referenced_assets

GM = Viewer("gm", "gm")
STAGE = Viewer("stage", "stage")
PLAYERS = [Viewer(c, "player") for c in ("lale", "marlo", "tally", "ves", "tomo")]
EH = "event-horizon"
NAMES = ("Legendary Action", "Nothing personal", "Unfinished business")


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


async def place_lucan(engine):
    assert (await run(engine, GM, "gm.token.place", {"ref": "fixer", "map": EH, "at": [6, 6, 0]}))["ok"]
    return next(t for t in engine.state.tokens if engine.state.tokens[t].ref == "fixer")


def test_lucan_has_three_burns(content):
    assert [b.name for b in content.npcs["fixer"].burns] == list(NAMES)
    assert not content.missing_assets


async def test_only_the_gm_sees_lucans_burns(engine):
    tid = await place_lucan(engine)
    gm = project(engine.state, engine.content, GM)["tokens"][tid]
    assert [b["name"] for b in gm["burns"]] == list(NAMES)
    for p in PLAYERS:
        v = project(engine.state, engine.content, p)
        assert "burns" not in v["tokens"][tid]
        dump = json.dumps(v)
        assert not any(n in dump for n in NAMES) and "lucan-" not in dump


async def test_the_gm_plays_one_on_the_tv_and_the_laptops_never_hear_of_it(engine, clock):
    await place_lucan(engine)
    assert (await run(engine, GM, "gm.npc.burn", {"npc": "fixer", "burn": "nothing-personal"}))["ok"]
    nb = engine.state.stage.npc_burn
    assert nb.npc == "fixer" and nb.ends > clock.t + 9
    tv = project(engine.state, engine.content, STAGE)
    assert tv["stage"]["npc_burn"]["src"] == "/assets/films/burns/lucan-nothing-personal.mp4"
    assert "films/burns/lucan-nothing-personal.mp4" in referenced_assets(tv)
    assert project(engine.state, engine.content, GM)["stage"]["npc_burn"]["name"] == "Nothing personal"
    for p in PLAYERS:
        v = project(engine.state, engine.content, p)
        assert "npc_burn" not in v["stage"] and "npc_burn_films" not in v["stage"]
        assert not any(a.startswith("films/burns/lucan-") for a in referenced_assets(v))
        assert "Nothing personal" not in json.dumps(v)
    clock.t = nb.ends + 0.1
    assert await engine.sweep(set())
    assert engine.state.stage.npc_burn is None


async def test_one_film_at_a_time(engine, clock):
    assert (await run(engine, GM, "gm.npc.burn", {"npc": "fixer", "burn": "legendary-action"}))["ok"]
    assert not (await run(engine, GM, "gm.npc.burn", {"npc": "fixer", "burn": "unfinished-business"}))["ok"]
    assert not (await run(engine, PLAYERS[3], "burn.use", {}))["ok"]
    clock.t = engine.state.stage.npc_burn.ends + 0.1
    assert (await run(engine, PLAYERS[3], "burn.use", {}))["ok"]
    assert engine.state.stage.npc_burn is None and engine.state.stage.burn.char == "ves"
    assert not (await run(engine, GM, "gm.npc.burn", {"npc": "fixer", "burn": "unfinished-business"}))["ok"]


async def test_only_the_gm_and_only_real_burns(engine):
    assert not (await run(engine, PLAYERS[0], "gm.npc.burn", {"npc": "fixer", "burn": "legendary-action"}))["ok"]
    assert not (await run(engine, GM, "gm.npc.burn", {"npc": "fixer", "burn": "nope"}))["ok"]
    assert not (await run(engine, GM, "gm.npc.burn", {"npc": "dax", "burn": "legendary-action"}))["ok"]


def test_the_tv_has_every_lucan_film_ready(engine):
    tv = project(engine.state, engine.content, STAGE)["stage"]
    assert sorted(tv["npc_burn_films"]) == [f"/assets/films/burns/lucan-{n}.mp4" for n in ("legendary-action", "nothing-personal", "unfinished-business")]
