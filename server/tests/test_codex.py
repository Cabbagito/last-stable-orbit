"""M6: the Codex. The GM unlocks entries, and blocks inside them, for the whole crew. A locked entry or block never
reaches a player or the TV, not even its id; See also and the Scene's Codex buttons skip it; "new" is per player;
and no page lists what anyone carries."""

import json

import pytest

from lso.auth import Viewer
from lso.config import ROOT
from conftest import place_dax
from lso.content import load_content
from lso.engine import Engine
from lso.models import RULES, GameState
from lso.store import Store
from lso.views import project, referenced_assets

GM = Viewer("gm", "gm")
STAGE = Viewer("stage", "stage")
TALLY = Viewer("tally", "player")
VES = Viewer("ves", "player")
DAY_ONE = {"lale", "marlo", "tally", "ves", "tomo", "rule-roll", "rule-stats", "rule-skills", "rule-entropy", "rule-burns",
           "rule-fights", "rule-health", "patience", "promenade", "event-horizon", "ergo", "isco", "hole", "queue", "music-credit"}


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


@pytest.fixture
def engine(content, tmp_path):
    return Engine(content, Store(tmp_path / "t.db"), clock=lambda: 1000.0)


async def run(engine, viewer, kind, args):
    ack, _ = await engine.run(viewer, None, kind, args)
    return ack


def codex(engine, viewer):
    return project(engine.state, engine.content, viewer)["codex"]


def entry(engine, viewer, eid):
    return next((e for e in codex(engine, viewer)["entries"] if e["id"] == eid), None)


def test_the_codex_has_its_five_sections_and_every_entry_resolves(content):
    assert [s.id for s in content.codex_sections] == ["chars", "items", "world", "lore", "rules"]
    assert len(content.codex) >= 40
    assert content.missing_assets == []
    # every crew member has a page, and every place on the map
    assert {e.crew for e in content.codex.values() if e.crew} == set(content.characters)
    assert {m for m in content.maps if not m.startswith("deck-")} | {"executive"} <= set(content.codex)  # the decks share a page


def test_session_one_opens_the_crew_how_to_play_and_day_one(engine):
    c = codex(engine, TALLY)
    assert {e["id"] for e in c["entries"]} == DAY_ONE
    secs = {s["id"]: s for s in c["sections"]}
    assert secs["chars"]["count"] == 5 and secs["rules"]["count"] == 7 and secs["items"]["count"] == 0
    assert all(e["new"] for e in c["entries"])


async def test_locked_entries_never_reach_a_player_or_the_tv(engine, content):
    locked = [e for e in content.codex.values() if e.id not in DAY_ONE]
    for viewer in (TALLY, VES):
        # (an item's words also reach its holder as its tooltip, and an object's as its inspect text once it's shown
        # on the map: those are their own channels, with their own tests)
        sent = json.dumps(project(engine.state, content, viewer)["codex"])
        for e in locked:
            assert f'"{e.id}"' not in sent, e.id
            assert not (len(e.lead) > 40 and e.lead in sent), e.id
            assert all(b.text not in sent for b in e.blocks), e.id
    assert project(engine.state, content, STAGE)["codex"] is None
    # the GM sees all of them, marked
    g = codex(engine, GM)
    assert len(g["entries"]) == len(content.codex)
    assert {e["id"] for e in g["entries"] if e["unlocked"]} == DAY_ONE


async def test_see_also_and_the_scene_skip_a_locked_page(engine):
    eh = entry(engine, TALLY, "event-horizon")
    assert [s["id"] for s in eh["see"]] == []  # Dax, the table, the slots and the mural are all still locked
    place_dax(engine)
    v = project(engine.state, engine.content, TALLY)
    assert v["tokens"]["dax"]["codex"] is None
    assert (await run(engine, GM, "gm.codex.unlock", {"entry": "dax"}))["ok"]
    assert [s["id"] for s in entry(engine, TALLY, "event-horizon")["see"]] == ["dax"]
    assert project(engine.state, engine.content, TALLY)["tokens"]["dax"]["codex"] == "dax"
    # the crew's own tokens link to their pages
    assert project(engine.state, engine.content, TALLY)["tokens"]["ves"]["codex"] == "ves"


