"""The TV (the Stage seat) and cutscenes.

The TV is picked on the login screen like a seat, only watches, and gets only what everyone may see. Films start at one
server moment, and only the TV plays them or may fetch their files (the GM can too, for the TV's preview).
"""

import json

import pytest
from starlette.websockets import WebSocketDisconnect

from lso.auth import COOKIE, Viewer
from lso.commands import FILM_LEAD, CommandError, handle
from lso.config import ROOT
from lso.content import load_content
from lso.engine import Engine
from lso.store import Store
from lso.views import project


GM = Viewer("gm", "gm")
STAGE = Viewer("stage", "stage")
TALLY = Viewer("tally", "player")
EH = "event-horizon"
FILM = "/assets/films/shotgun.mp4"
STILL = "/assets/films/shotgun-still.png"


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


class Clock:
    def __init__(self, t: float = 1000.0):
        self.t = t

    def __call__(self) -> float:
        return self.t


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def engine(content, tmp_path, clock):
    return Engine(content, Store(tmp_path / "t.db"), clock=clock)


async def ok(engine, viewer, kind, args):
    ack, _ = await engine.run(viewer, None, kind, args)
    assert ack["ok"], ack
    return ack


def recv(ws, t):
    while True:
        f = ws.receive_json()
        if f["t"] == t:
            return f


def tv_login(client) -> dict:
    r = client.post("/api/login", json={"seat": "stage"})
    assert r.status_code == 200, r.text
    token = r.cookies.get(COOKIE)
    client.cookies.clear()
    return {"cookie": f"{COOKIE}={token}"}


# ---------- logging in ----------


def test_the_tv_is_picked_like_a_seat_and_logs_out(client):
    tv = tv_login(client)  # no passcode
    me = client.get("/api/me", headers=tv).json()
    assert me == {"seat": "stage", "role": "stage", "char": None}
    r = client.post("/api/logout", headers=tv)
    assert r.status_code == 200 and 'lso_session=""' in r.headers["set-cookie"]


# ---------- what the TV sees ----------


async def test_the_tv_sees_only_what_everyone_may(engine, content):
    s = engine.state
    await ok(engine, GM, "gm.token.hide", {"token": "dax", "hidden": True})
    await ok(engine, GM, "gm.item.give", {"holder": "tally", "item": "maintenance-log"})
    await ok(engine, GM, "gm.roll.start", {"token": None, "sides": 20, "mode": "secret"})  # the GM's alone
    v = project(engine.state, content, STAGE)
    body = json.dumps(v)
    assert v["me"] == {"seat": "stage", "role": "stage", "char": None}
    assert list(v["maps"]) == [s.party_map]  # one map: the one the party is on
    assert "dax" not in v["tokens"] and all(not t.hidden for tid, t in engine.state.tokens.items() if tid in v["tokens"])
    assert v["inventory"] == {}  # nobody's pockets
    assert v["rolls"] == []  # a Secret roll never reaches it
    for secret in ("gm_note", "roster", "presets", '"items"', "cues", STILL, "maintenance-log"):
        assert secret not in body, secret
    assert not any("stats" in t for t in v["tokens"].values())  # NPC dice are the GM's
    shown = set(engine.state.maps[s.party_map].shown)
    assert {o["id"] for o in v["maps"][s.party_map]["objects"]} == shown
    assert v["stage"]["films"] == [FILM]  # every film, so a cue starts at once


async def test_the_tv_learns_a_roll_as_it_lands(engine, content):
    await ok(engine, GM, "gm.roll.start", {"token": "dax", "stat": "cool"})
    await ok(engine, TALLY, "roll.start", {"stat": "tech"})
    rolls = {r["by"]: r for r in project(engine.state, content, STAGE)["rolls"]}
    assert set(rolls) == {"gm", "tally"}
    for r in rolls.values():
        assert r["phase"] == "roll" and "dice" not in r and "seed" not in r and "value" not in r  # its banner waits like everyone's


