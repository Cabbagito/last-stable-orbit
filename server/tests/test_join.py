"""The join card: the wifi and the URL, on the TV and the GM's screen, and on nobody else's."""

import json
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from lso.auth import COOKIE, Viewer
from lso.commands import CommandError, handle
from lso.config import ROOT, load_settings
from lso.content import load_content
from lso.engine import Engine
from lso.join import join_card
from lso.main import create_app
from lso.store import Store
from lso.views import project

GM = Viewer("gm", "gm")
STAGE = Viewer("stage", "stage")
TALLY = Viewer("tally", "player")
SSID = "Some;Net"
PASSWORD = "not-on-a-players-feed"
URL = "http://parker.local"
FALLBACK = "http://192.168.1.4"


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


@pytest.fixture
def engine(content, tmp_path):
    return Engine(content, Store(tmp_path / "t.db"))


@pytest.fixture
def card(settings):
    return join_card(replace(settings, join_url=URL, join_fallback=FALLBACK, wifi_ssid=SSID, wifi_password=PASSWORD))


@pytest.fixture
def table(settings):
    app = create_app(replace(settings, join_url=URL, join_fallback=FALLBACK, wifi_ssid=SSID, wifi_password=PASSWORD))
    with TestClient(app) as c:
        yield c


def login(client, body) -> dict:
    r = client.post("/api/login", json=body)
    assert r.status_code == 200, r.text
    assert PASSWORD not in r.text
    token = r.cookies.get(COOKIE)
    client.cookies.clear()
    return {"cookie": f"{COOKIE}={token}"}


def first_view(client, headers, path="/ws") -> dict:
    with client.websocket_connect(path, headers=headers) as ws:
        while True:
            f = ws.receive_json()
            if f["t"] == "view":
                return f["view"]


def test_settings_read_the_card_from_the_environment():
    base = {"LSO_SECRET": "x" * 16, "LSO_GM_PASSCODE": "code"}
    s = load_settings(base)
    assert (s.join_url, s.wifi_ssid, s.wifi_password, s.join_fallback) == ("", "", "", "")
    s = load_settings(base | {"LSO_JOIN_URL": f" {URL} ", "LSO_JOIN_FALLBACK": FALLBACK, "LSO_WIFI_SSID": SSID, "LSO_WIFI_PASSWORD": " spaced pw "})
    assert (s.join_url, s.join_fallback, s.wifi_ssid, s.wifi_password) == (URL, FALLBACK, SSID, " spaced pw ")


def test_no_url_means_no_card_for_anyone(settings, engine, content):
    assert join_card(replace(settings, wifi_ssid=SSID, wifi_password=PASSWORD)) is None
    for v in (GM, STAGE, TALLY):
        assert "join" not in project(engine.state, content, v, join=None)["stage"]


def test_the_card_can_leave_the_wifi_out(settings):
    c = join_card(replace(settings, join_url=URL))
    assert c["url"] == URL and "ssid" not in c and "wifi_qr" not in c


def test_qr_paths_are_drawable_and_differ(card):
    for qr in (card["url_qr"], card["wifi_qr"]):
        assert qr["size"] >= 21 and qr["path"].startswith("M")
    assert card["url_qr"]["path"] != card["wifi_qr"]["path"]


def test_an_open_network_has_no_password_in_its_qr(settings):
    c = join_card(replace(settings, join_url=URL, wifi_ssid="open"))
    assert c["ssid"] == "open" and c["password"] == "" and c["wifi_qr"]["path"]


def test_the_tv_and_the_gm_get_the_card_and_players_never_do(engine, content, card):
    for v in (GM, STAGE):
        j = project(engine.state, content, v, join=card)["stage"]["join"]
        assert (j["url"], j["ssid"], j["password"], j["fallback"], j["show"]) == (URL, SSID, PASSWORD, FALLBACK, True)
    leak = json.dumps(project(engine.state, content, TALLY, join=card))
    assert "join" not in project(engine.state, content, TALLY, join=card)["stage"]
    for secret in (PASSWORD, card["wifi_qr"]["path"], SSID, URL):
        assert secret not in leak


def test_no_one_logged_out_can_read_the_password(table):
    r = table.get("/api/seats")
    assert r.status_code == 200 and PASSWORD not in r.text
    assert table.get("/api/me").status_code == 401
    with table.websocket_connect("/ws") as ws:
        assert ws.receive().get("code") == 4401


def test_over_the_wire_only_the_tv_and_the_gm_get_it(table):
    assert first_view(table, login(table, {"seat": "stage"}))["stage"]["join"]["password"] == PASSWORD
    gm = login(table, {"passcode": "gm-code"})
    assert first_view(table, gm)["stage"]["join"]["password"] == PASSWORD
    assert first_view(table, gm, "/ws?as=stage")["stage"]["join"]["password"] == PASSWORD  # the GM tab's TV preview
    # a player's own feed, and the GM looking through a player's screen
    for headers, path in ((login(table, {"seat": "tally"}), "/ws"), (gm, "/ws?as=tally")):
        view = first_view(table, headers, path)
        assert "join" not in view["stage"] and PASSWORD not in json.dumps(view)


async def test_the_gm_hides_and_shows_it_and_it_survives_a_restart(engine, content, tmp_path, card):
    ack, changed = await engine.run(GM, None, "gm.stage.join", {"show": False})
    assert ack["ok"] and changed
    assert project(engine.state, content, STAGE, join=card)["stage"]["join"]["show"] is False
    assert handle(GM, engine.state, content, "gm.stage.join", {"show": False}) == []  # nothing to change, no event
    engine.store.close()
    again = Engine(content, Store(tmp_path / "t.db"))
    assert again.state.stage.join is False
    ack, _ = await again.run(GM, None, "gm.stage.join", {"show": True})
    assert ack["ok"] and again.state.stage.join is True


def test_only_the_gm_can_toggle_it(engine, content):
    with pytest.raises(CommandError) as e:
        handle(TALLY, engine.state, content, "gm.stage.join", {"show": False})
    assert e.value.code == "forbidden"
    with pytest.raises(CommandError) as e:
        handle(GM, engine.state, content, "gm.stage.join", {"show": "no"})
    assert e.value.code == "invalid"


def test_the_tv_only_watches_and_cant_toggle_it(table):
    with table.websocket_connect("/ws", headers=login(table, {"seat": "stage"})) as ws:
        ws.send_text(json.dumps({"t": "intent", "id": "1", "type": "gm.stage.join", "args": {"show": False}}))
        while True:
            f = ws.receive_json()
            if f["t"] == "ack":
                assert not f["ok"] and f["code"] == "read_only"
                break
