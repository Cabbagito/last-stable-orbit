"""The GM tab's server side: "New session", and "view as player", which must show exactly one seat's feed."""

import json

import pytest
from starlette.websockets import WebSocketDisconnect

from lso.auth import Viewer
from lso.commands import CommandError, handle
from lso.config import ROOT
from lso.content import load_content
from lso.engine import Engine
from lso.store import Store
from lso.views import project

GM = Viewer("gm", "gm")
TALLY = Viewer("tally", "player")
EH = "event-horizon"
SLOTS_TEXT = "No one has ever beaten the slots."


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


@pytest.fixture
def engine(content, tmp_path):
    return Engine(content, Store(tmp_path / "t.db"))


def recv(ws, t):
    while True:
        f = ws.receive_json()
        if f["t"] == t:
            return f


def intent(ws, kind, args, iid):
    ws.send_json({"t": "intent", "id": iid, "type": kind, "args": args})


# ---------- View as player ----------


@pytest.mark.parametrize(
    "who,as_,code",
    [("tally", "marlo", 4403), ("tally", "tally", 4403), ("gm", "nobody", 4404), ("gm", "gm", 4404), ("gm", "", 4404)],
)
def test_only_the_gm_can_view_as_and_only_as_a_real_seat(client, seat, who, as_, code):
    with client.websocket_connect(f"/ws?as={as_}", headers=seat(who)) as ws:
        with pytest.raises(WebSocketDisconnect) as e:
            ws.receive_json()
        assert e.value.code == code


def test_view_as_without_a_login_is_turned_away(client):
    with client.websocket_connect("/ws?as=tally") as ws:
        with pytest.raises(WebSocketDisconnect) as e:
            ws.receive_json()
        assert e.value.code == 4401


def test_view_as_gets_exactly_that_seats_feed_and_no_secrets(client, seat, app):
    gm, tally = seat("gm"), seat("tally")
    engine = app.state.engine
    with client.websocket_connect("/ws", headers=gm) as g:
        recv(g, "view")
        # what Tally must never see: a hidden NPC, a hidden thing to inspect, and a clue in Marlo's pocket
        for i, (kind, args) in enumerate(
            [
                ("gm.token.hide", {"token": "cleaner-14", "hidden": True}),
                ("gm.object.show", {"map": EH, "object": "slots", "shown": False}),
                ("gm.item.give", {"holder": "marlo", "item": "maintenance-log"}),
            ]
        ):
            intent(g, kind, args, f"s{i}")
            assert recv(g, "ack")["ok"]

        with client.websocket_connect("/ws?as=tally", headers=gm) as p, client.websocket_connect("/ws", headers=tally) as t:
            pv, tv = recv(p, "view")["view"], recv(t, "view")["view"]
            assert pv == tv == project(engine.state, engine.content, TALLY)  # the same projection, nothing added
            assert pv["me"] == {"seat": "tally", "role": "player", "char": "tally"}
            raw = json.dumps(pv)
            for secret in ["cleaner-14", "The Cleaner", "maintenance-log", "Unit 14's log", SLOTS_TEXT, "Slot machines", "gm_note"]:
                assert secret not in raw, secret
            assert set(pv["inventory"]) == {"tally"}
            assert {o["id"] for o in pv["maps"][EH]["objects"]} == {"mural"}
            assert not {"roster", "presets", "items"} & set(pv)

            # it stays live: the GM hides Dax, and the preview loses him exactly as Tally's screen does
            intent(g, "gm.token.hide", {"token": "fixer", "hidden": True}, "d")
            assert recv(g, "ack")["ok"]
            pv, tv = recv(p, "view")["view"], recv(t, "view")["view"]
            assert pv == tv and "fixer" not in pv["tokens"]


def test_view_as_is_read_only(client, seat, app):
    gm = seat("gm")
    engine = app.state.engine
    with client.websocket_connect("/ws", headers=gm) as g, client.websocket_connect("/ws?as=tally", headers=gm) as p:
        recv(g, "view"), recv(p, "view")
        seq = engine.state.seq
        attempts = [
            ("token.move", {"token": "tally", "at": [6, 6, 0.24]}),
            ("roll.start", {"stat": "tech"}),
            ("object.seen", {"map": EH, "object": "mural"}),  # opening a card in the preview mustn't count as Tally looking
            ("item.seen", {"uid": "x"}),
            ("gm.vitals.set", {"char": "ves", "hp": 1}),  # not even GM commands, though the cookie is the GM's
        ]
        for i, (kind, args) in enumerate(attempts):
            intent(p, kind, args, f"p{i}")
            ack = recv(p, "ack")
            assert (ack["id"], ack["ok"], ack["code"]) == (f"p{i}", False, "read_only"), kind
        p.send_json({"t": "intent", "type": "token.drag", "args": {"token": "tally", "at": [7, 7, 0.24]}})
        g.send_json({"t": "ping"})
        assert g.receive_json()["t"] == "pong"  # the drag reached no one
        assert engine.state.seq == seq


def test_viewing_as_tally_doesnt_put_tally_at_the_table(client, seat, app):
    gm = seat("gm")
    with client.websocket_connect("/ws?as=tally", headers=gm) as p:
        recv(p, "view")
        seats = client.get("/api/seats").json()
        assert not next(c for c in seats["crew"] if c["id"] == "tally")["online"]
        assert not seats["gm_online"]
        assert app.state.hub.online() == set()  # so the roll sweeper still sees Tally as away
