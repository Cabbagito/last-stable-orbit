"""Things in the world to inspect: players see only what the GM reveals, and each player's "looked at" is their own."""

import json

import pytest

from lso.auth import Viewer
from lso.commands import CommandError, handle
from lso.config import ROOT
from lso.content import ContentError, check_refs, load_content
from lso.engine import Engine
from lso.models import GameState, MapState, Preset
from lso.state import apply
from lso.store import Store
from lso.views import project

GM = Viewer("gm", "gm")
TALLY = Viewer("tally", "player")
MARLO = Viewer("marlo", "player")
EH = "event-horizon"
SLOTS_TEXT = "Nobody here seems to lose."


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


@pytest.fixture
def engine(content, tmp_path):
    return Engine(content, Store(tmp_path / "t.db"))


async def run(engine, viewer, kind, args):
    ack, _ = await engine.run(viewer, None, kind, args)
    return ack


def objects(view, map_id=EH):
    return {o["id"]: o for o in view["maps"][map_id]["objects"]}


def codes(fn):
    with pytest.raises(CommandError) as e:
        fn()
    return e.value.code


def proj(origin, at):
    ox, oy = origin
    x, y, z = at
    return ((x - y) * 30 + ox) * 2, ((x + y) * 15 - z * 36 + oy) * 2


def test_markers_sit_on_the_art(content):
    m = content.maps[EH]
    mural, slots = m.object("mural"), m.object("slots")
    # measured on base-open.png (1280 x 720, drawn at 2x): the mural's robes and the row of machines
    assert proj(m.origin, mural.at) == pytest.approx((840, 400), abs=1)
    assert proj(m.origin, slots.at) == pytest.approx((300, 500), abs=1)


def test_session_1_reveals_the_bar(engine, content):
    assert engine.state.maps[EH].shown == ["mural", "slots"]
    t = objects(project(engine.state, content, TALLY))
    assert set(t) == {"mural", "slots"} and not t["mural"]["seen"]
    assert t["mural"]["codex"] == "the-founder" and t["mural"]["closeup"] == [878, 296]


async def test_hidden_objects_never_reach_players(engine, content):
    assert (await run(engine, GM, "gm.object.show", {"map": EH, "object": "slots", "shown": False}))["ok"]
    t = project(engine.state, content, TALLY)
    assert set(objects(t)) == {"mural"}
    assert SLOTS_TEXT not in json.dumps(t) and "Slot machines" not in json.dumps(t)
    g = objects(project(engine.state, content, GM))
    assert g["slots"]["shown"] is False and g["mural"]["shown"] is True and "seen" not in g["slots"]
    assert (await run(engine, GM, "gm.object.show", {"map": EH, "object": "slots", "shown": True}))["ok"]
    assert "slots" in objects(project(engine.state, content, TALLY))


async def test_only_the_gm_reveals(engine, content):
    assert codes(lambda: handle(TALLY, engine.state, content, "gm.object.show", {"map": EH, "object": "slots", "shown": False})) == "forbidden"
    for args in [{"map": EH, "object": "jukebox", "shown": True}, {"map": "nowhere", "object": "mural", "shown": True}]:
        assert codes(lambda: handle(GM, engine.state, content, "gm.object.show", args)) == "invalid"
    assert handle(GM, engine.state, content, "gm.object.show", {"map": EH, "object": "mural", "shown": True}) == []


async def test_looking_is_per_player(engine, content):
    assert (await run(engine, TALLY, "object.seen", {"map": EH, "object": "mural"}))["ok"]
    assert objects(project(engine.state, content, TALLY))["mural"]["seen"] is True
    assert objects(project(engine.state, content, MARLO))["mural"]["seen"] is False
    assert handle(TALLY, engine.state, content, "object.seen", {"map": EH, "object": "mural"}) == []  # nothing new to log
    assert codes(lambda: handle(GM, engine.state, content, "object.seen", {"map": EH, "object": "mural"})) == "invalid"


async def test_you_cant_inspect_what_isnt_there(engine, content):
    await run(engine, GM, "gm.object.show", {"map": EH, "object": "slots", "shown": False})
    for args in [{"map": EH, "object": "slots"}, {"map": EH, "object": "jukebox"}, {"map": "patience", "object": "mural"}]:
        assert codes(lambda: handle(TALLY, engine.state, content, "object.seen", args)) == "invalid", args


def test_presets_name_real_objects(content):
    c = load_content(ROOT / "content")
    c.presets = {"x": Preset(id="x", name="x", default=True, party_map=EH, maps={EH: MapState(mood="open", shown=["jukebox"])})}
    with pytest.raises(ContentError, match="no object 'jukebox'"):
        check_refs(c)


async def test_reveals_and_looks_survive_a_restart(content, tmp_path):
    e1 = Engine(content, Store(tmp_path / "r.db"))
    await e1.run(GM, None, "gm.object.show", {"map": EH, "object": "slots", "shown": False})
    await e1.run(TALLY, None, "object.seen", {"map": EH, "object": "mural"})
    before = e1.state.model_dump(mode="json")
    state = GameState()
    for seq, ev_type, data in e1.store.events():
        state = apply(state, seq, ev_type, json.loads(data))
    assert state.model_dump(mode="json") == before
    e1.store.close()
    e2 = Engine(content, Store(tmp_path / "r.db"))
    assert e2.state.maps[EH].shown == ["mural"] and e2.state.seen == {"tally": ["event-horizon/mural"]}


def test_npc_codex_and_chrome_text_reach_the_card(engine, content):
    v = project(engine.state, content, TALLY)
    assert v["tokens"]["fixer"]["codex"] == "the-fixer"
    ves = next(c for c in v["crew"] if c["id"] == "ves")
    assert next(e for e in ves["list"] if e["name"] == "Silent legs")["text"]


def test_tallys_look_sends_marlo_nothing(client, seat):
    tally, marlo = seat("tally"), seat("marlo")
    with client.websocket_connect("/ws", headers=tally) as t, client.websocket_connect("/ws", headers=marlo) as m:
        t.receive_json(), m.receive_json()
        t.send_json({"t": "intent", "id": "look", "type": "object.seen", "args": {"map": EH, "object": "mural"}})
        while (f := t.receive_json())["t"] != "ack":
            assert f["t"] == "view"
        assert f["ok"]
        m.send_json({"t": "ping"})
        assert m.receive_json()["t"] == "pong"  # Tally's "looked at" is hers alone
