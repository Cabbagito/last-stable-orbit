"""Chrome, the maximums and Draw: a piece of chrome is a fourth skill or an item that raises a maximum, the GM can set a
maximum by hand, Draw hands over one findable picked on the server, and how the GM's pickers sort the items never
reaches a player."""

import json
import random

import pytest

from lso.auth import Viewer
from lso.commands import CommandError, handle
from lso.config import ROOT
from lso.content import ContentError, check_refs, load_content
from lso.engine import Engine
from lso.store import Store
from lso.views import project

GM = Viewer("gm", "gm")
VES = Viewer("ves", "player")
TOMO = Viewer("tomo", "player")
TV = Viewer("stage", "stage")


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


@pytest.fixture
def engine(content, tmp_path):
    return Engine(content, Store(tmp_path / "t.db"), rng=random.Random(7))


async def run(engine, viewer, kind, args):
    ack, _ = await engine.run(viewer, None, kind, args)
    return ack


def crew(engine, content, viewer, who):
    return next(c for c in project(engine.state, content, viewer)["crew"] if c["id"] == who)


def held(engine, who, item):
    return next(e for e in engine.state.inventory[who] if e.item == item)


def code(fn):
    with pytest.raises(CommandError) as e:
        fn()
    return e.value.code


# ---------------------------------------------------------------- content


def test_every_item_is_on_a_shelf_or_is_chrome(content):
    shelves = {s.id for s in content.shelves}
    for it in content.items.values():
        assert (it.shelf in shelves) != bool(it.chrome), it.id
    assert sum(1 for it in content.items.values() if it.chrome) == 15
    assert {it.id for it in content.items.values() if it.raises} == {"chrome-health", "chrome-entropy", "bootleg-chrome-health", "bootleg-chrome-entropy"}
    assert [s.id for s in content.shelves if s.draw] == ["useful", "sell", "odd", "trash"]


def test_a_broken_shelf_is_refused():
    def broken(change):
        c = load_content(ROOT / "content")
        change(c)
        with pytest.raises(ContentError) as e:
            check_refs(c)
        return str(e.value)

    assert "unknown shelf" in broken(lambda c: setattr(c.items["sidearm"], "shelf", "attic"))
    assert "needs a shelf, or chrome" in broken(lambda c: setattr(c.items["sidearm"], "shelf", None))
    assert "needs a shelf, or chrome" in broken(lambda c: setattr(c.items["jump-boots"], "shelf", "kit"))
    assert "only chrome raises" in broken(lambda c: setattr(c.items["sidearm"], "raises", "health"))


# ---------------------------------------------------------------- chrome as a fourth skill


async def test_chrome_goes_on_the_sheet_and_can_be_rolled(engine, content):
    assert len(crew(engine, content, VES, "ves")["list"]) == 3
    assert (await run(engine, GM, "gm.chrome.install", {"char": "ves", "item": "jump-boots"}))["ok"]
    for viewer in (GM, VES, TOMO, TV):  # as public as her skills
        row = crew(engine, content, viewer, "ves")["list"][3]
        assert (row["name"], row["kind"], row["downside"], row["item"]) == ("Jump boots", "chrome", None, "jump-boots")
        assert "pistons" in row["text"] and row["icon"].endswith("jump-boots.png")
    assert all(e.item != "jump-boots" for e in engine.state.inventory["ves"])  # it isn't something she holds
    assert handle(GM, engine.state, content, "gm.chrome.install", {"char": "ves", "item": "jump-boots"}) == []  # once

    assert code(lambda: handle(TOMO, engine.state, content, "roll.start", {"stat": "body", "entry": 3})) == "invalid"  # hers, not his
    assert (await run(engine, VES, "roll.start", {"stat": "body", "entry": 3}))["ok"]
    r = engine.state.rolls[-1]
    assert (r.entry, r.sides) == ("Jump boots", 6)  # her Body d4, stepped up like a skill

    assert (await run(engine, GM, "gm.chrome.remove", {"char": "ves", "item": "jump-boots"}))["ok"]
    assert len(crew(engine, content, VES, "ves")["list"]) == 3
    assert code(lambda: handle(VES, engine.state, content, "roll.start", {"stat": "body", "entry": 3})) == "invalid"


