"""The live socket, end to end, with two seats connected."""

import json

import pytest
from starlette.websockets import WebSocketDisconnect


def recv(ws, t):
    """Next frame of type t, skipping others."""
    while True:
        f = ws.receive_json()
        if f["t"] == t:
            return f


def intent(ws, kind, args, iid):
    ws.send_json({"t": "intent", "id": iid, "type": kind, "args": args})


def test_ws_requires_login(client):
    with client.websocket_connect("/ws") as ws:
        with pytest.raises(WebSocketDisconnect) as e:
            ws.receive_json()
        assert e.value.code == 4401


def test_ws_rejects_foreign_origin(client, seat):
    h = seat("ves") | {"origin": "http://evil.example"}
    with client.websocket_connect("/ws", headers=h) as ws:
        with pytest.raises(WebSocketDisconnect) as e:
            ws.receive_json()
        assert e.value.code == 4401


def test_move_reaches_everyone_and_hidden_never_leaks(client, seat):
    gm, ves = seat("gm"), seat("ves")
    with client.websocket_connect("/ws", headers=gm) as g, client.websocket_connect("/ws", headers=ves) as v:
        gv = recv(g, "view")["view"]
        vv = recv(v, "view")["view"]
        assert gv["me"]["role"] == "gm" and vv["me"]["char"] == "ves"
        assert "roster" in gv and "roster" not in vv

        # Ves moves herself: both screens get the new spot, Ves gets an ack
        intent(v, "token.move", {"token": "ves", "at": [6, 6, 0.24]}, "m1")
        assert recv(v, "view")["view"]["tokens"]["ves"]["at"] == [6, 6, 0.24]
        assert recv(v, "ack") == {"t": "ack", "id": "m1", "ok": True}
        assert recv(g, "view")["view"]["tokens"]["ves"]["at"] == [6, 6, 0.24]

        # Ves can't move Dax
        intent(v, "token.move", {"token": "dax", "at": [0, 0, 0]}, "m2")
        assert recv(v, "ack")["code"] == "forbidden"

        # live drag frames reach the GM, not the sender
        v.send_json({"t": "intent", "type": "token.drag", "args": {"token": "ves", "at": [6.5, 6, 0.24]}})
        d = recv(g, "drag")
        assert d["token"] == "ves" and d["at"] == [6.5, 6, 0.24]

        # the GM hides Unit 14: it vanishes for Ves, and no frame she gets mentions it
        intent(g, "gm.token.hide", {"token": "cleaner-14", "hidden": True}, "h1")
        frame = recv(v, "view")
        raw = json.dumps(frame)
        assert "cleaner-14" not in raw and "Cleaner Unit 14" not in raw
        assert recv(g, "ack")["ok"]

        # a drag of the hidden token isn't relayed to Ves either
        g.send_json({"t": "intent", "type": "token.drag", "args": {"token": "cleaner-14", "at": [1, 1, 0]}})
        intent(g, "gm.vitals.set", {"char": "ves", "hp": 3}, "h2")
        nxt = v.receive_json()  # the next thing Ves sees is the vitals change, not the drag
        assert nxt["t"] == "view" and "cleaner-14" not in json.dumps(nxt)
        assert [c for c in nxt["view"]["crew"] if c["id"] == "ves"][0]["hp"] == 3


def test_hidden_moves_send_players_nothing(client, seat):
    gm, ves = seat("gm"), seat("ves")
    with client.websocket_connect("/ws", headers=gm) as g, client.websocket_connect("/ws", headers=ves) as v:
        recv(g, "view"), recv(v, "view")
        intent(g, "gm.token.hide", {"token": "cleaner-14", "hidden": True}, "a")
        recv(v, "view")
        recv(g, "ack")
        intent(g, "token.move", {"token": "cleaner-14", "at": [2, 2, 0]}, "b")  # hidden: Ves's view is unchanged
        recv(g, "ack")
        v.send_json({"t": "ping"})
        assert v.receive_json() == {"t": "pong"}  # no view frame was queued before the pong


def test_reconnect_gets_current_state(client, seat):
    gm = seat("gm")
    with client.websocket_connect("/ws", headers=gm) as g:
        recv(g, "view")
        intent(g, "gm.map.mood", {"map": "event-horizon", "mood": "after"}, "x")
        recv(g, "ack")
    with client.websocket_connect("/ws", headers=gm) as g:
        assert recv(g, "view")["view"]["maps"]["event-horizon"]["mood"] == "after"
