"""The content against the live bible: everyone's own letter, the cut old man, and moving a saved game over."""

import json

import pytest

from conftest import place_dax
from lso.auth import Viewer
from lso.config import ROOT
from lso.content import load_content
from lso.engine import Engine
from lso.models import RULES, GameState, InvEntry, TokenState
from lso.store import Store
from lso.views import project

CREW = ("lale", "marlo", "tally", "ves", "tomo")
GM = Viewer("gm", "gm")
TALLY = Viewer("tally", "player")


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


@pytest.fixture
def engine(content, tmp_path):
    return Engine(content, Store(tmp_path / "t.db"))


def test_the_cast_matches_the_bible(content):
    assert content.npcs["fixer"].name == "Lucan Merrow" and content.npcs["fixer"].role == "The Fixer"
    assert content.npcs["scientist"].name == "Dr. Irena Vos" and content.npcs["scientist"].role == "The Analyst"
    assert {"ahti", "static", "gumshoe", "head-of-security"} <= set(content.npcs)
    assert "old-man" not in content.npcs and "old-man" not in content.codex and "invitation" not in content.items


def test_everyone_starts_with_their_own_letter(engine):
    for who in CREW:
        held = [e.item for e in engine.state.inventory[who]]
        assert f"letter-{who}" in held and sum(i.startswith("letter-") for i in held) == 1


def test_a_letter_is_only_its_holders(engine, content):
    raw = json.dumps(project(engine.state, content, TALLY))
    assert "letter-tally" in raw and "Would you, please?" in raw
    for who in CREW:
        if who != "tally":
            assert f"letter-{who}" not in raw
    assert "A slot for your patient." not in raw and "Your debts, cleared." not in raw and "Your file, destroyed." not in raw


def test_the_letter_page_holds_nobodys_terms(content):
    page = content.codex["letter"].lead
    assert "after closing" in page
    assert not any(t in page for t in ("patient", "debts", "file", "Would you"))


async def test_a_new_npcs_secrets_stay_with_the_gm(engine, content):
    state = TokenState(kind="npc", ref="static", map="event-horizon", at=(9, 9, 0)).model_dump()
    engine._commit("system", None, [("token.placed", {"token": "static", "state": state})], {})
    raw = json.dumps(project(engine.state, content, TALLY), ensure_ascii=False)
    assert content.npcs["static"].name in raw  # she's on the map
    assert content.npcs["static"].gm_note not in raw and "shark" not in raw


def test_the_session_1_presets(content):
    pitch = content.presets["session-1"]
    assert pitch.maps["event-horizon"].mood == "after"
    on_map = {t.ref for t in pitch.tokens}
    assert on_map == set(CREW) | {"fixer", "cleaner-14"}  # Dax has left, and only Unit 14 stays

    arrival = content.presets["session-1-arrival"]
    assert arrival.maps["event-horizon"].mood == "open" and "fixer" not in {t.ref for t in arrival.tokens}


def test_session_1s_four_beats_are_in_order(content):
    assert list(content.presets) == ["session-1-arrival", "session-1-day", "session-1-night", "session-1"]
    crew = lambda p: {t.map for t in p.tokens if t.kind == "crew"}
    day, night = content.presets["session-1-day"], content.presets["session-1-night"]
    assert crew(day) == {"promenade"} and day.party_map == "promenade" and day.maps["event-horizon"].mood == "open"
    assert "gumshoe" in {t.ref for t in day.tokens if t.map == "promenade"}
    assert crew(night) == {"promenade"} and night.maps["event-horizon"].mood == "after"
    assert {t.ref for t in night.tokens if t.kind == "npc"} == {"dax", "scientist", "cleaner-14"}


async def _load(engine, viewer, **args):
    ack, _ = await engine.run(viewer, None, "gm.world.load_preset", args)
    return ack


