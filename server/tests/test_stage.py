"""The TV (the Stage seat) and cutscenes.

The TV is picked on the login screen like a seat, only watches, and gets only what everyone may see. Films start at one
server moment, and only the TV plays them or may fetch their files (the GM can too, for the TV's preview).
"""

import json

import pytest
from starlette.websockets import WebSocketDisconnect

from lso.auth import COOKIE, Viewer
from lso.commands import FILM_LEAD, CommandError, handle
from lso.models import CAMERA_PAN_MAX, CAMERA_ZOOM_MAX
from lso.config import ROOT
from conftest import place_dax
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
    e = Engine(content, Store(tmp_path / "t.db"), clock=clock)
    place_dax(e)
    return e


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
    assert v["stage"]["films"] == [f"/assets/{c.file}" for c in content.cutscenes.values() if c.file]  # every film, so a cue starts at once
    assert FILM in v["stage"]["films"] and "-still" not in body  # the stills are the GM's


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
    assert engine.state.maps[EH].mood == "stand"  # the bar in Last stand, behind the film
    dax = engine.state.tokens["dax"]
    assert (dax.map, dax.at, dax.hidden) == (EH, (11.6, 1.05, 0.0), False)  # at the gap in the rail
    assert engine.state.party_map == EH


async def test_a_film_cant_be_stopped_or_doubled(engine, content, clock):
    await ok(engine, GM, "gm.film.play", {"cue": "shotgun"})
    for kind, args in [("gm.film.play", {"cue": "shotgun"}), ("gm.stage.camera", {"camera": "roller"})]:
        with pytest.raises(CommandError) as e:
            handle(GM, engine.state, content, kind, args, now=clock.t + 10)
        assert e.value.code == "invalid"
    # it ends on its own, and the GM's list has it under its act
    clock.t = engine.state.stage.film.ends + 0.1
    assert await engine.sweep(set())
    assert engine.state.stage.film is None
    cue = {c["id"]: c for c in project(engine.state, content, GM)["stage"]["cues"]}["shotgun"]
    assert cue["act"] == "Act 3: The Job" and cue["ready"] and cue["still"] == STILL


async def test_a_film_that_just_ended_can_play_again_before_the_sweep(engine, content, clock):
    await ok(engine, GM, "gm.film.play", {"cue": "shotgun"})
    clock.t = engine.state.stage.film.ends + 0.5  # over, but the sweeper hasn't run yet
    await ok(engine, GM, "gm.film.play", {"cue": "shotgun"})
    assert engine.state.stage.film.at > clock.t


def test_only_the_gm_plays_films_and_only_made_ones(engine, content):
    with pytest.raises(CommandError) as e:
        handle(TALLY, engine.state, content, "gm.film.play", {"cue": "shotgun"})
    assert e.value.code == "forbidden"
    # every Act 1 to final act film is made now, so an unmade cue is made up for the test: a copy with no file
    unmade = content.cutscenes["shotgun"].model_copy(update={"id": "unmade", "file": None, "length": None})
    content.cutscenes["unmade"] = unmade
    try:
        for cue in ("unmade", "nope"):
            with pytest.raises(CommandError):
                handle(GM, engine.state, content, "gm.film.play", {"cue": cue})
    finally:
        del content.cutscenes["unmade"]


async def test_only_the_tv_plays_the_film(engine, content):
    await ok(engine, GM, "gm.film.play", {"cue": "shotgun"})
    tv, gm, tally = (project(engine.state, content, v)["stage"]["film"] for v in (STAGE, GM, TALLY))
    assert tv["src"] == FILM
    assert "src" not in gm and gm["name"] == "Last Call"
    assert tally == {"at": tv["at"], "ends": tv["ends"], "loop": LOOP, "still": LOOP_STILL}  # the waiting loop until it ends; not this film's file or name
    assert "shotgun" not in json.dumps(project(engine.state, content, TALLY))


def test_a_game_saved_with_the_old_tv_choice_still_loads(content, tmp_path):
    store = Store(tmp_path / "old.db")
    Engine(content, store)
    old = store.load_snapshot()[1]
    old["stage"]["setup"] = "online"
    store.commit("system", None, [], old, {})
    e = Engine(content, store)
    assert "setup" not in e.state.stage.model_dump() and "setup" not in project(e.state, content, GM)["stage"]


