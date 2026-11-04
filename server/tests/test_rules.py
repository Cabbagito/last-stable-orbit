"""Commands, the reducer, projections and replay, without any network."""

import json

import pytest

from lso.auth import Viewer
from lso.commands import CommandError, handle
from lso.config import ROOT
from lso.content import load_content
from lso.engine import Engine
from lso.models import GameState
from lso.state import apply
from lso.store import Store
from lso.views import project

GM = Viewer("gm", "gm")
VES = Viewer("ves", "player")
LALE = Viewer("lale", "player")


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


@pytest.fixture
def engine(content, tmp_path):
    return Engine(content, Store(tmp_path / "t.db"))


async def run(engine, viewer, kind, args, iid=None):
    return await engine.run(viewer, iid, kind, args)


def codes(fn):
    with pytest.raises(CommandError) as e:
        fn()
    return e.value.code


async def test_seeded_from_default_preset(engine):
    s = engine.state
    assert s.seq == 1 and s.party_map == "event-horizon"
    assert s.maps["event-horizon"].mood == "open"
    assert {t.ref for t in s.tokens.values() if t.kind == "crew"} == {"lale", "marlo", "tally", "ves", "tomo"}
    assert s.vitals["ves"].hp == 6 and s.vitals["ves"].entropy == 2
    assert "hired-gun" not in s.tokens


async def test_players_move_only_their_own_token(engine, content):
    ack, changed = await run(engine, VES, "token.move", {"token": "ves", "at": [5, 5, 0]})
    assert ack["ok"] and changed and engine.state.tokens["ves"].at == (5, 5, 0)
    ack, _ = await run(engine, VES, "token.move", {"token": "dax", "at": [5, 5, 0]})
    assert ack == {"id": None, "ok": False, "code": "forbidden", "error": "you can't move that token"}
    ack, _ = await run(engine, VES, "token.move", {"token": "lale", "at": [5, 5, 0]})
    assert ack["code"] == "forbidden"
    ack, _ = await run(engine, GM, "token.move", {"token": "dax", "at": [1, 2, 0]})
    assert ack["ok"]
    assert codes(lambda: handle(VES, engine.state, content, "token.move", {"token": "ves", "at": [1, "x", 0]})) == "invalid"
    assert codes(lambda: handle(VES, engine.state, content, "token.move", {"token": "ves", "at": [1e9, 0, 0]})) == "invalid"


async def test_gm_only_intents(engine, content):
    for kind, args in [
        ("gm.map.mood", {"map": "event-horizon", "mood": "stand"}),
        ("gm.vitals.set", {"char": "ves", "hp": 1}),
        ("gm.token.hide", {"token": "dax", "hidden": True}),
        ("gm.world.load_preset", {"preset": "session-1"}),
    ]:
        assert codes(lambda: handle(VES, engine.state, content, kind, args)) == "forbidden"


async def test_map_mood_and_switches(engine, content):
    assert (await run(engine, GM, "gm.map.mood", {"map": "event-horizon", "mood": "stand"}))[0]["ok"]
    assert (await run(engine, GM, "gm.map.switch", {"map": "event-horizon", "switch": "gas", "value": 3}))[0]["ok"]
    assert (await run(engine, GM, "gm.map.switch", {"map": "event-horizon", "switch": "hatch", "value": True}))[0]["ok"]
    ms = engine.state.maps["event-horizon"]
    assert ms.mood == "stand" and ms.switches == {"gas": 3, "hatch": 1}
    bad = [
        {"map": "event-horizon", "switch": "gas", "value": 4},
        {"map": "event-horizon", "switch": "hatch", "value": 2},
        {"map": "event-horizon", "switch": "nope", "value": 1},
        {"map": "nowhere", "switch": "gas", "value": 1},
    ]
    for args in bad:
        assert codes(lambda: handle(GM, engine.state, content, "gm.map.switch", args)) == "invalid"
    assert codes(lambda: handle(GM, engine.state, content, "gm.map.mood", {"map": "event-horizon", "mood": "party"})) == "invalid"


async def test_vitals_clamp(engine):
    await run(engine, GM, "gm.vitals.set", {"char": "tomo", "hp": -3, "entropy": 9})
    assert engine.state.vitals["tomo"].hp == 0 and engine.state.vitals["tomo"].entropy == 6
    await run(engine, GM, "gm.vitals.set", {"char": "tomo", "hp": 4})
    assert engine.state.vitals["tomo"].hp == 4 and engine.state.vitals["tomo"].entropy == 6


