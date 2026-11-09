"""Overviews (the GM tab's Events): the GM sends a little game, like the Satisfaction Report, to some of the crew.

It opens on those players' screens only. The answers and the verdict stay there: nothing comes back to the GM, and
the other players and the TV never hear of it.
"""

import json

import pytest

from lso.auth import Viewer
from lso.commands import CommandError, handle
from lso.config import ROOT
from lso.content import load_content
from lso.engine import Engine
from lso.store import Store
from lso.views import project, referenced_assets

GM = Viewer("gm", "gm")
STAGE = Viewer("stage", "stage")
MARLO = Viewer("marlo", "player")
TALLY = Viewer("tally", "player")
VES = Viewer("ves", "player")
DROID = "/assets/overviews/service-droid.png"
DROID_FILE = "overviews/service-droid.png"


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


@pytest.fixture
def engine(content, tmp_path):
    return Engine(content, Store(tmp_path / "t.db"))


async def ok(engine, viewer, kind, args):
    ack, _ = await engine.run(viewer, None, kind, args)
    assert ack["ok"], ack
    return ack


def view(engine, viewer):
    return project(engine.state, engine.content, viewer)


async def test_it_opens_only_on_the_screens_it_was_sent_to(engine):
    await ok(engine, GM, "gm.overview.send", {"overview": "satisfaction", "chars": ["marlo", "tally"]})
    for who in (MARLO, TALLY):
        o = view(engine, who)["overview"]
        assert o["kind"] == "satisfaction" and o["name"] == "Satisfaction Report"
        assert o["device"] == DROID and o["survey"]["limit"] == 7
    assert view(engine, MARLO)["overview"]["id"] == view(engine, TALLY)["overview"]["id"]  # one sending


async def test_nobody_else_hears_of_it(engine):
    await ok(engine, GM, "gm.overview.send", {"overview": "satisfaction", "chars": ["marlo"]})
    for who in (VES, TALLY, STAGE):
        v = view(engine, who)
        assert v["overview"] is None and "overviews" not in v
        assert "Satisfaction" not in str(v) and DROID_FILE not in referenced_assets(v)
    assert DROID_FILE in referenced_assets(view(engine, MARLO))


async def test_the_gm_sees_what_can_be_sent_and_whose_screen_has_one_open(engine):
    v = view(engine, GM)
    assert v["overview"] is None
    assert v["overviews"] == {
        "games": [
            {"id": "satisfaction", "name": "Satisfaction Report"},
            {"id": "satisfaction-new", "name": "Satisfaction Report, new droid"},
            {"id": "golf", "name": "Mini-golf"},
        ],
        "open": {},
    }
    await ok(engine, GM, "gm.overview.send", {"overview": "satisfaction", "chars": ["ves"]})
    assert list(view(engine, GM)["overviews"]["open"]) == ["ves"]


async def test_the_player_closes_it_and_no_answer_is_logged(engine):
    await ok(engine, GM, "gm.overview.send", {"overview": "satisfaction", "chars": ["marlo"]})
    oid = view(engine, MARLO)["overview"]["id"]
    assert handle(MARLO, engine.state, engine.content, "overview.close", {"id": "o-older"}) == []  # a stale close
    assert handle(TALLY, engine.state, engine.content, "overview.close", {"id": oid}) == []  # not hers to close
    await ok(engine, MARLO, "overview.close", {"id": oid, "verdict": "sent", "stars": 1})
    assert view(engine, MARLO)["overview"] is None and view(engine, GM)["overviews"]["open"] == {}
    logged = [e for e in engine.store.events() if e[1] == "overview.closed"]
    assert [json.loads(e[2]) for e in logged] == [{"char": "marlo"}]  # nothing they answered


async def test_sending_again_starts_it_fresh(engine):
    await ok(engine, GM, "gm.overview.send", {"overview": "satisfaction", "chars": ["marlo"]})
    first = view(engine, MARLO)["overview"]["id"]
    await ok(engine, GM, "gm.overview.send", {"overview": "satisfaction", "chars": ["marlo"]})
    assert view(engine, MARLO)["overview"]["id"] != first


async def test_the_gm_takes_one_back(engine):
    await ok(engine, GM, "gm.overview.send", {"overview": "satisfaction", "chars": ["marlo", "ves"]})
    await ok(engine, GM, "gm.overview.recall", {"char": "marlo"})
    assert view(engine, MARLO)["overview"] is None and view(engine, VES)["overview"] is not None
    assert handle(GM, engine.state, engine.content, "gm.overview.recall", {"char": "marlo"}) == []


