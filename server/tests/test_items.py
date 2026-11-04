"""Pockets: only the GM moves items, players see only their own, and an item's text reaches nobody else."""

import json

import pytest

from lso.auth import Viewer
from lso.commands import CommandError, handle
from lso.config import ROOT
from lso.content import ContentError, check_refs, load_content
from lso.engine import Engine
from lso.models import GameState, Preset
from lso.state import apply
from lso.store import Store
from lso.views import project, referenced_assets

GM = Viewer("gm", "gm")
VES = Viewer("ves", "player")
MARLO = Viewer("marlo", "player")
TALLY = Viewer("tally", "player")

LOG_TEXT = "Nothing was spilled at that table."  # from Unit 14's maintenance log


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


@pytest.fixture
def engine(content, tmp_path):
    return Engine(content, Store(tmp_path / "t.db"))


async def run(engine, viewer, kind, args):
    ack, _ = await engine.run(viewer, None, kind, args)
    return ack


def pockets(engine, who):
    return engine.state.inventory[who]


def held(engine, who, item):
    return next(e for e in pockets(engine, who) if e.item == item)


def recv(ws, t):
    while True:
        f = ws.receive_json()
        if f["t"] == t:
            return f


def intent(ws, kind, args, iid):
    ws.send_json({"t": "intent", "id": iid, "type": kind, "args": args})


def codes(fn):
    with pytest.raises(CommandError) as e:
        fn()
    return e.value.code


# ---------------------------------------------------------------- content


def test_starting_kit_has_counted_credits(engine, content):
    assert content.items["credits"].counted and not content.items["sidearm"].counted
    ves = pockets(engine, "ves")
    assert [e.item for e in ves] == ["sidearm", "splice-kit", "invitation", "credits"]
    assert held(engine, "ves", "credits").count == 140 and held(engine, "ves", "sidearm").count is None
    assert not any(e.new for p in engine.state.inventory.values() for e in p)  # a starting kit isn't news
    assert all(content.items[i].text for i in content.items)  # every item has a tooltip


def test_presets_must_count_counted_items(content):
    def broken(inv):
        c = load_content(ROOT / "content")
        c.presets = {"x": Preset(id="x", name="x", default=True, party_map="event-horizon", inventory=inv)}
        with pytest.raises(ContentError) as e:
            check_refs(c)
        return str(e.value)

    assert "needs {item, count}" in broken({"ves": ["credits"]})
    assert "isn't counted" in broken({"ves": [{"item": "sidearm", "count": 2}]})
    assert "twice" in broken({"ves": [{"item": "credits", "count": 1}, {"item": "credits", "count": 2}]})
    assert "unknown item" in broken({"ves": ["laser-sword"]})


# ---------------------------------------------------------------- the GM moves items


async def test_gm_gives_takes_and_moves(engine):
    assert (await run(engine, GM, "gm.item.give", {"holder": "marlo", "item": "maintenance-log"}))["ok"]
    log = held(engine, "marlo", "maintenance-log")
    assert log.new and log.count is None
    assert (await run(engine, GM, "gm.item.move", {"holder": "marlo", "uid": log.uid, "to": "tally"}))["ok"]
    assert all(e.item != "maintenance-log" for e in pockets(engine, "marlo"))
    moved = held(engine, "tally", "maintenance-log")
    assert moved.uid == log.uid and moved.new  # same item, news to Tally
    assert (await run(engine, GM, "gm.item.take", {"holder": "tally", "uid": log.uid}))["ok"]
    assert all(e.item != "maintenance-log" for e in pockets(engine, "tally"))


async def test_two_of_the_same_note_are_two_items(engine):
    await run(engine, GM, "gm.item.give", {"holder": "ves", "item": "founder-log-1"})
    await run(engine, GM, "gm.item.give", {"holder": "ves", "item": "founder-log-1"})
    logs = [e for e in pockets(engine, "ves") if e.item == "founder-log-1"]
    assert len(logs) == 2 and logs[0].uid != logs[1].uid