async def test_place_hide_remove(engine, content):
    await run(engine, GM, "gm.token.place", {"ref": "hired-gun", "map": "event-horizon", "at": [3, 3, 0], "hidden": True})
    await run(engine, GM, "gm.token.place", {"ref": "hired-gun", "map": "event-horizon", "at": [4, 4, 0]})
    assert engine.state.tokens["hired-gun"].hidden and not engine.state.tokens["hired-gun-2"].hidden
    await run(engine, GM, "gm.token.remove", {"token": "hired-gun-2"})
    assert "hired-gun-2" not in engine.state.tokens
    assert codes(lambda: handle(GM, engine.state, content, "gm.token.remove", {"token": "ves"})) == "invalid"
    assert codes(lambda: handle(GM, engine.state, content, "gm.token.place", {"ref": "ves", "map": "event-horizon", "at": [0, 0, 0]})) == "invalid"


async def test_retried_intent_applies_once(engine):
    a1, c1 = await run(engine, GM, "gm.vitals.set", {"char": "lale", "hp": 5}, iid="abc")
    a2, c2 = await run(engine, GM, "gm.vitals.set", {"char": "lale", "hp": 1}, iid="abc")
    assert a1 == a2 and c1 and not c2 and engine.state.vitals["lale"].hp == 5


async def test_load_preset(engine):
    await run(engine, GM, "gm.map.mood", {"map": "event-horizon", "mood": "stand"})
    await run(engine, GM, "gm.world.load_preset", {"preset": "bar-after-hours"})
    s = engine.state
    assert s.maps["event-horizon"].mood == "after" and s.tokens["cleaner-14"].hidden and "fixer" not in s.tokens


def test_player_projection_hides_secrets(engine, content):
    st = engine.state.model_copy(deep=True)
    st.tokens["cleaner-14"].hidden = True
    view = json.dumps(project(st, content, VES))
    assert "cleaner-14" not in view and "Cleaner Unit 14" not in view and "Its eyes slide" not in view
    assert "gm_note" not in view
    for n in content.npcs.values():  # no NPC's GM note, visible token or not
        if n.gm_note:
            assert n.gm_note not in view
    assert "roster" not in view and "presets" not in view
    v = project(st, content, VES)
    assert list(v["inventory"]) == ["ves"]  # only her own pockets
    assert list(v["maps"]) == ["event-horizon"]
    g = project(st, content, GM)
    assert g["tokens"]["cleaner-14"]["hidden"] is True and "gm_note" in g["tokens"]["dax"]
    assert set(g["inventory"]) == {"lale", "marlo", "tally", "ves", "tomo"}


def test_split_party_sees_own_map(engine, content):
    st = engine.state.model_copy(deep=True)
    st.tokens["lale"].map = "elsewhere"  # not a real map: Lale sees no map rather than the bar
    v = project(st, content, LALE)
    assert v["party_map"] == "elsewhere" and v["maps"] == {}
    assert "ves" not in v["tokens"]


async def test_replay_rebuilds_snapshot(engine):
    await run(engine, VES, "token.move", {"token": "ves", "at": [7, 7, 0]})
    await run(engine, GM, "gm.map.mood", {"map": "event-horizon", "mood": "after"})
    await run(engine, GM, "gm.map.switch", {"map": "event-horizon", "switch": "seals_box", "value": 1})
    await run(engine, GM, "gm.token.place", {"ref": "hired-gun", "map": "event-horizon", "at": [3, 3, 0]})
    await run(engine, GM, "gm.vitals.set", {"char": "ves", "entropy": 5})
    state = GameState()
    for seq, ev_type, data in engine.store.events():
        state = apply(state, seq, ev_type, json.loads(data))
    snap_seq, snap = engine.store.load_snapshot()
    assert state.model_dump(mode="json") == snap and snap_seq == engine.state.seq == 6


async def test_restart_keeps_state(content, tmp_path):
    e1 = Engine(content, Store(tmp_path / "r.db"))
    await e1.run(GM, None, "gm.vitals.set", {"char": "ves", "hp": 2})
    e1.store.close()
    e2 = Engine(content, Store(tmp_path / "r.db"))
    assert e2.state.vitals["ves"].hp == 2 and e2.state.seq == 2
