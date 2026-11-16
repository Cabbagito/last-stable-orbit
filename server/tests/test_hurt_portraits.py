"""Hurt and Down portraits (the LSO — Hurt portraits canvas). A face swaps to its Hurt art at two thirds of max health or
less and to its Down art at 0, everywhere it's sent. An NPC's health is the GM's until it's in a fight, and so is how hurt
it looks: a player outside the fight sees its own portrait."""

import pytest

from lso.auth import Viewer
from lso.config import ROOT
from lso.content import load_content
from lso.engine import Engine
from lso.store import Store
from lso.views import _face, project, referenced_assets

GM = Viewer("gm", "gm")
TOMO = Viewer("tomo", "player")
EH = "event-horizon"


class Dice:
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
    assert ack["ok"], ack


@pytest.mark.parametrize(
    "hp, top, face",
    [(9, 9, ""), (7, 9, ""), (6, 9, "-hurt"), (1, 9, "-hurt"), (0, 9, "-down"), (3, 4, ""), (2, 4, "-hurt"), (-1, 4, "-down")],
)
def test_the_thresholds(content, hp, top, face):
    assert _face(content.characters["tomo"], hp, top) == f"/assets/portraits/tomo{face}.gif"


def test_every_hurt_face_is_on_disk(content):
    who = list(content.characters.values()) + [content.npcs["fixer"], content.npcs["dax"]]
    for w in who:
        assert w.hurt and w.down
        assert (ROOT / "assets" / w.hurt).is_file() and (ROOT / "assets" / w.down).is_file()


async def test_the_crew_wear_it_everywhere(engine):
    await run(engine, GM, "gm.vitals.set", {"char": "tomo", "hp": 3})
    for viewer in (GM, TOMO):
        v = project(engine.state, engine.content, viewer)
        assert next(c for c in v["crew"] if c["id"] == "tomo")["portrait"] == "/assets/portraits/tomo-hurt.gif"
        toks = [t for t in v["tokens"].values() if t["kind"] == "crew" and t["ref"] == "tomo"]
        assert toks and all(t["portrait"] == "/assets/portraits/tomo-hurt.gif" for t in toks)
        assert "portraits/tomo-hurt.gif" in referenced_assets(v)


async def test_an_npc_looks_hurt_to_players_only_in_a_fight(engine):
    await run(engine, GM, "gm.npc.hp", {"token": "fixer", "hp": 4})
    face = lambda viewer: project(engine.state, engine.content, viewer)["tokens"]["fixer"]["portrait"]
    assert face(GM) == "/assets/portraits/fixer-hurt.gif"  # the GM knows its health
    assert face(TOMO) == "/assets/portraits/fixer.gif"  # a player doesn't, outside a fight
    assert "portraits/fixer-hurt.gif" not in referenced_assets(project(engine.state, engine.content, TOMO))
    engine.rng = Dice(3, 4)
    await run(engine, GM, "gm.fight.start", {"map": EH, "tokens": ["tomo", "fixer"]})
    assert face(TOMO) == "/assets/portraits/fixer-hurt.gif"
    v = project(engine.state, engine.content, TOMO)
    assert next(x for x in v["fights"][0]["fighters"] if x["token"] == "fixer")["portrait"] == "/assets/portraits/fixer-hurt.gif"
    await run(engine, GM, "gm.npc.hp", {"token": "fixer", "hp": 0})
    assert face(TOMO) == "/assets/portraits/fixer-down.gif"
