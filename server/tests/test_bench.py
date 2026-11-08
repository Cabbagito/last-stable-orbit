"""The sandbox's Bench, the GM's map groups, and NPC health outside a fight."""

from __future__ import annotations

import pytest

from lso.auth import Viewer
from lso.config import ROOT
from lso.content import load_content
from lso.engine import Engine
from lso.store import Store
from lso.views import project

GM = Viewer("gm", "gm")
TOMO = Viewer("tomo", "player")
STAGE = Viewer("stage", "stage")


@pytest.fixture
def content():
    return load_content(ROOT / "content", ROOT / "assets")


def make(content, sandbox: bool) -> Engine:
    return Engine(content, Store(":memory:"), sandbox=sandbox)


async def go(e: Engine, viewer: Viewer, kind: str, args: dict | None = None) -> dict:
    ack, _ = await e.run(viewer, None, kind, args or {})
    return ack


def tables(e: Engine) -> set[str]:
    return {r[0] for r in e.store.db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


# ---------------------------------------------------------------- the real table


@pytest.mark.parametrize("kind", ["bench.dice", "bench.tv", "bench.keep", "bench.back", "bench.scenario", "bench.as"])
async def test_the_bench_does_not_exist_on_the_real_table(content, kind):
    e = make(content, sandbox=False)
    ack = await go(e, GM, kind, {"next": "one", "on": True, "id": "split-party"})
    assert not ack["ok"] and "unknown intent" in ack["error"]
    assert not e.fake_tv


def test_the_real_save_never_gets_a_moments_table(content):
    assert "moments" not in tables(make(content, sandbox=False))


def test_no_seat_gets_a_bench_view_on_the_real_table(content):
    e = make(content, sandbox=False)
    assert e.bench_view() is None
    for v in (GM, TOMO, STAGE):
        assert "bench" not in project(e.state, e.content, v, bench=e.bench_view())


def test_only_the_gm_gets_the_bench_in_the_sandbox(content):
    e = make(content, sandbox=True)
    assert "bench" in project(e.state, e.content, GM, bench=e.bench_view())
    for v in (TOMO, STAGE):
        assert "bench" not in project(e.state, e.content, v, bench=e.bench_view())


@pytest.mark.parametrize("kind", ["bench.dice", "bench.keep", "bench.as"])
async def test_only_the_gm_can_use_the_bench(content, kind):
    e = make(content, sandbox=True)
    ack = await go(e, TOMO, kind, {"next": "one"})
    assert not ack["ok"] and ack["code"] == "forbidden"


# ---------------------------------------------------------------- the view-as socket


def _ws_url(act: bool) -> str:
    return "/ws?as=tomo" + ("&act=1" if act else "")


def test_act_is_ignored_outside_the_sandbox(client, seat):
    with client.websocket_connect(_ws_url(act=True), headers=seat("gm")) as ws:
        ws.receive_json()
        ws.send_json({"t": "intent", "id": "x1", "type": "item.seen", "args": {"uid": "nope"}})
        ack = ws.receive_json()
    assert ack["code"] == "read_only"


# ---------------------------------------------------------------- dice


async def _roll(e: Engine, seat: str = "tomo") -> list[int]:
    assert (await go(e, Viewer(seat, "player"), "roll.start", {"stat": "body"}))["ok"]
    return next(r for r in e.state.rolls if r.by == seat and r.open).dice


async def test_a_forced_natural_1_is_used_once(content):
    e = make(content, sandbox=True)
    await go(e, GM, "bench.dice", {"next": "one"})
    assert e.bench_view()["dice"] == "one"
    assert (await _roll(e))[0] == 1
    assert e.bench_view()["dice"] == "random"


@pytest.mark.parametrize("name, dice", [("boom", 2), ("boom2", 3)])
async def test_forced_explosions(content, name, dice):
    e = make(content, sandbox=True)
    await go(e, GM, "bench.dice", {"next": name})
    assert len(await _roll(e)) == dice


async def test_bad_dice_are_refused(content):
    assert not (await go(make(content, sandbox=True), GM, "bench.dice", {"next": "loaded"}))["ok"]


# ---------------------------------------------------------------- moments


async def test_the_copy_is_kept_at_boot_and_can_be_gone_back_to(content):
    e = make(content, sandbox=True)
    start = e.bench_view()["start"][0]
    await go(e, GM, "gm.vitals.set", {"char": "tomo", "hp": 1})
    assert (await go(e, GM, "bench.back", {"id": start["id"]}))["ok"]
    assert e.state.vitals["tomo"].hp == content.characters["tomo"].health


async def test_a_kept_moment_comes_back(content):
    e = make(content, sandbox=True)
    await go(e, GM, "gm.vitals.set", {"char": "tomo", "hp": 3})
    await go(e, GM, "bench.keep", {"name": "Hurt"})
    await go(e, GM, "gm.vitals.set", {"char": "tomo", "hp": 8})
    kept = e.bench_view()["kept"][0]
    assert kept["name"] == "Hurt"
    await go(e, GM, "bench.back", {"id": kept["id"]})
    assert e.state.vitals["tomo"].hp == 3


async def test_going_back_drops_what_came_after(content):
    e = make(content, sandbox=True)
    for hp in (5, 4, 3):
        await go(e, GM, "gm.vitals.set", {"char": "tomo", "hp": hp})
    hist = e.bench_view()["history"]
    assert [h["name"] for h in hist] == ["Tomo: HP 3, Entropy 2", "Tomo: HP 4, Entropy 2", "Tomo: HP 5, Entropy 2"]
    await go(e, GM, "bench.back", {"id": hist[1]["id"]})
    assert e.state.vitals["tomo"].hp == 4
    assert len(e.bench_view()["history"]) == 2


# ---------------------------------------------------------------- scenarios and acting


@pytest.mark.parametrize("sc", ["fight-at-the-bar", "split-party", "everyone-hurt", "heist-deck-8"])
async def test_every_scenario_loads(content, sc):
    e = make(content, sandbox=True)
    ack = await go(e, GM, "bench.scenario", {"id": sc})
    assert ack["ok"], ack


async def test_the_fight_scenario_starts_its_fight(content):
    e = make(content, sandbox=True)
    await go(e, GM, "bench.scenario", {"id": "fight-at-the-bar"})
    assert "guard" not in e.state.fights["event-horizon"].order
    assert len(e.state.fights["event-horizon"].order) == 7


async def test_a_scenario_cant_be_loaded_as_a_preset(content):
    assert not (await go(make(content, sandbox=False), GM, "gm.world.load_preset", {"preset": "split-party"}))["ok"]


async def test_bench_as_runs_a_players_action_only(content):
    e = make(content, sandbox=True)
    assert (await go(e, GM, "bench.as", {"seat": "ves", "type": "roll.start", "args": {"stat": "cool"}}))["ok"]
    assert next(r for r in e.state.rolls if r.by == "ves")
    assert not (await go(e, GM, "bench.as", {"seat": "ves", "type": "gm.session.new"}))["ok"]


async def test_pretending_the_tv_is_on(content):
    e = make(content, sandbox=True)
    await go(e, GM, "bench.tv", {"on": True})
    assert e.fake_tv and e.bench_view()["tv"]


# ---------------------------------------------------------------- what the GM's Scene needs


def test_the_gm_has_every_npcs_health_and_players_dont(content):
    e = make(content, sandbox=False)
    gm = project(e.state, e.content, GM)["tokens"]
    npcs = [t for t in gm.values() if t["kind"] == "npc"]
    assert npcs and all(t["hp"] == t["health"] for t in npcs)
    tv_or_player = list(project(e.state, e.content, TOMO)["tokens"].values()) + list(project(e.state, e.content, STAGE)["tokens"].values())
    assert not any("hp" in t or "health" in t for t in tv_or_player)


def test_every_map_is_in_one_group_and_only_the_gm_gets_them(content):
    e = make(content, sandbox=False)
    groups = project(e.state, e.content, GM)["map_groups"]
    assert sorted(m["id"] for g in groups for m in g["maps"]) == sorted(content.maps)
    for v in (TOMO, STAGE):
        assert "map_groups" not in project(e.state, e.content, v)


def test_only_the_gm_gets_npc_groups(content):
    e = make(content, sandbox=False)
    assert all(n["group"] for n in project(e.state, e.content, GM)["roster"])
    assert "roster" not in project(e.state, e.content, TOMO)
