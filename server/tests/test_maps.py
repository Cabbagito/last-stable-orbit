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
    assert m["values"].get("cameras") == 0  # every session starts with them off
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
    assert s.maps["promenade"].switches == {"cameras": 0}
    v = project(s, engine.content, VES)
    assert {t["ref"] for t in v["tokens"].values() if t["kind"] == "npc"} == {
        "frail-passenger", "passenger", "passenger-candles", "passenger-flowers", "passenger-old", "passenger-tourist",
        "passenger-traveller", "passenger-young", "steward",
    }


def test_the_ships_passengers_are_the_people_in_the_dock_7_queue(content):
    def passengers(preset, map_id):
        return sorted(t.ref for t in content.presets[preset].tokens if "passenger" in t.ref and t.map == map_id)

    assert len(passengers("session-1-arrival", "patience")) == 12
    assert passengers("session-1-day", "promenade") == passengers("session-1-arrival", "patience")


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
    assert e.state.maps["promenade"] == MapState(mood="calm", switches={"cameras": 0})
    assert e.state.maps["patience"] == MapState(mood="docked")
    # and the GM can set a new map's mood straight away
    from lso.commands import handle

    assert handle(GM, e.state, content, "gm.map.mood", {"map": "promenade", "mood": "hunted"}) == [("map.mood_set", {"map": "promenade", "mood": "hunted"})]


HEIST = ["deck-6", "deck-7", "deck-8", "deck-9", "secure", "bots"]
ALL = ["patience", "promenade", "event-horizon", "deck-6", "deck-7", "deck-8", "deck-9", "secure", "vault", "bots", "lift", "cab", "terminal", "med"]


def test_all_the_maps_in_story_order(content):
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


async def test_the_heist_maps_are_separate_with_day_night_alert(engine):
    """Decks 6 to 9, the Secure floor and the Bot bays: one map each, the three moods, and things marked on them."""
    gm = project(engine.state, engine.content, GM)["maps"]
    assert "executive" not in gm
    for m in HEIST:
        assert [x["id"] for x in gm[m]["moods"]] == ["day", "night", "alert"], m
        assert all(x["glow"] is None for x in gm[m]["moods"]), m  # the new art is one flat picture per mood
        assert gm[m]["objects"] and gm[m]["pins"], m
    assert {m: bool(gm[m]["cameras"]) for m in HEIST} == {"deck-6": True, "deck-7": True, "deck-8": True, "deck-9": True, "secure": True, "bots": False}
    assert gm["deck-9"]["objects"][0]["id"] == "signet"


def test_heist_objects_and_arrivals_are_on_their_maps(content):
    """Everything marked projects inside the art, and nobody arrives outside the floor."""
    for m in HEIST:
        d = content.maps[m]
        W, H = d.display
        ox, oy = d.origin
        for x in [*d.objects, *d.pins]:
            X, Y, Z = x.at
            sx, sy = ((X - Y) * 30 + ox) * 2, ((X + Y) * 15 - Z * 36 + oy) * 2
            assert 0 <= sx <= W and 0 <= sy <= H, (m, x)
        assert len(d.arrive) == 5, m


async def test_the_gm_sends_one_token_to_another_map(engine):
    await ok(engine, GM, "gm.crew.send", {"map": "deck-8"})
    ves = next(tid for tid, t in engine.state.tokens.items() if t.ref == "ves")
    tomo = next(tid for tid, t in engine.state.tokens.items() if t.ref == "tomo")
    ack, _ = await engine.run(VES, None, "gm.token.send", {"token": ves, "map": "secure"})
    assert not ack["ok"]  # the GM moves people between maps
    await ok(engine, GM, "gm.token.send", {"token": ves, "map": "secure"})
    assert engine.state.tokens[ves].map == "secure" and tuple(engine.state.tokens[ves].at) == tuple(engine.content.maps["secure"].arrive[0])
    assert engine.state.tokens[tomo].map == "deck-8" and engine.state.party_map == "deck-8"
    # she sees where she is now, the others don't see her
    assert list(project(engine.state, engine.content, VES)["maps"]) == ["secure"]
    await ok(engine, GM, "gm.token.send", {"token": tomo, "map": "secure"})
    assert tuple(engine.state.tokens[tomo].at) == tuple(engine.content.maps["secure"].arrive[1])  # not on top of her
    ack, _ = await engine.run(GM, None, "gm.token.send", {"token": ves, "map": "nowhere"})
    assert not ack["ok"]