async def test_a_scene_load_keeps_what_the_crew_has_and_knows(engine, content):
    await _load(engine, GM, preset="session-1-day")
    await engine.run(GM, None, "gm.item.give", {"holder": "ves", "item": "burner-key"})
    await engine.run(GM, None, "gm.vitals.set", {"char": "ves", "hp": 1, "entropy": 5})
    await engine.run(GM, None, "gm.codex.unlock", {"entry": "dax"})
    await engine.run(GM, None, "gm.object.show", {"map": "promenade", "object": "alley", "shown": True})
    before = engine.state.model_copy(deep=True)

    assert (await _load(engine, GM, preset="session-1-night", scene=True))["ok"]
    s = engine.state
    assert s.inventory == before.inventory and s.vitals == before.vitals and s.vitals["ves"].entropy == 5
    assert s.codex == before.codex and s.codex_read == before.codex_read and s.seen == before.seen
    assert "alley" in s.maps["promenade"].shown and set(before.station) <= set(s.station)
    # and the scene itself moved
    assert s.maps["event-horizon"].mood == "after" and s.tokens["scientist"].map == "event-horizon"
    assert s.tokens["ves"].map == "promenade" and "steward" not in s.tokens


async def test_a_scene_load_ends_a_fight(engine):
    await engine.run(GM, None, "gm.fight.start", {"map": "event-horizon", "tokens": ["tomo", "fixer"]})
    assert engine.state.fights
    assert (await _load(engine, GM, preset="session-1-day", scene=True))["ok"]
    assert not engine.state.fights


async def test_a_full_load_still_resets_everything(engine):
    await engine.run(GM, None, "gm.item.give", {"holder": "ves", "item": "burner-key"})
    assert (await _load(engine, GM, preset="session-1-day"))["ok"]
    assert not any(e.item == "burner-key" for e in engine.state.inventory["ves"])


async def test_only_the_gm_loads_a_scene(engine):
    assert (await _load(engine, TALLY, preset="session-1-night", scene=True))["code"] == "forbidden"


def test_a_saved_game_moves_over_once(content, tmp_path):
    store = Store(tmp_path / "old.db")
    Engine(content, store)
    old = GameState.model_validate(store.load_snapshot()[1])
    old.rules = 4
    old.inventory["ves"] = [e for e in old.inventory["ves"] if not e.item.startswith("letter-")]
    old.inventory["ves"].append(InvEntry(uid="ves-9", item="invitation", new=True))
    old.tokens["old-man"] = TokenState(kind="npc", ref="old-man", map="deck-9", at=(1, 1, 0))
    old.codex += ["invitation", "old-man", "old-man/pause"]
    old.maps["deck-7"].shown = ["head-count", "plots"]
    store.commit("system", None, [], old.model_dump(mode="json"), {})

    e = Engine(content, store)  # a stale reference would raise here
    letter = next(x for x in e.state.inventory["ves"] if x.item == "letter-ves")
    assert letter.new and not any(x.item == "invitation" for x in e.state.inventory["ves"])
    assert "old-man" not in e.state.tokens
    assert "letter" in e.state.codex and not {"invitation", "old-man", "old-man/pause"} & set(e.state.codex)
    assert e.state.maps["deck-7"].shown == ["plots"] and e.state.rules == RULES

    assert sum(x.item == "letter-ves" for x in Engine(content, store).state.inventory["ves"]) == 1  # and only once


def test_dax_can_come_back_for_the_tests_that_need_him(engine):
    assert "dax" not in engine.state.tokens
    place_dax(engine)
    assert engine.state.tokens["dax"].map == "event-horizon"


def test_a_saved_game_keeps_its_renamed_npcs(content, tmp_path):
    store = Store(tmp_path / "old.db")
    Engine(content, store)
    old = GameState.model_validate(store.load_snapshot()[1])
    old.tokens["npc-7"] = TokenState(kind="npc", ref="frail-pilgrim", map="patience", at=(7, 7, 0.2))
    store.commit("system", None, [], old.model_dump(mode="json"), {})

    e = Engine(content, store)  # a stale reference would raise here
    t = e.state.tokens["npc-7"]
    assert t.ref == "frail-passenger" and t.map == "patience" and t.at == (7, 7, 0.2)
