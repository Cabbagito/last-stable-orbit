"""M8: fights. The GM picks who's in a fight on one map, and everyone's Reflex, rolled once on the server, sets the
order. Next skips whoever is down. A player sees only the fight on their own map; the TV lists every fight without
saying whose turn it is; a hidden token, an NPC's dice and its GM note never reach anyone but the GM."""

import json

import pytest

from lso import rules
from lso.auth import Viewer
from lso.config import ROOT
from lso.content import load_content
from lso.engine import Engine
from lso.models import GameState
from lso.store import Store
from lso.views import project, referenced_assets

GM = Viewer("gm", "gm")
STAGE = Viewer("stage", "stage")
TOMO = Viewer("tomo", "player")
VES = Viewer("ves", "player")
EH = "event-horizon"
CREW_EH = ["lale", "marlo", "tally", "ves", "tomo"]  # Reflex d6, d8, d10, d20, d8


class Dice:
    """A scripted die: each randint returns the next value."""

    def __init__(self, *values):
        self.values = list(values)

    def randint(self, a, b):
        return self.values.pop(0)

    def randrange(self, stop):
        return 7


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


@pytest.fixture
def engine(content, tmp_path):
    return Engine(content, Store(tmp_path / "t.db"), clock=lambda: 1000.0)


async def run(engine, viewer, kind, args):
    ack, _ = await engine.run(viewer, None, kind, args)
    return ack


def fights(engine, viewer):
    return project(engine.state, engine.content, viewer)["fights"]


async def start(engine, tokens, *dice, map_id=EH):
    engine.rng = Dice(*dice)
    ack = await run(engine, GM, "gm.fight.start", {"map": map_id, "tokens": tokens})
    assert ack["ok"], ack
    return engine.state.fights[map_id]


# ---------------------------------------------------------------- the order


@pytest.mark.parametrize(
    "fighters, order",
    [
        ({"a": (9, 6, True), "b": (12, 6, True), "c": (3, 6, True)}, ["b", "a", "c"]),
        ({"ves": (7, 20, True), "guard": (7, 10, False)}, ["ves", "guard"]),  # a tie goes to the bigger die
        ({"gun": (7, 12, False), "tally": (7, 10, True)}, ["gun", "tally"]),  # ... even over the crew
        ({"guard": (5, 8, False), "marlo": (5, 8, True)}, ["marlo", "guard"]),  # then the crew
        ({"tomo": (5, 8, True), "marlo": (5, 8, True)}, ["marlo", "tomo"]),  # then the id, never luck
    ],
)
def test_the_turn_order(fighters, order):
    assert rules.turn_order(fighters) == order


async def test_starting_rolls_everyones_reflex(engine):
    # lale d6: 3, marlo d8: 5, tally d10: 9, ves d20: 20 then 4 (it explodes), tomo d8: 5, the fixer d10: 7
    f = await start(engine, CREW_EH + ["fixer"], 3, 5, 9, 20, 4, 5, 7)
    assert f.ini == {"lale": 3, "marlo": 5, "tally": 9, "ves": 24, "tomo": 5, "fixer": 7}
    assert f.order == ["ves", "tally", "fixer", "marlo", "tomo", "lale"]
    assert f.rolled == CREW_EH + ["fixer"] and (f.turn, f.round, f.started) == (0, 1, 1000.0)


async def test_a_hidden_npc_joins_in_plain_sight(engine):
    assert (await run(engine, GM, "gm.token.place", {"ref": "guard", "map": EH, "at": [8, 11, 0], "hidden": True}))["ok"]
    await start(engine, ["ves", "guard"], 4, 6)
    assert not engine.state.tokens["guard"].hidden


async def test_what_a_fight_refuses(engine):
    assert (await run(engine, TOMO, "gm.fight.start", {"map": EH, "tokens": ["tomo", "fixer"]}))["code"] == "forbidden"
    assert not (await run(engine, GM, "gm.fight.start", {"map": EH, "tokens": ["tomo"]}))["ok"]
    assert not (await run(engine, GM, "gm.fight.start", {"map": EH, "tokens": ["tomo", "tomo"]}))["ok"]
    assert not (await run(engine, GM, "gm.fight.start", {"map": "promenade", "tokens": ["tomo", "fixer"]}))["ok"]
    assert not (await run(engine, GM, "gm.fight.start", {"map": "nowhere", "tokens": ["tomo", "fixer"]}))["ok"]
    assert not (await run(engine, GM, "gm.fight.next", {"map": EH}))["ok"]  # no fight yet
    await start(engine, ["tomo", "fixer"], 3, 4)
    assert not (await run(engine, GM, "gm.fight.start", {"map": EH, "tokens": ["ves", "dax"]}))["ok"]
    assert not (await run(engine, GM, "gm.fight.add", {"map": EH, "token": "tomo"}))["ok"]


