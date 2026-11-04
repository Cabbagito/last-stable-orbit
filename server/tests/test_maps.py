"""M5: more maps. Their camera cones and decals, the GM-only pins, sending the crew to a map, the TV following one
of the crew across maps, and a saved game gaining maps the content didn't have when it was saved."""

import json

import pytest

from lso.auth import Viewer
from lso.config import ROOT
from lso.content import load_content
from lso.engine import Engine
from lso.models import GameState, MapState
from lso.store import Store
from lso.views import project, referenced_assets

GM = Viewer("gm", "gm")
STAGE = Viewer("stage", "stage")
VES = Viewer("ves", "player")
CREW = ["lale", "marlo", "tally", "ves", "tomo"]


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


@pytest.fixture
def engine(content, tmp_path):
    return Engine(content, Store(tmp_path / "t.db"), clock=lambda: 1000.0)


async def ok(engine, viewer, kind, args):
    ack, _ = await engine.run(viewer, None, kind, args)
    assert ack["ok"], ack
    return ack


def crew_token(state, char):
    return next(t for t in state.tokens.values() if t.kind == "crew" and t.ref == char)


def test_every_map_has_its_art_and_somewhere_to_arrive(content):
    assert {"event-horizon", "promenade", "patience"} <= set(content.maps)
    assert content.missing_assets == []
    for m in content.maps.values():
        assert len(m.arrive) >= len(content.characters), m.id


async def test_pins_reach_only_the_gm(engine):
    """The Key board's "what's where" is the GM's crib sheet. Nobody else gets it, nor where the crew would land."""
    await ok(engine, GM, "gm.crew.send", {"map": "promenade"})
    gm = project(engine.state, engine.content, GM)
    assert len(gm["maps"]["promenade"]["pins"]) == 20
    assert gm["maps"]["promenade"]["arrive"] is True
    for viewer in (VES, STAGE):
        v = project(engine.state, engine.content, viewer)
        assert v["party_map"] == "promenade"
        assert "pins" not in v["maps"]["promenade"] and "arrive" not in v["maps"]["promenade"]
        assert "what's where" not in str(v).lower() and "Gangway to the Patience" not in str(v)


async def test_everyone_sees_the_cameras_and_the_moving_window(engine):
    await ok(engine, GM, "gm.crew.send", {"map": "promenade"})
    m = project(engine.state, engine.content, VES)["maps"]["promenade"]
    assert m["cameras"]["switch"] == "cameras"
    assert len([c for c in m["cameras"]["cones"] if c["mood"] == "calm"]) == 6
    assert len([c for c in m["cameras"]["cones"] if c["mood"] == "hunted"]) == 6
    assert all(len(c["pts"]) == 8 for c in m["cameras"]["cones"])
    assert m["values"].get("cameras") == 1  # the default preset turns them on
    assert m["decals"][0]["src"] == "/assets/maps/promenade/hole.gif"
    assert "maps/promenade/hole.gif" in referenced_assets(project(engine.state, engine.content, VES))
    assert m["hum"] == "street"


async def test_things_on_a_new_map_stay_hidden_until_shown(engine):
    await ok(engine, GM, "gm.crew.send", {"map": "promenade"})
    assert project(engine.state, engine.content, VES)["maps"]["promenade"]["objects"] == []
    await ok(engine, GM, "gm.object.show", {"map": "promenade", "object": "queue-board", "shown": True})
    objs = project(engine.state, engine.content, VES)["maps"]["promenade"]["objects"]
    assert [o["id"] for o in objs] == ["queue-board"]