async def test_chrome_commands_check_their_arguments(engine, content):
    s = engine.state
    for kind, args in [
        ("gm.chrome.install", {"char": "dax", "item": "jump-boots"}),  # NPCs have no sheet
        ("gm.chrome.install", {"char": "ves", "item": "sidearm"}),  # not chrome
        ("gm.chrome.install", {"char": "ves", "item": "laser-legs"}),
        ("gm.chrome.remove", {"char": "ves", "item": "chrome-entropy"}),  # that one is held: it's taken like any item
        ("gm.vitals.max", {"char": "dax", "health": 5}),
        ("gm.vitals.max", {"char": "ves", "health": "lots"}),
        ("gm.item.draw", {"holder": "ves", "shelf": "kit"}),  # no Draw on the kit
        ("gm.item.draw", {"holder": "ves", "shelf": "attic"}),
        ("gm.item.draw", {"holder": "dax", "shelf": "trash"}),
    ]:
        assert code(lambda: handle(GM, s, content, kind, args, random.Random(1))) == "invalid", (kind, args)
    assert handle(GM, s, content, "gm.chrome.remove", {"char": "ves", "item": "jump-boots"}) == []  # she has none
    for kind, args in [
        ("gm.chrome.install", {"char": "ves", "item": "jump-boots"}),
        ("gm.vitals.max", {"char": "ves", "entropy": 12}),
        ("gm.item.draw", {"holder": "ves", "shelf": "useful"}),
    ]:
        assert code(lambda: handle(VES, s, content, kind, args, random.Random(1))) == "forbidden", (kind, args)


# ---------------------------------------------------------------- chrome that raises a maximum


async def test_a_held_cell_raises_the_maximum_and_takes_it_along(engine, content):
    assert (crew(engine, content, VES, "ves")["health"], crew(engine, content, VES, "ves")["entropy_max"]) == (4, 6)
    assert (await run(engine, GM, "gm.chrome.install", {"char": "ves", "item": "chrome-entropy"}))["ok"]
    cell = held(engine, "ves", "chrome-entropy")
    assert cell.new and len(crew(engine, content, VES, "ves")["list"]) == 3  # an item, not a row on the sheet
    assert crew(engine, content, TOMO, "ves")["entropy_max"] == 7  # everyone's ring of her grows a segment
    assert engine.state.vitals["ves"].entropy == 2  # what she has doesn't move

    await run(engine, GM, "gm.vitals.set", {"char": "ves", "entropy": 9})
    assert engine.state.vitals["ves"].entropy == 7  # up to the new maximum, and no further

    assert (await run(engine, GM, "gm.item.move", {"holder": "ves", "uid": cell.uid, "to": "tomo"}))["ok"]
    assert (crew(engine, content, GM, "ves")["entropy_max"], crew(engine, content, GM, "tomo")["entropy_max"]) == (6, 7)
    assert engine.state.vitals["ves"].entropy == 6  # and what she had over it went with the cell

    await run(engine, GM, "gm.item.give", {"holder": "tomo", "item": "bootleg-chrome-health"})  # Give works too
    assert crew(engine, content, GM, "tomo")["health"] == 10
    await run(engine, GM, "gm.vitals.set", {"char": "tomo", "hp": 10})
    await run(engine, GM, "gm.item.take", {"holder": "tomo", "uid": held(engine, "tomo", "bootleg-chrome-health").uid})
    assert crew(engine, content, GM, "tomo")["health"] == 9 and engine.state.vitals["tomo"].hp == 9