def test_a_game_saved_with_played_cues_still_loads(content, tmp_path):
    store = Store(tmp_path / "old.db")
    Engine(content, store)
    old = store.load_snapshot()[1]
    old["stage"]["played"] = ["shotgun"]
    store.commit("system", None, [], old, {})
    assert "played" not in Engine(content, store).state.stage.model_dump()


def test_the_choice_of_no_tv_is_gone(engine, content):
    with pytest.raises(CommandError) as e:
        handle(GM, engine.state, content, "gm.stage.setup", {"setup": "notv"})
    assert e.value.code == "invalid"


async def test_the_tv_can_follow_an_npc_and_goes_where_it_is(engine, content):
    await ok(engine, GM, "gm.world.load_preset", {"preset": "session-1-day", "scene": True})
    await ok(engine, GM, "gm.stage.camera", {"camera": "follow", "follow": "dax"})  # on the bar's map, the party on the Promenade
    v = project(engine.state, content, STAGE)
    assert (v["stage"]["camera"], v["stage"]["follow"]) == ("follow", "dax") and list(v["maps"]) == ["event-horizon"] and "dax" in v["tokens"]


async def test_a_hidden_npc_cannot_be_followed_and_never_leaks(engine, content):
    await ok(engine, GM, "gm.world.load_preset", {"preset": "session-1-day", "scene": True})
    with pytest.raises(CommandError):  # Static's crew start hidden
        handle(GM, engine.state, content, "gm.stage.camera", {"camera": "follow", "follow": "static"})
    await ok(engine, GM, "gm.stage.camera", {"camera": "follow", "follow": "dax"})
    await ok(engine, GM, "gm.token.hide", {"token": "dax", "hidden": True})  # hidden after the camera went to it
    for viewer in (TALLY, STAGE):
        v = project(engine.state, content, viewer)
        assert v["stage"]["follow"] is None and "dax" not in v["tokens"]
    assert list(project(engine.state, content, STAGE)["maps"]) == [engine.state.party_map]


async def test_the_camera_comes_back_when_its_npc_goes(engine, content):
    await ok(engine, GM, "gm.world.load_preset", {"preset": "session-1-day", "scene": True})
    await ok(engine, GM, "gm.stage.camera", {"camera": "follow", "follow": "dax"})
    await ok(engine, GM, "gm.token.remove", {"token": "dax"})
    assert (engine.state.stage.camera, engine.state.stage.follow) == ("crew", None)
    await ok(engine, GM, "gm.stage.camera", {"camera": "follow", "follow": "concierge"})
    await ok(engine, GM, "gm.world.load_preset", {"preset": "session-1", "scene": True})  # a scene without the Concierge
    assert (engine.state.stage.camera, engine.state.stage.follow) == ("crew", None)


async def test_a_preset_keeps_the_table_setting(engine, content):
    await ok(engine, GM, "gm.stage.camera", {"camera": "follow", "follow": "ves"})
    await ok(engine, GM, "gm.world.load_preset", {"preset": "session-1-night"})
    st = engine.state.stage
    assert (st.camera, st.follow) == ("follow", "ves")


def test_the_camera_follows_a_crew_member(engine, content):
    ev = handle(GM, engine.state, content, "gm.stage.camera", {"camera": "follow"})
    assert ev == [("stage.camera_set", {"camera": "follow", "follow": next(iter(content.characters))})]
    with pytest.raises(CommandError):
        handle(GM, engine.state, content, "gm.stage.camera", {"camera": "follow", "follow": "nobody"})
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


# ---------- the soundboard ----------

PUNCH = "/assets/sounds/fight/punch.mp3"


async def test_a_press_reaches_only_the_tv(engine, content, clock):
    await ok(engine, GM, "gm.sound.play", {"sound": "punch"})
    assert stage_of(engine, content, STAGE)["sounds"] == [{"id": "punch", "at": clock.t}]
    assert "sounds" not in stage_of(engine, content, GM)
    assert "sounds" not in stage_of(engine, content, TALLY)


def test_only_the_tv_gets_the_files_and_only_the_gm_the_names(engine, content):
    tv, gm, player = (stage_of(engine, content, v) for v in (STAGE, GM, TALLY))
    assert tv["sound_files"]["punch"] == PUNCH and "soundboard" not in tv
    assert [c["id"] for c in gm["soundboard"]] == ["fight", "droid", "heist", "bits"]
    assert "sound_files" not in gm and "/assets/" not in json.dumps(gm["soundboard"])
    assert "sound_files" not in player and "soundboard" not in player