async def test_credits_merge_and_count(engine):
    cr = held(engine, "ves", "credits")
    await run(engine, GM, "gm.item.give", {"holder": "ves", "item": "credits", "count": 60})
    assert [e.item for e in pockets(engine, "ves")].count("credits") == 1
    assert held(engine, "ves", "credits").count == 200 and held(engine, "ves", "credits").new  # paid: that's news
    await run(engine, VES, "item.seen", {"uid": cr.uid})
    await run(engine, GM, "gm.item.count", {"holder": "ves", "uid": cr.uid, "count": 150})
    assert held(engine, "ves", "credits").count == 150 and not held(engine, "ves", "credits").new  # spending isn't
    await run(engine, GM, "gm.item.count", {"holder": "ves", "uid": cr.uid, "count": 0})
    assert held(engine, "ves", "credits").count == 0  # broke, but the purse stays until the GM takes it
    tomo = held(engine, "tomo", "credits")
    await run(engine, GM, "gm.item.move", {"holder": "tomo", "uid": tomo.uid, "to": "ves"})
    assert held(engine, "ves", "credits").count == 140 and all(e.item != "credits" for e in pockets(engine, "tomo"))
    await run(engine, GM, "gm.item.give", {"holder": "tomo", "item": "credits", "count": 5})
    assert held(engine, "tomo", "credits").count == 5 and held(engine, "tomo", "credits").new


async def test_item_commands_check_their_arguments(engine, content):
    s = engine.state
    sidearm = held(engine, "ves", "sidearm").uid
    credits = held(engine, "ves", "credits").uid
    bad = [
        ("gm.item.give", {"holder": "dax", "item": "sidearm"}),  # NPCs have no pockets
        ("gm.item.give", {"holder": "ves", "item": "laser-sword"}),
        ("gm.item.give", {"holder": "ves", "item": "sidearm", "count": 2}),
        ("gm.item.give", {"holder": "ves", "item": "credits"}),
        ("gm.item.give", {"holder": "ves", "item": "credits", "count": 0}),
        ("gm.item.give", {"holder": "ves", "item": "credits", "count": True}),
        ("gm.item.take", {"holder": "marlo", "uid": sidearm}),  # Ves holds it, not Marlo
        ("gm.item.move", {"holder": "ves", "uid": sidearm, "to": "fixer"}),
        ("gm.item.count", {"holder": "ves", "uid": sidearm, "count": 3}),
        ("gm.item.count", {"holder": "ves", "uid": credits, "count": -1}),
        ("gm.item.count", {"holder": "ves", "uid": credits, "count": 10**7}),
    ]
    for kind, args in bad:
        assert codes(lambda: handle(GM, s, content, kind, args)) == "invalid", (kind, args)
    assert handle(GM, s, content, "gm.item.move", {"holder": "ves", "uid": sidearm, "to": "ves"}) == []
    assert handle(GM, s, content, "gm.item.count", {"holder": "ves", "uid": credits, "count": 140}) == []


async def test_players_cant_move_items(engine, content):
    sidearm = held(engine, "ves", "sidearm").uid
    for kind, args in [
        ("gm.item.give", {"holder": "ves", "item": "access-chit"}),
        ("gm.item.move", {"holder": "ves", "uid": sidearm, "to": "tomo"}),
        ("gm.item.take", {"holder": "ves", "uid": sidearm}),
        ("gm.item.count", {"holder": "ves", "uid": held(engine, "ves", "credits").uid, "count": 9999}),
    ]:
        assert codes(lambda: handle(VES, engine.state, content, kind, args)) == "forbidden"


async def test_only_the_holder_marks_an_item_seen(engine, content):
    await run(engine, GM, "gm.item.give", {"holder": "marlo", "item": "maintenance-log"})
    uid = held(engine, "marlo", "maintenance-log").uid
    assert codes(lambda: handle(TALLY, engine.state, content, "item.seen", {"uid": uid})) == "invalid"
    assert codes(lambda: handle(GM, engine.state, content, "item.seen", {"uid": uid})) == "invalid"
    assert held(engine, "marlo", "maintenance-log").new
    assert (await run(engine, MARLO, "item.seen", {"uid": uid}))["ok"]
    assert not held(engine, "marlo", "maintenance-log").new
    assert handle(MARLO, engine.state, content, "item.seen", {"uid": uid}) == []  # already seen: nothing to log


# ---------------------------------------------------------------- what each viewer gets


