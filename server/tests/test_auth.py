from dataclasses import replace

import pytest

from lso.auth import Auth
from lso.config import SettingsError, load_settings


def test_player_picks_a_character(client, seat):
    h = seat("ves")
    assert client.get("/api/me", headers=h).json() == {"seat": "ves", "role": "player", "char": "ves"}


def test_unknown_character_is_refused(client):
    assert client.post("/api/login", json={"seat": "dax"}).status_code == 404
    assert client.post("/api/login", json={"seat": ""}).status_code == 401  # empty seat falls through to the GM check
    assert client.get("/api/me").status_code == 401


def test_gm_needs_the_passcode(client):
    assert client.post("/api/login", json={"seat": "gm"}).status_code == 401  # picking "gm" isn't enough
    assert client.post("/api/login", json={"passcode": "nope"}).status_code == 401
    r = client.post("/api/login", json={"passcode": " GM-Code "})  # case and spaces don't matter
    assert r.status_code == 200 and r.json()["role"] == "gm"


def test_logout(client):
    assert client.post("/api/login", json={"passcode": "gm-code"}).status_code == 200
    assert client.get("/api/me").json()["role"] == "gm"
    client.post("/api/logout")
    assert client.get("/api/me").status_code == 401


def test_seats_list_the_crew_and_who_is_on_board(client, seat):
    data = client.get("/api/seats").json()
    assert [c["id"] for c in data["crew"]] == ["lale", "marlo", "tally", "ves", "tomo"]
    assert not any(c["online"] for c in data["crew"]) and data["gm_online"] is False
    with client.websocket_connect("/ws", headers=seat("ves")) as ws:
        ws.receive_json()
        data = client.get("/api/seats").json()
        assert [c["id"] for c in data["crew"] if c["online"]] == ["ves"]


def test_epoch_bump_logs_everyone_out(settings):
    a = Auth(settings, ["lale"])
    token = a.issue(a.player("lale"))
    assert a.read(token).seat == "lale"
    assert a.read(a.issue(a.check_gm("gm-code"))).is_gm
    assert Auth(replace(settings, auth_epoch=2), ["lale"]).read(token) is None
    assert Auth(settings, ["tomo"]).read(token) is None  # a character that left the content
    assert a.read(token + "x") is None


def test_settings_validation():
    with pytest.raises(SettingsError):
        load_settings({"LSO_SECRET": "short", "LSO_GM_PASSCODE": "a"})
    with pytest.raises(SettingsError):
        load_settings({"LSO_SECRET": "x" * 20})  # no GM passcode
    assert load_settings({"LSO_SECRET": "x" * 20, "LSO_GM_PASSCODE": "ember"}).gm_passcode == "ember"
    # an older .env with per-seat passcodes still works: only its gm entry is used
    old = load_settings({"LSO_SECRET": "x" * 20, "LSO_PASSCODES": "gm=chrome-1, lale=quiet-2"})
    assert old.gm_passcode == "chrome-1"


def test_assets_need_login_and_visibility(client, seat):
    # before login, only the crew portraits (for the picker) are served
    assert client.get("/assets/portraits/ves.gif").status_code == 200
    assert client.get("/assets/portraits/dax.gif").status_code == 401
    assert client.get("/assets/maps/event-horizon/base-open.png").status_code == 401
    ves = seat("ves")
    assert client.get("/assets/maps/event-horizon/base-open.png", headers=ves).status_code == 200
    assert client.get("/assets/icons/dice/body-d4.png", headers=ves).status_code == 200
    # the hired gun isn't on any map in session 1, so a player can't fetch its portrait by guessing
    assert client.get("/assets/portraits/hired-gun.gif", headers=ves).status_code == 404
    assert client.get("/assets/..%2Fcontent/npcs.yaml", headers=ves).status_code == 404
    gm = seat("gm")
    assert client.get("/assets/portraits/hired-gun.gif", headers=gm).status_code == 200


def test_changed_art_reaches_a_browser_on_its_next_load(client, seat):
    gm = seat("gm")
    art = "/assets/maps/promenade/base-calm.png"
    first = client.get(art, headers=gm)
    assert first.status_code == 200 and first.headers["cache-control"] == "no-cache"
    tag = first.headers["etag"]
    # the browser asks whether its copy is still current: unchanged art costs no download
    same = client.get(art, headers={**gm, "If-None-Match": tag})
    assert same.status_code == 304 and same.content == b""
    # a copy that's out of date gets the whole new file
    stale = client.get(art, headers={**gm, "If-None-Match": '"an-old-version"'})
    assert stale.status_code == 200 and stale.content == first.content
    # knowing the tag doesn't get round who may see the file
    assert client.get(art, headers={"If-None-Match": tag}).status_code == 401
    gun = client.get("/assets/portraits/hired-gun.gif", headers=gm).headers["etag"]
    assert client.get("/assets/portraits/hired-gun.gif", headers={**seat("ves"), "If-None-Match": gun}).status_code == 404