async def test_only_the_gm_plays_a_sound_and_only_a_real_one(engine):
    for viewer in (TALLY, STAGE):
        ack, _ = await engine.run(viewer, None, "gm.sound.play", {"sound": "punch"})
        assert not ack["ok"]
    ack, _ = await engine.run(GM, None, "gm.sound.play", {"sound": "kazoo"})
    assert not ack["ok"]


async def test_a_sound_can_play_over_a_film(engine, content, clock):
    await ok(engine, GM, "gm.film.play", {"cue": "shotgun"})
    clock.t += FILM_LEAD + 1
    await ok(engine, GM, "gm.sound.play", {"sound": "punch"})
    assert stage_of(engine, content, STAGE)["sounds"][-1]["id"] == "punch"


async def test_only_the_last_few_presses_are_kept(engine, content, clock):
    for _ in range(20):
        clock.t += 1
        await ok(engine, GM, "gm.sound.play", {"sound": "punch"})
    played = stage_of(engine, content, STAGE)["sounds"]
    assert len(played) == 8 and played[-1]["at"] == clock.t


def test_a_sound_file_reaches_only_the_tv_and_the_gm(client, seat):
    gm, tally, tv = seat("gm"), seat("tally"), tv_login(client)
    get = lambda who: client.get(PUNCH, headers=who).status_code  # noqa: E731
    assert get(tv) == 200 and get(gm) == 200
    assert get(tally) == 404


def test_every_sound_on_the_board_exists(content):
    assert len(content.sounds) == 24
    assert not [m for m in content.missing_assets if m.startswith("sounds/")]


# ---------- the opening ----------

LOOP, MOVIE, AUDIO, LOOP_STILL = "/assets/films/opening-loop.mp4", "/assets/films/opening.mp4", "/assets/films/opening-audio.flac", "/assets/films/opening-still.png"


def stage_of(engine, content, viewer):
    return project(engine.state, content, viewer)["stage"]


async def arm(engine):
    await ok(engine, GM, "gm.opening.set", {"on": True})


async def test_the_opening_is_off_until_the_gm_turns_it_on(engine, content):
    assert "held" not in stage_of(engine, content, TALLY)
    assert stage_of(engine, content, STAGE)["opening"] is None
    assert stage_of(engine, content, GM)["opening_film"]["length"] == 212.25


async def test_only_the_gm_turns_the_opening_on_or_plays_it(engine, content):
    for viewer in (TALLY, STAGE):
        for kind, args in (("gm.opening.set", {"on": True}), ("gm.opening.play", {})):
            with pytest.raises(CommandError) as e:
                handle(viewer, engine.state, content, kind, args)
            assert e.value.code == "forbidden"


async def test_held_players_get_only_the_waiting_loop(engine, content, clock):
    await arm(engine)
    st = stage_of(engine, content, TALLY)
    assert st["held"] == {"loop": LOOP, "still": LOOP_STILL} and "opening" not in st and "opening_film" not in st
    feed = json.dumps(project(engine.state, content, TALLY))
    assert MOVIE not in feed and AUDIO not in feed and "loop_at" not in feed
    await ok(engine, GM, "gm.opening.play", {})
    assert stage_of(engine, content, TALLY)["held"]["rolling"] is True  # Play takes their Codex page away
    feed = json.dumps(project(engine.state, content, TALLY))
    assert MOVIE not in feed and AUDIO not in feed and "film_at" not in feed


async def test_the_tv_gets_the_opening_files_and_the_gm_the_times(engine, content, clock):
    await arm(engine)
    tv, gm = stage_of(engine, content, STAGE)["opening"], stage_of(engine, content, GM)["opening"]
    assert (tv["loop"], tv["film"], tv["audio"]) == (LOOP, MOVIE, AUDIO)
    assert tv["loop_at"] == gm["loop_at"] == clock.t and tv["film_at"] is None
    assert "audio" not in gm


async def test_a_held_player_can_do_nothing(engine, content):
    await arm(engine)
    tok = next(t for t, x in engine.state.tokens.items() if x.kind == "crew" and x.ref == "tally")
    for kind, args in (("token.move", {"token": tok, "at": [1, 1, 0]}), ("roll.start", {"stat": "wits"}), ("burn.use", {})):
        with pytest.raises(CommandError) as e:
            handle(TALLY, engine.state, content, kind, args)
        assert e.value.code == "forbidden"