# ---------------------------------------------------------------- turns


async def test_next_skips_whoever_is_down_and_wraps_the_round(engine):
    f = await start(engine, ["lale", "tomo", "fixer"], 2, 6, 4)  # tomo, the fixer, lale
    assert f.order == ["tomo", "fixer", "lale"]
    assert (await run(engine, GM, "gm.npc.hp", {"token": "fixer", "hp": 0}))["ok"]
    await run(engine, GM, "gm.fight.next", {"map": EH})
    assert engine.state.fights[EH].turn == 2  # past the fixer, down
    await run(engine, GM, "gm.vitals.set", {"char": "tomo", "hp": 0})
    await run(engine, GM, "gm.fight.next", {"map": EH})
    f = engine.state.fights[EH]
    assert (f.turn, f.round) == (2, 2)  # round 2: Tomo and the fixer are both down, so it's Lale again
    await run(engine, GM, "gm.vitals.set", {"char": "tomo", "hp": 3})  # On your feet
    await run(engine, GM, "gm.fight.next", {"map": EH})
    f = engine.state.fights[EH]
    assert (f.order[f.turn], f.round) == ("tomo", 3)


async def test_joining_and_leaving_keep_whoevers_turn_it_is(engine):
    await start(engine, ["lale", "tomo"], 2, 6)  # tomo, lale
    await run(engine, GM, "gm.fight.next", {"map": EH})  # Lale's turn
    engine.rng = Dice(7)
    assert (await run(engine, GM, "gm.fight.add", {"map": EH, "token": "fixer"}))["ok"]
    f = engine.state.fights[EH]
    assert f.order == ["fixer", "tomo", "lale"] and f.order[f.turn] == "lale" and f.ini["fixer"] == 7
    assert (await run(engine, GM, "gm.fight.remove", {"map": EH, "token": "lale"}))["ok"]
    f = engine.state.fights[EH]
    assert f.order == ["fixer", "tomo"] and f.turn == 0 and "lale" not in f.ini  # her turn passed on, round to the top
    assert (await run(engine, GM, "gm.fight.end", {"map": EH}))["ok"]
    assert EH not in engine.state.fights


async def test_a_fighter_who_leaves_the_map_leaves_the_fight(engine):
    assert (await run(engine, GM, "gm.token.place", {"ref": "hired-gun", "map": EH, "at": [6, 6, 0]}))["ok"]
    await start(engine, ["tomo", "hired-gun", "ves"], 3, 5, 9)
    await run(engine, GM, "gm.token.remove", {"token": "hired-gun"})
    assert engine.state.fights[EH].order == ["ves", "tomo"]
    await run(engine, GM, "gm.crew.send", {"map": "promenade"})  # everyone goes: nobody's left to fight
    assert EH not in engine.state.fights


async def test_npc_health_is_clamped_and_kept_after_the_fight(engine):
    assert not (await run(engine, GM, "gm.npc.hp", {"token": "tomo", "hp": 3}))["ok"]
    assert (await run(engine, GM, "gm.npc.hp", {"token": "fixer", "hp": 99}))["ok"]
    assert engine.state.tokens["fixer"].hp is None  # already full: nothing to do
    await run(engine, GM, "gm.npc.hp", {"token": "fixer", "hp": -4})
    assert engine.state.tokens["fixer"].hp == 0
    await run(engine, GM, "gm.npc.hp", {"token": "fixer", "hp": 6})
    await start(engine, ["tomo", "fixer"], 3, 4)
    await run(engine, GM, "gm.fight.end", {"map": EH})
    assert engine.state.tokens["fixer"].hp == 6


# ---------------------------------------------------------------- who sees what


async def two_fights(engine):
    """The crew fight the fixer at the Event Horizon, and Ves fights a guard alone on the Promenade."""
    ves = engine.state.tokens["ves"]
    ves.map = "promenade"
    assert (await run(engine, GM, "gm.token.place", {"ref": "guard", "map": "promenade", "at": [3, 3, 0]}))["ok"]
    await start(engine, ["tomo", "lale", "fixer"], 5, 2, 7)
    await start(engine, ["ves", "guard"], 9, 3, map_id="promenade")