@pytest.mark.parametrize(
    "args",
    [{"overview": "slots", "chars": ["marlo"]}, {"overview": "satisfaction", "chars": []},
     {"overview": "satisfaction", "chars": ["dax"]}, {"overview": "satisfaction"}],
)
def test_bad_sends_are_refused(engine, content, args):
    with pytest.raises(CommandError) as e:
        handle(GM, engine.state, content, "gm.overview.send", args)
    assert e.value.code == "invalid"


@pytest.mark.parametrize("who", [MARLO, STAGE])
def test_only_the_gm_sends_one(engine, content, who):
    with pytest.raises(CommandError):
        handle(who, engine.state, content, "gm.overview.send", {"overview": "satisfaction", "chars": ["marlo"]})


async def test_it_stays_open_through_a_preset(engine, content):
    await ok(engine, GM, "gm.overview.send", {"overview": "satisfaction", "chars": ["marlo"]})
    await ok(engine, GM, "gm.world.load_preset", {"preset": content.default_preset.id})
    assert view(engine, MARLO)["overview"] is not None


def test_a_survey_can_only_be_walked_away_from_with_a_page_for_it(content):
    from lso.models import Overview

    raw = content.overviews["satisfaction"].model_dump()
    raw["survey"]["later"] = None
    with pytest.raises(ValueError):
        Overview.model_validate(raw)


async def test_mini_golf_opens_only_on_the_screen_it_was_sent_to(engine):
    await ok(engine, GM, "gm.overview.send", {"overview": "golf", "chars": ["tally"]})
    o = view(engine, TALLY)["overview"]
    assert o["kind"] == "golf" and o["golf"]["well"] == "gentle" and o["survey"] is None and o["device"] is None
    for who in (MARLO, VES, STAGE):
        v = view(engine, who)
        assert v["overview"] is None and "THE BOARD'S GREEN" not in str(v)
    assert "THE BOARD'S GREEN" not in str(view(engine, GM))  # just its name, and whose screen it's on
    assert view(engine, GM)["overviews"]["open"]["tally"]["kind"] == "golf"


async def test_nothing_about_the_putt_comes_back(engine):
    await ok(engine, GM, "gm.overview.send", {"overview": "golf", "chars": ["ves"]})
    oid = view(engine, VES)["overview"]["id"]
    await ok(engine, VES, "overview.close", {"id": oid, "result": "in"})
    logged = [e for e in engine.store.events() if e[1] == "overview.closed"]
    assert [json.loads(e[2]) for e in logged] == [{"char": "ves"}]


def test_an_overview_is_a_survey_or_a_green_not_both(content):
    from lso.models import Overview

    survey = content.overviews["satisfaction"].model_dump()
    green = content.overviews["golf"].model_dump()
    with pytest.raises(ValueError):
        Overview.model_validate({**survey, "golf": green["golf"]})
    with pytest.raises(ValueError):
        Overview.model_validate({**green, "golf": None})
    with pytest.raises(ValueError):
        Overview.model_validate({**survey, "device": None})


def test_the_droid_reaches_only_whoever_has_it_open(client, seat):
    gm, marlo, ves = seat("gm"), seat("marlo"), seat("ves")
    get = lambda who: client.get(DROID, headers=who).status_code  # noqa: E731
    assert get(marlo) == 404 and get(gm) == 200
    with client.websocket_connect("/ws", headers=gm) as g:
        while g.receive_json()["t"] != "view":
            pass
        g.send_json({"t": "intent", "id": "s", "type": "gm.overview.send", "args": {"overview": "satisfaction", "chars": ["marlo"]}})
        while (f := g.receive_json())["t"] != "ack":
            pass
        assert f["ok"], f
    assert get(marlo) == 200 and get(ves) == 404


async def test_the_new_droid_asks_the_same_questions_without_the_burns(engine):
    old, new = engine.content.overviews["satisfaction"], engine.content.overviews["satisfaction-new"]
    assert old.burns and not new.burns and old.survey == new.survey and old.device == new.device
    await ok(engine, GM, "gm.overview.send", {"overview": "satisfaction-new", "chars": ["marlo"]})
    assert view(engine, MARLO)["overview"]["kind"] == "satisfaction-new"