async def test_the_tv_never_gets_a_secret_npc_roll(engine, content):
    await ok(engine, GM, "gm.roll.start", {"token": "dax", "stat": "body", "mode": "secret"})
    assert project(engine.state, content, STAGE)["rolls"] == []


def test_the_tv_only_watches(client, seat):
    tv = tv_login(client)
    with client.websocket_connect("/ws", headers=tv) as t:
        v = recv(t, "view")
        assert v["view"]["me"]["role"] == "stage" and "now" in v
        for kind, args in [("token.move", {"token": "ves", "at": [1, 1, 0]}), ("roll.start", {"stat": "body"}), ("gm.film.play", {"cue": "shotgun"})]:
            t.send_json({"t": "intent", "id": kind, "type": kind, "args": args})
            ack = recv(t, "ack")
            assert ack["ok"] is False and ack["code"] == "read_only"
        t.send_json({"t": "ping"})
        assert recv(t, "pong")["now"] > 0


def test_the_gm_tab_knows_when_the_tv_is_connected(client, seat):
    gm, tv = seat("gm"), tv_login(client)
    with client.websocket_connect("/ws", headers=gm) as g:
        assert recv(g, "view")["view"]["stage"]["tv"] is False
        with client.websocket_connect("/ws", headers=tv) as t:
            recv(t, "view")
            assert recv(g, "view")["view"]["stage"]["tv"] is True
        assert recv(g, "view")["view"]["stage"]["tv"] is False


def test_the_gm_previews_the_tv_read_only(client, seat):
    gm, ves = seat("gm"), seat("ves")
    with client.websocket_connect("/ws?as=stage", headers=gm) as p:
        v = recv(p, "view")["view"]
        assert v["me"]["role"] == "stage" and v["inventory"] == {}
        p.send_json({"t": "intent", "id": "x", "type": "gm.film.play", "args": {"cue": "shotgun"}})
        assert recv(p, "ack")["code"] == "read_only"
    with pytest.raises(WebSocketDisconnect) as e:
        with client.websocket_connect("/ws?as=stage", headers=ves) as w:
            w.receive_json()
    assert e.value.code == 4403


# ---------- films ----------


async def test_a_cue_starts_the_film_and_sets_the_bar_behind_it(engine, content, clock):
    await ok(engine, GM, "gm.map.mood", {"map": EH, "mood": "open"})
    await ok(engine, GM, "gm.token.hide", {"token": "dax", "hidden": True})
    await ok(engine, GM, "gm.film.play", {"cue": "shotgun"})
    f = engine.state.stage.film
    assert f.cue == "shotgun" and f.at == clock.t + FILM_LEAD and f.ends == pytest.approx(f.at + 35.83)
    assert engine.state.maps[EH].mood == "after"  # the bar after hours, behind the film
    dax = engine.state.tokens["dax"]
    assert (dax.map, dax.at, dax.hidden) == (EH, (11.6, 1.05, 0.0), False)  # at the gap in the rail
    assert engine.state.party_map == EH


async def test_a_film_cant_be_stopped_or_doubled(engine, content, clock):
    await ok(engine, GM, "gm.film.play", {"cue": "shotgun"})
    for kind, args in [("gm.film.play", {"cue": "shotgun"}), ("gm.stage.camera", {"camera": "roller"})]:
        with pytest.raises(CommandError) as e:
            handle(GM, engine.state, content, kind, args, now=clock.t + 10)
        assert e.value.code == "invalid"
    # it ends on its own, and the GM's list says it was played
    clock.t = engine.state.stage.film.ends + 0.1
    assert await engine.sweep(set())
    assert engine.state.stage.film is None and engine.state.stage.played == ["shotgun"]
    cue = {c["id"]: c for c in project(engine.state, content, GM)["stage"]["cues"]}["shotgun"]
    assert cue["played"] and cue["ready"] and cue["still"] == STILL