async def test_the_gm_works_while_the_players_are_held(engine, content):
    await arm(engine)
    await ok(engine, GM, "gm.stage.join", {"show": False})
    await ok(engine, GM, "gm.stage.camera", {"camera": "follow", "follow": "tally"})


@pytest.mark.parametrize("pressed, beats", [(0.0, 1), (0.1, 2), (2.6, 5), (3.0, 5), (3.1, 6)])
async def test_the_film_starts_on_a_beat_at_least_the_lead_away(engine, content, clock, pressed, beats):
    await arm(engine)
    start = clock.t
    clock.t += pressed
    await ok(engine, GM, "gm.opening.play", {})
    o = engine.state.stage.opening
    assert o.film_at == pytest.approx(start + beats * 0.75)
    assert o.film_at - clock.t >= 0.75 - 1e-6
    assert o.ends == pytest.approx(o.film_at + 212.25)


async def test_the_film_hides_the_join_card(engine, content):
    await arm(engine)
    assert engine.state.stage.join is True
    await ok(engine, GM, "gm.opening.play", {})
    assert engine.state.stage.join is False


async def test_the_end_of_the_film_lets_everyone_in(engine, content, clock):
    await arm(engine)
    await ok(engine, GM, "gm.opening.play", {})
    clock.t = engine.state.stage.opening.ends - 1
    await engine.sweep(set())
    assert stage_of(engine, content, TALLY)["held"]
    clock.t += 1.5
    await engine.sweep(set())
    assert engine.state.stage.opening is None
    assert "held" not in stage_of(engine, content, TALLY)


async def test_the_opening_can_be_turned_off_only_before_the_film(engine, content):
    await arm(engine)
    await ok(engine, GM, "gm.opening.set", {"on": False})
    assert engine.state.stage.opening is None
    await arm(engine)
    await ok(engine, GM, "gm.opening.play", {})
    with pytest.raises(CommandError):
        handle(GM, engine.state, content, "gm.opening.set", {"on": False}, now=engine.clock())


async def test_play_needs_the_opening_on_and_only_works_once(engine, content):
    with pytest.raises(CommandError):
        handle(GM, engine.state, content, "gm.opening.play", {})
    await arm(engine)
    await ok(engine, GM, "gm.opening.play", {})
    with pytest.raises(CommandError):
        handle(GM, engine.state, content, "gm.opening.play", {})


async def test_nothing_else_plays_during_the_opening(engine, content):
    await arm(engine)
    with pytest.raises(CommandError):
        handle(GM, engine.state, content, "gm.film.play", {"cue": "shotgun"}, now=engine.clock())


async def test_the_opening_cant_start_over_a_film(engine, content):
    await ok(engine, GM, "gm.film.play", {"cue": "shotgun"})
    with pytest.raises(CommandError):
        handle(GM, engine.state, content, "gm.opening.set", {"on": True}, now=engine.clock())


async def test_a_preset_keeps_the_opening_on(engine, content):
    await arm(engine)
    preset = next(iter(content.presets))
    await ok(engine, GM, "gm.world.load_preset", {"preset": preset})
    assert engine.state.stage.opening is not None


async def test_reset_puts_the_game_back_and_keeps_the_players_held(engine, content):
    await arm(engine)
    await ok(engine, GM, "gm.vitals.set", {"char": "ves", "hp": 1, "entropy": 5})
    await ok(engine, GM, "gm.item.give", {"holder": "ves", "item": "burner-key"})
    await ok(engine, GM, "gm.map.mood", {"map": "event-horizon", "mood": "stand"})
    await ok(engine, GM, "gm.opening.reset", {})
    s, start = engine.state, content.presets[content.opening.resets_to]
    assert s.stage.opening is not None
    assert s.maps["event-horizon"].mood == start.maps["event-horizon"].mood
    assert s.vitals["ves"].hp > 1 and s.vitals["ves"].entropy == 2
    assert "burner-key" not in [e.item for e in s.inventory["ves"]]