async def test_a_clue_reaches_only_its_holder_and_the_gm(engine, content):
    await run(engine, GM, "gm.item.give", {"holder": "marlo", "item": "maintenance-log"})
    m, t, g = (project(engine.state, content, v) for v in (MARLO, TALLY, GM))
    (log,) = [e for e in m["inventory"]["marlo"] if e["item"]["id"] == "maintenance-log"]
    assert log["new"] and LOG_TEXT in log["item"]["text"] and log["item"]["icon"] == "/assets/icons/items/note.png"
    assert list(t["inventory"]) == ["tally"] and LOG_TEXT not in json.dumps(t)
    assert "items" not in m and "items" not in t  # players never get the catalogue
    assert LOG_TEXT in json.dumps(g["inventory"]["marlo"])
    assert {i["id"] for i in g["items"]} == set(content.items)
    assert set(g["inventory"]) == set(content.characters)


async def test_a_player_with_empty_pockets_still_gets_their_own(engine, content):
    for e in list(pockets(engine, "tomo")):
        await run(engine, GM, "gm.item.take", {"holder": "tomo", "uid": e.uid})
    assert project(engine.state, content, Viewer("tomo", "player"))["inventory"] == {"tomo": []}


async def test_item_icons_are_allowlisted_only_once_held(engine, content):
    chit = "icons/items/access-chit.png"
    assert chit not in referenced_assets(project(engine.state, content, TALLY))
    await run(engine, GM, "gm.item.give", {"holder": "tally", "item": "access-chit"})
    assert chit in referenced_assets(project(engine.state, content, TALLY))
    assert chit in referenced_assets(project(engine.state, content, GM))  # the catalogue


async def test_pockets_survive_a_restart(content, tmp_path):
    e1 = Engine(content, Store(tmp_path / "r.db"))
    await e1.run(GM, None, "gm.item.give", {"holder": "marlo", "item": "maintenance-log"})
    await e1.run(GM, None, "gm.item.give", {"holder": "marlo", "item": "credits", "count": 25})
    uid = next(e.uid for e in e1.state.inventory["ves"] if e.item == "sidearm")
    await e1.run(GM, None, "gm.item.move", {"holder": "ves", "uid": uid, "to": "tomo"})
    before = e1.state.model_dump(mode="json")
    state = GameState()
    for seq, ev_type, data in e1.store.events():
        state = apply(state, seq, ev_type, json.loads(data))
    assert state.model_dump(mode="json") == before  # the log alone rebuilds it
    e1.store.close()
    e2 = Engine(content, Store(tmp_path / "r.db"))
    assert e2.state.model_dump(mode="json") == before
    assert next(e for e in e2.state.inventory["marlo"] if e.item == "credits").count == 165


# ---------------------------------------------------------------- over the socket


def test_an_item_handed_to_marlo_reaches_only_marlo_and_the_gm(client, seat):
    gm, marlo, tally = seat("gm"), seat("marlo"), seat("tally")
    with (
        client.websocket_connect("/ws", headers=gm) as g,
        client.websocket_connect("/ws", headers=marlo) as m,
        client.websocket_connect("/ws", headers=tally) as t,
    ):
        recv(g, "view"), recv(m, "view"), recv(t, "view")
        intent(g, "gm.item.give", {"holder": "marlo", "item": "maintenance-log"}, "give")
        mine = recv(m, "view")["view"]["inventory"]["marlo"]
        assert any(e["item"]["id"] == "maintenance-log" and e["new"] for e in mine)
        assert LOG_TEXT in json.dumps(recv(g, "view")["view"]["inventory"]["marlo"])
        assert recv(g, "ack")["ok"]
        t.send_json({"t": "ping"})
        assert t.receive_json()["t"] == "pong"  # Tally's view didn't change, so she got no frame at all

        uid = next(e["uid"] for e in mine if e["item"]["id"] == "maintenance-log")
        intent(m, "item.seen", {"uid": uid}, "seen")
        assert not next(e for e in recv(m, "view")["view"]["inventory"]["marlo"] if e["uid"] == uid)["new"]
        assert recv(m, "ack")["ok"]
        t.send_json({"t": "ping"})
        assert t.receive_json()["t"] == "pong"
