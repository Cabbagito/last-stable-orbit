from dataclasses import replace

import pytest

from lso.auth import Auth
from lso.config import SettingsError, load_settings, parse_passcodes


def test_login_sets_cookie_and_me(client, seat):
    h = seat("Ves-Code ")  # case and spaces don't matter
    assert client.get("/api/me", headers=h).json() == {"seat": "ves", "role": "player", "char": "ves"}


def test_bad_passcode(client):
    assert client.post("/api/login", json={"passcode": "nope"}).status_code == 401
    assert client.get("/api/me").status_code == 401


def test_logout(client):
    assert client.post("/api/login", json={"passcode": "gm-code"}).status_code == 200
    assert client.get("/api/me").json()["role"] == "gm"
    client.post("/api/logout")
    assert client.get("/api/me").status_code == 401


def test_epoch_bump_logs_everyone_out(settings):
    a = Auth(settings)
    token = a.issue(a.check_passcode("lale-code"))
    assert a.read(token).seat == "lale"
    assert Auth(replace(settings, auth_epoch=2)).read(token) is None
    assert a.read(token + "x") is None


def test_settings_validation():
    with pytest.raises(SettingsError):
        parse_passcodes("gm=same,lale=same")
    with pytest.raises(SettingsError):
        load_settings({"LSO_SECRET": "short", "LSO_PASSCODES": "gm=a"})
    with pytest.raises(SettingsError):
        load_settings({"LSO_SECRET": "x" * 20, "LSO_PASSCODES": "lale=a"})  # no gm seat
    s = load_settings({"LSO_SECRET": "x" * 20, "LSO_PASSCODES": "gm=a, Lale=b"})
    assert [x.id for x in s.seats] == ["gm", "lale"]


def test_assets_need_login_and_visibility(client, seat):
    assert client.get("/assets/portraits/ves.gif").status_code == 401
    ves = seat("ves-code")
    assert client.get("/assets/portraits/ves.gif", headers=ves).status_code == 200
    assert client.get("/assets/icons/dice/body-d4.png", headers=ves).status_code == 200
    # the hired gun isn't on any map in session 1, so a player can't fetch its portrait by guessing
    assert client.get("/assets/portraits/hired-gun.gif", headers=ves).status_code == 404
    assert client.get("/assets/..%2Fcontent/npcs.yaml", headers=ves).status_code == 404
    gm = seat("gm-code")
    assert client.get("/assets/portraits/hired-gun.gif", headers=gm).status_code == 200