async def test_send_the_crew(engine):
    """Every crew token lands on the map's arrive spots in crew order, and it becomes the party's map."""
    tomo = next(tid for tid, t in engine.state.tokens.items() if t.ref == "tomo")
    await ok(engine, GM, "gm.token.hide", {"token": tomo, "hidden": True})
    await ok(engine, GM, "gm.crew.send", {"map": "patience"})
    s = engine.state
    spots = engine.content.maps["patience"].arrive
    for i, char in enumerate(CREW):
        t = crew_token(s, char)
        assert (t.map, tuple(t.at)) == ("patience", tuple(spots[i]))
    assert crew_token(s, "tomo").hidden  # hidden stays hidden
    assert s.party_map == "patience"
    v = project(s, engine.content, VES)
    assert v["party_map"] == "patience" and list(v["maps"]) == ["patience"]
    assert {t["ref"] for t in v["tokens"].values() if t["kind"] == "crew"} == {"lale", "marlo", "tally", "ves"}
    # the NPCs at the bar stay at the bar, out of sight
    assert all(t["map"] == "patience" for t in v["tokens"].values())


async def test_only_the_gm_sends_the_crew(engine):
    ack, _ = await engine.run(VES, None, "gm.crew.send", {"map": "promenade"})
    assert not ack["ok"] and ack["code"] == "forbidden"
    ack, _ = await engine.run(GM, None, "gm.crew.send", {"map": "nowhere"})
    assert not ack["ok"]


async def test_a_crew_member_missing_from_the_map_is_placed(engine):
    tid = next(tid for tid, t in engine.state.tokens.items() if t.ref == "ves")
    engine.state.tokens.pop(tid)  # as if a preset had left Ves out
    await ok(engine, GM, "gm.crew.send", {"map": "promenade"})
    t = crew_token(engine.state, "ves")
    assert t.map == "promenade" and tuple(t.at) == tuple(engine.content.maps["promenade"].arrive[3])


async def test_the_tv_follows_one_of_the_crew_to_their_map(engine):
    await ok(engine, GM, "gm.crew.send", {"map": "promenade"})
    await ok(engine, GM, "gm.stage.camera", {"camera": "follow", "follow": "ves"})
    tid = next(tid for tid, t in engine.state.tokens.items() if t.ref == "ves")
    engine.state.tokens[tid].map = "patience"  # Ves goes back aboard on her own
    v = project(engine.state, engine.content, STAGE)
    assert v["party_map"] == "patience" and list(v["maps"]) == ["patience"]
    await ok(engine, GM, "gm.stage.camera", {"camera": "crew"})
    assert project(engine.state, engine.content, STAGE)["party_map"] == "promenade"


async def test_the_arrival_preset(engine):
    await ok(engine, GM, "gm.world.load_preset", {"preset": "session-1-arrival"})
    s = engine.state
    assert s.party_map == "patience"
    assert all(crew_token(s, c).map == "patience" for c in CREW)
    assert s.maps["promenade"].switches == {"cameras": 1}
    v = project(s, engine.content, VES)
    assert [t["ref"] for t in v["tokens"].values() if t["kind"] == "npc"] == ["steward"]


def test_a_saved_game_gains_the_new_maps(content, tmp_path):
    """A game saved when only the bar existed: the other maps get their state at boot, as a logged event."""
    store = Store(tmp_path / "old.db")
    Engine(content, store)  # seeds
    snap = store.load_snapshot()
    old = GameState.model_validate(snap[1])
    old.maps = {"event-horizon": old.maps["event-horizon"]}
    store.commit("system", None, [], old.model_dump(mode="json"), {})
    e = Engine(content, store)
    assert set(e.state.maps) == set(content.maps)
    assert e.state.maps["promenade"] == MapState(mood="calm", switches={"cameras": 1})
    assert e.state.maps["patience"] == MapState(mood="docked")
    # and the GM can set a new map's mood straight away
    from lso.commands import handle

    assert handle(GM, e.state, content, "gm.map.mood", {"map": "promenade", "mood": "hunted"}) == [("map.mood_set", {"map": "promenade", "mood": "hunted"})]


ALL = ["patience", "promenade", "event-horizon", "executive", "secure", "vault", "bots", "lift", "cab", "terminal", "med"]


def test_all_eleven_maps_in_story_order(content):
    assert list(content.maps) == ALL