async def test_the_gm_sets_a_maximum_by_hand(engine, content):
    assert (await run(engine, GM, "gm.vitals.max", {"char": "ves", "health": 6}))["ok"]
    assert crew(engine, content, VES, "ves")["health"] == 6 and engine.state.vitals["ves"].hp == 4
    await run(engine, GM, "gm.chrome.install", {"char": "ves", "item": "chrome-health"})
    assert crew(engine, content, VES, "ves")["health"] == 7  # chrome adds to what was set by hand
    await run(engine, GM, "gm.vitals.set", {"char": "ves", "hp": 7})
    assert (await run(engine, GM, "gm.vitals.max", {"char": "ves", "health": 3, "entropy": 1}))["ok"]
    v = engine.state.vitals["ves"]
    assert (crew(engine, content, VES, "ves")["health"], v.hp, crew(engine, content, VES, "ves")["entropy_max"], v.entropy) == (3, 3, 1, 1)
    assert handle(GM, engine.state, content, "gm.vitals.max", {"char": "ves", "health": 3}) == []  # already that
    await run(engine, GM, "gm.vitals.max", {"char": "ves", "health": 99, "entropy": 0})
    c = crew(engine, content, VES, "ves")
    assert (c["health"], c["entropy_max"]) == (20, 1)  # kept between 1 and what the ring can draw


async def test_loading_a_scene_keeps_chrome_and_a_fresh_start_clears_it(engine, content):
    await run(engine, GM, "gm.chrome.install", {"char": "ves", "item": "bootleg-magnets"})
    await run(engine, GM, "gm.vitals.max", {"char": "ves", "entropy": 8})
    preset = content.default_preset.id
    assert (await run(engine, GM, "gm.world.load_preset", {"preset": preset, "scene": True}))["ok"]
    c = crew(engine, content, VES, "ves")
    assert c["list"][3]["item"] == "bootleg-magnets" and c["entropy_max"] == 8
    assert (await run(engine, GM, "gm.world.load_preset", {"preset": preset}))["ok"]
    c = crew(engine, content, VES, "ves")
    assert len(c["list"]) == 3 and c["entropy_max"] == 6


# ---------------------------------------------------------------- Draw


async def test_draw_hands_over_one_from_the_group(engine, content):
    trash = {it.id for it in content.items.values() if it.shelf == "trash"}
    before = len(engine.state.inventory["tally"])
    got = set()
    for _ in range(12):
        assert (await run(engine, GM, "gm.item.draw", {"holder": "tally", "shelf": "trash"}))["ok"]
        e = engine.state.inventory["tally"][-1]
        assert e.item in trash and e.new
        got.add(e.item)
    assert len(engine.state.inventory["tally"]) == before + 12 and len(got) > 1  # the server's dice, not one favourite


# ---------------------------------------------------------------- what each viewer gets


async def test_how_the_gm_sorts_items_never_reaches_a_player(engine, content):
    await run(engine, GM, "gm.item.give", {"holder": "ves", "item": "damp-sock"})
    await run(engine, GM, "gm.chrome.install", {"char": "ves", "item": "chrome-entropy"})
    gm = project(engine.state, content, GM)
    assert [s["id"] for s in gm["shelves"]][:2] == ["kit", "letters"] and gm["shelves"][3]["draw"]
    sock = next(i for i in gm["items"] if i["id"] == "damp-sock")
    assert (sock["shelf"], sock["chrome"], sock["raises"]) == ("trash", None, None)
    assert next(e for e in gm["inventory"]["ves"] if e["item"]["id"] == "chrome-entropy")["item"]["raises"] == "entropy"
    for viewer in (VES, TOMO, TV):
        view = project(engine.state, content, viewer)
        assert "shelves" not in view and "items" not in view
        text = json.dumps(view)
        assert '"shelf"' not in text and '"raises"' not in text and "trash" not in text  # nobody learns it was Trash
    mine = project(engine.state, content, VES)["inventory"]["ves"]
    assert {"damp-sock", "chrome-entropy"} <= {e["item"]["id"] for e in mine}  # she holds both, and reads both
