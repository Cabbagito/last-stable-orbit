"""M6: the Station. All of Ergo's places show, but one the crew hasn't been to (and the GM hasn't shown) is dark:
no lit overlay, no map preview, and the core keeps its name. Sending the crew somewhere lights it."""

import json

import pytest

from lso.auth import Viewer
from lso.config import ROOT
from lso.content import load_content
from lso.engine import Engine
from lso.models import GameState
from lso.store import Store
from lso.views import project, referenced_assets

GM = Viewer("gm", "gm")
STAGE = Viewer("stage", "stage")
VES = Viewer("ves", "player")
DAY_ONE = {"patience", "promenade", "event-horizon"}


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


@pytest.fixture
def engine(content, tmp_path):
    return Engine(content, Store(tmp_path / "t.db"), clock=lambda: 1000.0)


async def run(engine, viewer, kind, args):
    ack, _ = await engine.run(viewer, None, kind, args)
    return ack


def station(engine, viewer):
    return project(engine.state, engine.content, viewer)["station"]


def place(engine, viewer, map_id):
    return next(p for p in station(engine, viewer)["places"] if p["id"] == map_id)


def test_every_map_is_a_place_on_the_station(content):
    assert {p.map for p in content.station.places} == set(content.maps)


def test_session_one_lights_where_the_crew_has_been(engine):
    s = station(engine, VES)
    assert len(s["places"]) == 11
    assert {p["id"] for p in s["places"] if p["lit"]} == DAY_ONE
    eh = place(engine, VES, "event-horizon")
    assert eh["overlay"] == "/assets/station/lit-event-horizon.png" and eh["preview"] == "/assets/maps/event-horizon/base-open.png"


def test_a_dark_place_sends_no_art_and_the_core_keeps_its_name(engine):
    v = project(engine.state, engine.content, VES)
    core = place(engine, VES, "terminal")
    assert core["name"] == "The core" and [t["text"] for t in core["tags"]] == ["The core"] and not core["lit"]
    assert core["overlay"] is None and core["preview"] is None
    assert "Terminal room" not in json.dumps(v["station"])
    files = referenced_assets(v)
    assert "station/lit-vault.png" not in files and "maps/vault/base.png" not in files
    assert "station/ergo.png" in files and "codex/hole.gif" in files
    # the GM sees what it is, and its art
    g = place(engine, GM, "terminal")
    assert g["name"] == "The Terminal room" and g["overlay"] and not g["lit"]


async def test_sending_the_crew_lights_the_place(engine):
    assert (await run(engine, GM, "gm.crew.send", {"map": "terminal"}))["ok"]
    core = place(engine, VES, "terminal")
    assert core["lit"] and core["name"] == "The Terminal room" and core["preview"] == "/assets/maps/terminal/base-empty.png"
    # and it stays lit once they leave
    assert (await run(engine, GM, "gm.crew.send", {"map": "promenade"}))["ok"]
    assert place(engine, VES, "terminal")["lit"]


async def test_the_gm_shows_and_hides_places(engine):
    assert not (await run(engine, VES, "gm.station.show", {"map": "vault"}))["ok"]
    assert not (await run(engine, GM, "gm.station.show", {"map": "nowhere"}))["ok"]
    assert (await run(engine, GM, "gm.station.show", {"map": "vault", "shown": True}))["ok"]
    assert place(engine, VES, "vault")["lit"]
    assert (await run(engine, GM, "gm.station.show", {"map": "promenade", "shown": False}))["ok"]
    p = place(engine, VES, "promenade")
    assert not p["lit"] and p["overlay"] is None


async def test_players_see_the_crew_only_on_lit_places_and_never_a_hidden_token(engine):
    tomo = next(tid for tid, t in engine.state.tokens.items() if t.ref == "tomo")
    await run(engine, GM, "gm.token.hide", {"token": tomo, "hidden": True})
    engine.state.tokens[next(tid for tid, t in engine.state.tokens.items() if t.ref == "lale")].map = "vault"  # Lale wanders off
    crew = {c["char"]: c["map"] for c in station(engine, VES)["crew"]}
    assert "tomo" not in crew and "lale" not in crew and crew["ves"] == "event-horizon"
    g = {c["char"]: c for c in station(engine, GM)["crew"]}
    assert g["tomo"]["hidden"] and g["lale"]["map"] == "vault"


def test_the_tv_has_no_station(engine):
    assert station(engine, STAGE) is None


async def test_presets_and_cues_light_their_places(engine):
    assert (await run(engine, GM, "gm.world.load_preset", {"preset": "session-1-arrival"}))["ok"]
    assert {p["id"] for p in station(engine, VES)["places"] if p["lit"]} == {"patience"}
    # the intro has no film yet, so try a cue that sets the party map: the shotgun ends on the bar
    assert (await run(engine, GM, "gm.film.play", {"cue": "shotgun"}))["ok"]
    assert place(engine, VES, "event-horizon")["lit"]


def test_an_old_save_lights_where_the_crew_has_been(content, tmp_path):
    store = Store(tmp_path / "old.db")
    Engine(content, store)
    old = GameState.model_validate(store.load_snapshot()[1])
    old.rules, old.station = 2, []
    next(t for t in old.tokens.values() if t.ref == "ves").map = "secure"
    store.commit("system", None, [], old.model_dump(mode="json"), {})
    e = Engine(content, store)
    assert set(e.state.station) == DAY_ONE | {"secure"}