async def test_a_page_grows_block_by_block(engine):
    """Ilija: the saint first. The man and the truth stay hidden, words and all, until the GM opens them."""
    truth = engine.content.codex["ilija"].blocks[-1].text
    assert (await run(engine, GM, "gm.codex.unlock", {"entry": "ilija"}))["ok"]
    il = entry(engine, TALLY, "ilija")
    assert [b["id"] for b in il["blocks"]] == []
    assert truth not in json.dumps(project(engine.state, engine.content, TALLY))
    assert (await run(engine, TALLY, "codex.read", {"entry": "ilija"}))["ok"]
    assert not entry(engine, TALLY, "ilija")["new"]
    assert (await run(engine, GM, "gm.codex.unlock", {"entry": "ilija", "block": "truth"}))["ok"]
    il = entry(engine, TALLY, "ilija")
    assert [(b["id"], b["new"]) for b in il["blocks"]] == [("truth", True)] and il["new"]
    assert il["blocks"][0]["text"] == truth
    # the GM sees every block, and which are open
    g = entry(engine, GM, "ilija")
    assert [(b["id"], b["unlocked"]) for b in g["blocks"]] == [("man", False), ("truth", True)]
    # a block that isn't locked can't be "unlocked"
    assert not (await run(engine, GM, "gm.codex.unlock", {"entry": "ves", "block": "history"}))["ok"]


async def test_new_is_per_player(engine):
    assert (await run(engine, TALLY, "codex.read", {"entry": "ergo"}))["ok"]
    assert not entry(engine, TALLY, "ergo")["new"] and entry(engine, VES, "ergo")["new"]
    sec = next(s for s in codex(engine, TALLY)["sections"] if s["id"] == "lore")
    assert (sec["count"], sec["new"]) == (5, 4)
    # reading again changes nothing, and nobody reads a page they can't see
    _, changed = await engine.run(TALLY, None, "codex.read", {"entry": "ergo"})
    assert not changed
    assert not (await run(engine, TALLY, "codex.read", {"entry": "scientist"}))["ok"]
    assert not (await run(engine, GM, "codex.read", {"entry": "ergo"}))["ok"]


async def test_only_the_gm_unlocks(engine):
    ack = await run(engine, TALLY, "gm.codex.unlock", {"entry": "scientist"})
    assert not ack["ok"] and ack["code"] == "forbidden"
    assert not (await run(engine, GM, "gm.codex.unlock", {"entry": "nobody"}))["ok"]
    assert (await run(engine, GM, "gm.codex.unlock", {"entry": "ergo", "unlocked": False}))["ok"]
    assert entry(engine, TALLY, "ergo") is None


async def test_no_page_lists_what_anyone_carries(engine, content):
    """Players don't know each other's items. Unlock every page and look: no crew page lists a pocket, and no item
    page says who holds it."""
    for e in content.codex:
        await run(engine, GM, "gm.codex.unlock", {"entry": e})
    assert (await run(engine, GM, "gm.item.give", {"holder": "ves", "item": "access-chit"}))["ok"]
    for viewer in (TALLY, VES):
        c = codex(engine, viewer)
        ves = next(e for e in c["entries"] if e["id"] == "ves")
        page = json.dumps(ves)
        for it in content.items.values():
            assert it.name not in page, it.name
        chit = json.dumps(next(e for e in c["entries"] if e["id"] == "access-chit"))
        assert "Ves" not in chit and "ves" not in chit.replace("vesna", "")
        assert "inventory" not in json.dumps(c)


def test_a_crew_page_shows_the_sheet(engine):
    t = entry(engine, VES, "tomo")
    assert t["name"] == "Tomo Dragan" and t["role"] == "The Bruiser"
    assert t["crew"]["health"] == 9 and t["crew"]["stats"]["body"] == 20
    assert [k["name"] for k in t["crew"]["skills"]] == ["Please don't make me", "Have you eaten?", "Steel forearm"]
    assert t["crew"]["burn"]["name"] == "Not them" and t["crew"]["skills"][0]["downside"]


def test_a_locked_pages_art_isnt_fetchable(engine):
    files = referenced_assets(project(engine.state, engine.content, TALLY))
    assert "codex/isco-sigil.gif" in files and "codex/ergo.png" in files
    assert "codex/mural-ilija.png" not in files and "codex/mural-both.png" not in files


def test_an_old_save_gets_the_day_one_codex(content, tmp_path):
    store = Store(tmp_path / "old.db")
    Engine(content, store)
    old = GameState.model_validate(store.load_snapshot()[1])
    old.rules, old.codex = 1, []
    store.commit("system", None, [], old.model_dump(mode="json"), {})
    e = Engine(content, store)
    assert set(e.state.codex) == DAY_ONE and e.state.rules == RULES
    # health isn't touched again: rules 1 already did that
    assert e.state.vitals == old.vitals