async def test_a_film_that_just_ended_can_play_again_before_the_sweep(engine, content, clock):
    await ok(engine, GM, "gm.film.play", {"cue": "shotgun"})
    clock.t = engine.state.stage.film.ends + 0.5  # over, but the sweeper hasn't run yet
    await ok(engine, GM, "gm.film.play", {"cue": "shotgun"})
    assert engine.state.stage.played == ["shotgun"] and engine.state.stage.film.at > clock.t


def test_only_the_gm_plays_films_and_only_made_ones(engine, content):
    with pytest.raises(CommandError) as e:
        handle(TALLY, engine.state, content, "gm.film.play", {"cue": "shotgun"})
    assert e.value.code == "forbidden"
    for cue in ("intro", "wait", "nope"):
        with pytest.raises(CommandError):
            handle(GM, engine.state, content, "gm.film.play", {"cue": cue})


async def test_only_the_tv_plays_the_film(engine, content):
    await ok(engine, GM, "gm.film.play", {"cue": "shotgun"})
    tv, gm, tally = (project(engine.state, content, v)["stage"]["film"] for v in (STAGE, GM, TALLY))
    assert tv["src"] == FILM
    assert "src" not in gm and gm["name"] == "The bar: the shotgun"
    assert tally == {"at": tv["at"], "ends": tv["ends"]}  # the black hole until it ends; no file, no name
    assert "shotgun" not in json.dumps(project(engine.state, content, TALLY))


def test_a_game_saved_with_the_old_tv_choice_still_loads(content, tmp_path):
    store = Store(tmp_path / "old.db")
    Engine(content, store)
    old = store.load_snapshot()[1]
    old["stage"]["setup"] = "online"
    store.commit("system", None, [], old, {})
    e = Engine(content, store)
    assert "setup" not in e.state.stage.model_dump() and "setup" not in project(e.state, content, GM)["stage"]


def test_the_choice_of_no_tv_is_gone(engine, content):
    with pytest.raises(CommandError) as e:
        handle(GM, engine.state, content, "gm.stage.setup", {"setup": "notv"})
    assert e.value.code == "invalid"


async def test_a_preset_keeps_the_table_setting(engine, content):
    await ok(engine, GM, "gm.stage.camera", {"camera": "follow", "follow": "ves"})
    await ok(engine, GM, "gm.world.load_preset", {"preset": "bar-after-hours"})
    st = engine.state.stage
    assert (st.camera, st.follow) == ("follow", "ves")


def test_the_camera_follows_a_crew_member(engine, content):
    ev = handle(GM, engine.state, content, "gm.stage.camera", {"camera": "follow"})
    assert ev == [("stage.camera_set", {"camera": "follow", "follow": next(iter(content.characters))})]
    with pytest.raises(CommandError):
        handle(GM, engine.state, content, "gm.stage.camera", {"camera": "follow", "follow": "dax"})
    with pytest.raises(CommandError):
        handle(GM, engine.state, content, "gm.stage.camera", {"camera": "drone"})


# ---------- who may fetch a film ----------


def test_a_film_file_reaches_only_the_tv_and_the_gm(client, seat):
    gm, tally, tv = seat("gm"), seat("tally"), tv_login(client)
    get = lambda who, path: client.get(path, headers=who).status_code  # noqa: E731
    assert get(tv, FILM) == 200 and get(gm, FILM) == 200
    assert get(tally, FILM) == 404  # nothing playing: the file doesn't exist, as far as she can tell
    assert get(tally, STILL) == 404 and get(tv, STILL) == 404  # the GM's thumbnail is a spoiler

    with client.websocket_connect("/ws", headers=gm) as g:
        recv(g, "view")
        g.send_json({"t": "intent", "id": "p", "type": "gm.film.play", "args": {"cue": "shotgun"}})
        assert recv(g, "ack")["ok"]
        assert get(tally, FILM) == 404  # only the TV fetches films