async def test_a_player_sees_only_the_fight_on_their_map(engine):
    await two_fights(engine)
    t = fights(engine, TOMO)
    assert [f["map"] for f in t] == [EH] and [x["token"] for x in t[0]["fighters"]] == ["fixer", "tomo", "lale"]
    assert t[0]["now"] == "fixer" and t[0]["round"] == 1 and t[0]["rolled"] == ["tomo", "lale", "fixer"]
    v = fights(engine, VES)
    assert [f["map"] for f in v] == ["promenade"] and v[0]["name"] == "The Promenade"
    assert "fixer" not in json.dumps(v)
    assert {f["map"] for f in fights(engine, GM)} == {EH, "promenade"}  # in map order


async def test_the_tv_shows_every_fights_roll_and_order_but_not_whose_turn_it_is(engine):
    await two_fights(engine)
    tv = fights(engine, STAGE)
    assert [f["map"] for f in tv] == [EH, "promenade"]  # the map the TV shows first
    for f in tv:
        assert set(f) == {"map", "name", "fighters", "rolled", "started"}  # no "now", no "round"
        for x in f["fighters"]:
            assert "ini" in x and "joined" in x
    # it may show the Promenade's fighters, though it's looking at the Event Horizon
    assert "portraits/guard.gif" in referenced_assets(project(engine.state, engine.content, STAGE))


async def test_no_npc_dice_or_notes_in_a_fight(engine):
    await two_fights(engine)
    fixer = engine.content.npcs["fixer"]
    for viewer in (TOMO, VES, STAGE, GM):
        sent = json.dumps(fights(engine, viewer))
        assert fixer.gm_note not in sent and '"stats"' not in sent and '"gm_note"' not in sent


async def test_a_hidden_fighter_vanishes_from_everyone_but_the_gm(engine):
    await start(engine, ["tomo", "fixer"], 3, 8)  # the fixer goes first
    await run(engine, GM, "gm.token.hide", {"token": "fixer", "hidden": True})
    for viewer in (TOMO, STAGE):
        f = fights(engine, viewer)[0]
        assert [x["token"] for x in f["fighters"]] == ["tomo"]
        assert "fixer" not in json.dumps(f) and "The fixer" not in json.dumps(f)
    assert fights(engine, TOMO)[0]["now"] is None  # it's the fixer's turn, and Tomo can't see him
    assert [x["token"] for x in fights(engine, GM)[0]["fighters"]] == ["fixer", "tomo"]


async def test_npc_health_shows_only_in_a_fight(engine):
    await run(engine, GM, "gm.npc.hp", {"token": "fixer", "hp": 6})
    assert "hp" not in project(engine.state, engine.content, TOMO)["tokens"]["fixer"]
    await start(engine, ["tomo", "fixer"], 3, 8)
    x = next(x for x in fights(engine, TOMO)[0]["fighters"] if x["token"] == "fixer")
    assert (x["hp"], x["health"], x["kind"]) == (6, 10, "npc")
    t = next(x for x in fights(engine, TOMO)[0]["fighters"] if x["token"] == "tomo")
    assert (t["hp"], t["health"]) == (9, 9)


async def test_a_dark_place_keeps_its_dark_name(engine):
    await run(engine, GM, "gm.token.place", {"ref": "guard", "map": "terminal", "at": [3, 3, 0]})
    await run(engine, GM, "gm.token.place", {"ref": "cleaner-bot", "map": "terminal", "at": [4, 3, 0]})
    await start(engine, ["guard", "cleaner-bot"], 3, 4, map_id="terminal")
    assert fights(engine, STAGE)[0]["name"] == "The core"
    assert fights(engine, GM)[0]["name"] == "The Terminal room"


def test_an_old_save_loads(content, tmp_path):
    store = Store(tmp_path / "old.db")
    Engine(content, store)
    old = store.load_snapshot()[1]
    old.pop("fights")
    for t in old["tokens"].values():
        t.pop("hp")
    store.commit("system", None, [], old, {})
    e = Engine(content, store)
    assert e.state.fights == {} and all(t.hp is None for t in e.state.tokens.values())
    assert isinstance(e.state, GameState)