async def test_no_map_leaks_its_pins(engine):
    for m in ALL:
        await ok(engine, GM, "gm.crew.send", {"map": m})
        gm = project(engine.state, engine.content, GM)["maps"][m]
        assert gm["pins"], m
        for viewer in (VES, STAGE):
            v = project(engine.state, engine.content, viewer)
            assert list(v["maps"]) == [m]
            assert "pins" not in v["maps"][m]
            sent = json.dumps(v)
            assert [p["label"] for p in gm["pins"] if len(p["label"]) > 20 and p["label"] in sent] == []


async def test_the_executive_floors_are_a_tower(engine):
    """Four decks, 12.5 height apart: deck 6's floor is Z 0. A deck jump is a move that keeps X and Y."""
    await ok(engine, GM, "gm.crew.send", {"map": "executive"})
    m = project(engine.state, engine.content, VES)["maps"]["executive"]
    assert [f["label"] for f in m["floors"]] == ["Deck 6", "Deck 7", "Deck 8", "Deck 9"]
    assert [f["z"] for f in m["floors"]] == [0, 12.5, 25, 37.5]
    cams = m["cameras"]
    assert cams["color"] == "#7fb4ff" and sorted({c["z"] for c in cams["cones"]}) == [0, 12.5, 25]
    assert all(c["mood"] is None and len(c["pts"]) == 14 for c in cams["cones"])
    # the board's own projection, proj(X, Y, Z, deck) with oy = 150 + (9 - deck) * 450, lands on the same spot
    from lso.models import MapDef

    d: MapDef = engine.content.maps["executive"]
    ox, oy = d.origin
    for deck in (6, 7, 8, 9):
        X, Y, Z = 7, 1.5, 0.4
        board = ((X - Y) * 30 + 360, (X + Y) * 15 - Z * 36 + 150 + (9 - deck) * 450)
        ours = ((X - Y) * 30 + ox, (X + Y) * 15 - (Z + (deck - 6) * 12.5) * 36 + oy)
        assert board == pytest.approx(ours)
    ves = next(tid for tid, t in engine.state.tokens.items() if t.ref == "ves")
    x, y, _ = engine.state.tokens[ves].at
    await ok(engine, VES, "token.move", {"token": ves, "at": [x, y, 37.5]})  # up to deck 9
    assert tuple(engine.state.tokens[ves].at) == (x, y, 37.5)


async def test_the_terminal_rooms_face_and_feed(engine):
    await ok(engine, GM, "gm.crew.send", {"map": "terminal"})
    m = project(engine.state, engine.content, VES)["maps"]["terminal"]
    face = next(d for d in m["decals"] if d["id"] == "face")
    assert face["opacity"] == {"isco": 0.68, "seal": 1} and face["over"] and face["blend"] == "screen"
    assert m["feed"]["factor"] == 3.2 and len(m["feed"]["lines"]) == 5
    await ok(engine, GM, "gm.map.switch", {"map": "terminal", "switch": "feed", "value": 5})
    ack, _ = await engine.run(GM, None, "gm.map.switch", {"map": "terminal", "switch": "feed", "value": 6})
    assert not ack["ok"]
    await ok(engine, GM, "gm.map.switch", {"map": "terminal", "switch": "minutes", "value": 10})
    assert project(engine.state, engine.content, VES)["maps"]["terminal"]["values"] == {"feed": 5, "minutes": 10}


async def test_the_alert_moods_pulse(engine):
    gm = project(engine.state, engine.content, GM)["maps"]
    assert {m["id"]: m["hum"] for m in gm["executive"]["moods"]} == {"office": "none", "night": "none", "alert": "beat"}
    assert {m["id"]: m["hum"] for m in gm["secure"]["moods"]} == {"quiet": "none", "alert": "beat"}
    assert {m["hum"] for m in gm["event-horizon"]["moods"]} == {"bar"}


async def test_the_spider_mech_is_a_double_size_token(engine):
    await ok(engine, GM, "gm.crew.send", {"map": "secure"})
    await ok(engine, GM, "gm.token.place", {"ref": "spider-mech", "map": "secure", "at": [23.6, 2.25, 0.3]})
    v = project(engine.state, engine.content, VES)
    mech = v["tokens"]["spider-mech"]
    assert mech["size"] == 2 and "stats" not in mech and "gm_note" not in mech