async def test_reset_is_only_for_while_the_players_are_held(engine, content):
    with pytest.raises(CommandError) as e:
        handle(GM, engine.state, content, "gm.opening.reset", {})
    assert e.value.code == "invalid"
    await arm(engine)
    with pytest.raises(CommandError) as e:
        handle(TALLY, engine.state, content, "gm.opening.reset", {})
    assert e.value.code == "forbidden"
    await ok(engine, GM, "gm.opening.play", {})
    with pytest.raises(CommandError) as e:
        handle(GM, engine.state, content, "gm.opening.reset", {})
    assert e.value.code == "invalid"


def test_the_act_cards_are_the_gms_alone(engine, content):
    cards = project(engine.state, content, GM)["presets"]
    assert [c["act"] for c in cards] == ["Act 1: The Pitch"] * 4 + ["Act 2: The Vigil"] * 2 + ["Act 3: The Job"] + ["Act 4: Hostile Takeover"] * 2 + ["Final act: Terminal"] and all(c["card"].startswith("/assets/") and c["blurb"] for c in cards)
    for viewer in (TALLY, STAGE):
        view = json.dumps(project(engine.state, content, viewer))
        for p in content.presets.values():
            assert p.card not in view and p.blurb not in view


async def test_the_opening_survives_a_restart(engine, content, tmp_path, clock):
    await arm(engine)
    again = Engine(content, Store(tmp_path / "t.db"), clock=clock)
    assert again.state.stage.opening == engine.state.stage.opening


def test_only_the_tv_may_fetch_the_film_and_it_can_seek(client, seat):
    gm, tally, tv = seat("gm"), seat("tally"), tv_login(client)
    assert client.get(MOVIE, headers=tv).status_code == 404  # not until the opening is on
    with client.websocket_connect("/ws", headers=gm) as g:
        recv(g, "view")
        g.send_json({"t": "intent", "id": "o", "type": "gm.opening.set", "args": {"on": True}})
        assert recv(g, "ack")["ok"]
        for path in (MOVIE, AUDIO):
            assert client.get(path, headers=tally).status_code == 404
        assert client.get(LOOP, headers=tally).status_code == 200  # the waiting loop is what a held laptop shows
        seek = client.get(MOVIE, headers=tv | {"range": "bytes=1000-1999"})
        assert seek.status_code == 206 and len(seek.content) == 1000  # a late-joining TV seeks: it needs this


def test_the_opening_numbers_match_the_player_that_came_with_the_files(content):
    js = (ROOT / "web/src/stage/opening_player.js").read_text()
    assert f"BEAT: {content.opening.beat}," in js
    assert f"FILM: {content.opening.length}," in js


def test_the_gm_nudges_the_tvs_shot(engine, content):
    nudged = lambda args: handle(GM, engine.state, content, "gm.stage.nudge", args)  # noqa: E731
    assert nudged({"zoom": 1, "x": -1}) == [("stage.nudged", {"zoom": 1, "pan": [-1, 0]})]
    assert nudged({"reset": True}) == []  # already plain: nothing to change, no event
    assert nudged({"zoom": 99, "y": 99})[0][1] == {"zoom": CAMERA_ZOOM_MAX, "pan": [0, CAMERA_PAN_MAX]}
    with pytest.raises(CommandError):
        nudged({"zoom": "closer"})
    with pytest.raises(CommandError):
        handle(TALLY, engine.state, content, "gm.stage.nudge", {"zoom": 1})


@pytest.mark.asyncio
async def test_a_new_shot_clears_the_nudge_and_players_never_get_it(engine, content):
    await ok(engine, GM, "gm.stage.camera", {"camera": "follow", "follow": "ves"})
    await ok(engine, GM, "gm.stage.nudge", {"zoom": 2, "x": 3})
    assert project(engine.state, content, STAGE)["stage"]["zoom"] == 2
    assert project(engine.state, content, GM)["stage"]["pan"] == [3, 0]
    player = project(engine.state, content, TALLY)["stage"]
    assert "zoom" not in player and "pan" not in player
    await ok(engine, GM, "gm.stage.camera", {"camera": "follow", "follow": "tally"})  # the next person: same zoom, centred
    assert (engine.state.stage.zoom, engine.state.stage.pan) == (2, (0, 0))
    await ok(engine, GM, "gm.stage.nudge", {"y": 1})
    await ok(engine, GM, "gm.stage.camera", {"camera": "crew"})  # a new kind of shot: plain again
    assert (engine.state.stage.zoom, engine.state.stage.pan) == (0, (0, 0))