def test_a_saved_game_gets_the_music_credit_page(content, tmp_path):
    store = Store(tmp_path / "old.db")
    Engine(content, store)
    old = GameState.model_validate(store.load_snapshot()[1])
    old.rules, old.codex = 5, ["hole"]
    store.commit("system", None, [], old.model_dump(mode="json"), {})
    e = Engine(content, store)
    assert set(e.state.codex) == {"hole", "music-credit"} and e.state.rules == RULES


async def test_a_preset_brings_its_own_codex(engine):
    assert (await run(engine, GM, "gm.world.load_preset", {"preset": "session-1-night"}))["ok"]
    ids = {e["id"] for e in codex(engine, TALLY)["entries"]}
    assert {"dax", "fixer", "mural", "ilija"} <= ids and "scientist" not in ids


# ---------- private briefs ----------
# Each crew page carries one private block: its character's brief. Like pockets, it goes to that player and the GM
# and to nobody else. To catch a leak anywhere in a feed (not just on the page), each brief here gets text no other
# part of the game has.

CREW = ["lale", "marlo", "tally", "ves", "tomo"]


def secret(char):
    return f"ONLY-{char.upper()}-KNOWS-7f3a"


@pytest.fixture
def briefed(tmp_path):
    from lso.models import CodexPart

    c = load_content(ROOT / "content", ROOT / "assets")  # a fresh copy, so the module's content stays as shipped
    for k, e in list(c.codex.items()):
        if e.crew:
            c.codex[k] = e.model_copy(update={"private": [CodexPart(h="Only you know.", text=secret(e.crew))]})
    return Engine(c, Store(tmp_path / "b.db"), clock=lambda: 1000.0)


def test_every_crew_page_has_a_brief_and_nothing_else_does(content):
    assert {e.crew for e in content.codex.values() if e.private} == set(content.characters)
    assert all(e.crew for e in content.codex.values() if e.private)


def test_a_player_never_receives_another_characters_private_block(briefed):
    for me in CREW:
        viewer = Viewer(me, "player")
        feed = project(briefed.state, briefed.content, viewer)
        whole = json.dumps(feed)
        assert secret(me) in whole
        for other in CREW:
            if other != me:
                assert secret(other) not in whole, f"{me} received {other}'s brief"
        for e in feed["codex"]["entries"]:
            if e["crew"] and e["crew"]["id"] != me:
                assert e["private"] is None  # not even a sign that there is one
        mine = next(e for e in feed["codex"]["entries"] if e["crew"] and e["crew"]["id"] == me)
        assert mine["private"]["parts"] == [{"h": "Only you know.", "text": secret(me)}]


def test_the_tv_gets_no_brief_and_the_gm_gets_all_five(briefed):
    tv = json.dumps(project(briefed.state, briefed.content, STAGE))
    assert not any(secret(c) in tv for c in CREW)
    gm = project(briefed.state, briefed.content, GM)
    whole = json.dumps(gm)
    assert all(secret(c) in whole for c in CREW)
    lale = next(e for e in gm["codex"]["entries"] if e["id"] == "lale")
    assert lale["private"]["who"] == "Lale"


async def test_a_players_own_page_is_always_open_to_them(briefed):
    briefed.state.codex = [k for k in briefed.state.codex if k not in CREW]  # the GM locked every crew page
    ids = {e["id"] for e in codex(briefed, TALLY)["entries"]}
    assert "tally" in ids and not ids & {"lale", "marlo", "ves", "tomo"}
    assert secret("tally") in json.dumps(project(briefed.state, briefed.content, TALLY))
    assert (await run(briefed, TALLY, "codex.read", {"entry": "tally"}))["ok"]
    assert not (await run(briefed, TALLY, "codex.read", {"entry": "ves"}))["ok"]


async def test_a_held_player_can_read_their_page_and_still_do_nothing_else(briefed):
    from lso.commands import CommandError, handle

    await run(briefed, GM, "gm.opening.set", {"on": True})
    assert briefed.state.stage.opening
    assert (await run(briefed, TALLY, "codex.read", {"entry": "tally"}))["ok"]
    with pytest.raises(CommandError) as e:
        handle(TALLY, briefed.state, briefed.content, "burn.use", {})
    assert e.value.code == "forbidden"
    assert secret("tally") in json.dumps(project(briefed.state, briefed.content, TALLY))