async def test_each_deck_is_its_own_place_on_the_station(engine):
    """The four decks are cut out of one band of the picture: side by side, nothing shared, and only the one you reach lights."""
    await ok(engine, GM, "gm.crew.send", {"map": "deck-9"})
    st = project(engine.state, engine.content, VES)["station"]
    assert {p["id"] for p in st["places"] if p["lit"] and p["id"].startswith("deck-")} == {"deck-9"}
    assert {c["map"] for c in st["crew"]} == {"deck-9"}
    deck9 = next(p for p in st["places"] if p["id"] == "deck-9")
    assert deck9["overlay"] == "/assets/station/lit-deck-9.png" and deck9["preview"] == "/assets/maps/deck-9/base-day.png"
    assert next(p for p in st["places"] if p["id"] == "deck-8")["overlay"] is None
    tops = {p.map: p.hots[0][1] for p in engine.content.station.places if p.map.startswith("deck-")}
    assert tops == {"deck-9": 120, "deck-8": 164, "deck-7": 208, "deck-6": 252}


def test_a_saved_game_moves_onto_the_heist_maps(tmp_path, content):
    """A game from before: tokens on the tower land on the deck they were on, moods and the Station move over."""
    from lso.engine import Engine
    from lso.models import RULES, GameState, MapState
    from lso.store import Store

    store = Store(tmp_path / "w.db")
    Engine(content, store)
    old = GameState.model_validate(store.load_snapshot()[1])
    old.rules = 3
    old.maps["executive"] = MapState(mood="night")
    old.maps["secure"].mood = "quiet"
    old.maps["bots"].mood = "dark"
    for m in ("deck-6", "deck-7", "deck-8", "deck-9"):
        del old.maps[m]
    old.party_map = "executive"
    old.station = [*[m for m in old.station if m != "deck-6"], "executive"]
    ves = next(tid for tid, t in old.tokens.items() if t.ref == "ves")
    tomo = next(tid for tid, t in old.tokens.items() if t.ref == "tomo")
    lale = next(tid for tid, t in old.tokens.items() if t.ref == "lale")
    old.tokens[ves].map, old.tokens[ves].at = "executive", (5.0, 5.0, 37.5)
    old.tokens[tomo].map, old.tokens[tomo].at = "executive", (5.0, 5.0, 12.9)
    old.tokens[lale].map, old.tokens[lale].at = "secure", (25.0, 18.0, 0.0)
    store.commit("system", None, [], old.model_dump(mode="json"), {})
    e = Engine(content, store)
    assert e.state.rules == RULES and "executive" not in e.state.maps
    assert e.state.tokens[ves].map == "deck-9" and tuple(e.state.tokens[ves].at) == tuple(content.maps["deck-9"].arrive[0])
    assert e.state.tokens[tomo].map == "deck-7"
    assert e.state.tokens[lale].map == "secure" and tuple(e.state.tokens[lale].at) == tuple(content.maps["secure"].arrive[0])
    assert e.state.maps["secure"].mood == "day" and e.state.maps["bots"].mood == "day"
    assert all(m in e.state.maps for m in ("deck-6", "deck-7", "deck-8", "deck-9"))
    assert e.state.party_map == "deck-6"
    assert "deck-6" in e.state.station and "executive" not in e.state.station
    project(e.state, content, GM)  # and it still goes out


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
    assert {m["hum"] for m in gm["event-horizon"]["moods"]} == {"bar"}


async def test_the_spider_mech_is_a_double_size_token(engine):
    await ok(engine, GM, "gm.crew.send", {"map": "secure"})
    await ok(engine, GM, "gm.token.place", {"ref": "spider-mech", "map": "secure", "at": [23.6, 2.25, 0.3]})
    v = project(engine.state, engine.content, VES)
    mech = v["tokens"]["spider-mech"]
    assert mech["size"] == 2 and "stats" not in mech and "gm_note" not in mech
