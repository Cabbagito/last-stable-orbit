"""The slot machines: four seats, a pull that never pays, and a payback counted by who stands in the same 4 seconds."""

import json

import pytest

from lso import rules
from lso.auth import Viewer
from lso.commands import CommandError, handle
from lso.config import ROOT
from lso.content import load_content
from lso.engine import Engine
from lso.store import Store
from lso.views import project, referenced_assets

GM = Viewer("gm", "gm")
STAGE = Viewer("stage", "stage")
TALLY, MARLO, VES, TOMO, LALE = (Viewer(c, "player") for c in ("tally", "marlo", "ves", "tomo", "lale"))
FOUR = (TALLY, MARLO, VES, TOMO)
EH = "event-horizon"
HERE = {"map": EH, "object": "slots"}
KEY = f"{EH}/slots"


class Dice:
    """Never a near miss unless told: 99 is over the 60 in 100, and the reels stop on 1, 2, 3."""

    def __init__(self):
        self.n = 0

    def randrange(self, stop):
        if stop == 100:
            return 99
        self.n += 1
        return self.n % stop

    def randint(self, a, b):
        return a


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


@pytest.fixture
def clock():
    class C:
        t = 1000.0

        def __call__(self):
            return self.t

    return C()


@pytest.fixture
async def engine(content, tmp_path, clock):
    e = Engine(content, Store(tmp_path / "t.db"), rng=Dice(), clock=clock)
    for char in ("tally", "marlo", "ves", "tomo", "lale"):
        await ok(e, GM, "gm.item.give", {"holder": char, "item": "credits", "count": 1})
        uid = next(x.uid for x in e.state.inventory[char] if x.item == "credits")
        await ok(e, GM, "gm.item.count", {"holder": char, "uid": uid, "count": 200})
    state = e.state
    if "slots" not in state.maps[EH].shown:
        await ok(e, GM, "gm.object.show", {**HERE, "shown": True})
    # the crew is all at the bar
    for char in ("tally", "marlo", "ves", "tomo", "lale"):
        t = next((tid for tid, x in e.state.tokens.items() if x.kind == "crew" and x.ref == char), None)
        assert t and e.state.tokens[t].map == EH
    return e


async def ok(engine, viewer, kind, args=None):
    ack, _ = await engine.run(viewer, None, kind, args or {})
    assert ack["ok"], ack
    return ack


async def refused(engine, viewer, kind, args=None):
    ack, _ = await engine.run(viewer, None, kind, args or {})
    assert not ack["ok"], ack
    return ack["error"]


def view(engine, viewer):
    return project(engine.state, engine.content, viewer)


def seat(engine, viewer):
    return view(engine, viewer)["slots"]


def card(engine, viewer):
    return next(o for o in view(engine, viewer)["maps"][EH]["objects"] if o["id"] == "slots")["game"]


def credits(engine, char):
    return next(e.count for e in engine.state.inventory[char] if e.item == "credits")


async def sit_and_lose(engine, viewers, pulls=1):
    for v in viewers:
        await ok(engine, v, "slots.sit", HERE)
        for _ in range(pulls):
            await ok(engine, v, "slots.pull")


async def after_window(engine, clock):
    clock.t += engine.content.slots.window
    assert await engine.sweep(set())


# Sitting


async def test_the_card_counts_the_seats(engine):
    assert card(engine, LALE) == {"kind": "slots", "seats": 4, "taken": 0, "pull": 10, "out": False}
    await ok(engine, TALLY, "slots.sit", HERE)
    await ok(engine, MARLO, "slots.sit", HERE)
    assert card(engine, LALE)["taken"] == 2
    assert card(engine, GM)["taken"] == 2


async def test_each_gets_their_own_machine_and_a_fifth_waits(engine):
    for v in FOUR:
        await ok(engine, v, "slots.sit", HERE)
    assert [seat(engine, v)["unit"] for v in FOUR] == [1, 2, 3, 4]
    assert "taken" in await refused(engine, LALE, "slots.sit", HERE)
    assert seat(engine, LALE) is None
    await ok(engine, MARLO, "slots.stand")  # lost nothing: just gets up
    assert seat(engine, MARLO) is None
    await ok(engine, LALE, "slots.sit", HERE)
    assert seat(engine, LALE)["unit"] == 2  # the free machine


async def test_one_seat_each(engine):
    await ok(engine, TALLY, "slots.sit", HERE)
    assert "already" in await refused(engine, TALLY, "slots.sit", HERE)
    assert card(engine, GM)["taken"] == 1


async def test_only_the_crew_on_that_map_who_can_see_them_may_sit(engine):
    assert "crew" in await refused(engine, GM, "slots.sit", HERE)
    assert "crew" in await refused(engine, STAGE, "slots.sit", HERE)
    await ok(engine, GM, "gm.object.show", {**HERE, "shown": False})
    assert "no slot machines" in await refused(engine, TALLY, "slots.sit", HERE)
    await ok(engine, GM, "gm.object.show", {**HERE, "shown": True})
    assert "no slot machines" in await refused(engine, TALLY, "slots.sit", {"map": EH, "object": "mural"})
    assert "no slot machines" in await refused(engine, TALLY, "slots.sit", {"map": "patience", "object": "slots"})


async def test_being_sent_elsewhere_gives_up_the_seat(engine):
    await sit_and_lose(engine, [TALLY])
    token = next(tid for tid, x in engine.state.tokens.items() if x.kind == "crew" and x.ref == "tally")
    engine._commit("gm", None, [("token.sent", {"token": token, "map": "patience", "at": [1, 1, 0]})], {})
    assert seat(engine, TALLY) is None and card(engine, GM)["taken"] == 0


# Pulling


async def test_a_pull_costs_ten_and_never_pays(engine):
    await sit_and_lose(engine, [TALLY])
    assert credits(engine, "tally") == 190
    s = seat(engine, TALLY)
    assert s["pulls"] == 1 and s["spin"] == 1 and len(s["reels"]) == 3
    assert not (s["reels"][0] == s["reels"][1] == s["reels"][2])


@pytest.mark.parametrize("seed", range(200))
def test_no_spin_ever_lines_up(seed):
    import random

    r = random.Random(seed)
    reels, near = rules.spin_reels(r, 60)
    assert not (reels[0] == reels[1] == reels[2])
    if near:
        assert reels[:2] == [0, 0] and reels[2] in (1, 4)
    else:
        assert not (reels[0] == 0 and reels[1] == 0)


async def test_no_credits_no_pull(engine):
    await ok(engine, TALLY, "slots.sit", HERE)
    uid = next(e.uid for e in engine.state.inventory["tally"] if e.item == "credits")
    await ok(engine, GM, "gm.item.count", {"holder": "tally", "uid": uid, "count": 9})
    assert "insert credits" in await refused(engine, TALLY, "slots.pull")
    assert credits(engine, "tally") == 9


async def test_you_cant_pull_without_a_seat(engine):
    assert "aren't at a machine" in await refused(engine, TALLY, "slots.pull")


# Standing


@pytest.mark.parametrize("standing,paid", [(1, 25), (2, 55), (3, 100)])
async def test_the_payback_counts_who_stood_at_once(engine, clock, standing, paid):
    who = FOUR[:standing]
    await sit_and_lose(engine, who, pulls=5)  # each lost 50
    for v in who:
        await ok(engine, v, "slots.stand")
    assert seat(engine, who[0])["page"] == "wait"
    assert credits(engine, "tally") == 150
    await after_window(engine, clock)
    for v in who:
        s = seat(engine, v)
        assert s["page"] == "lucky" and s["payout"] == paid and s["pulls"] == 0
        assert credits(engine, v.seat) == 150 + paid


async def test_the_window_is_shared_and_closes_four_seconds_after_the_first_stand(engine, clock):
    await sit_and_lose(engine, [TALLY, MARLO])
    await ok(engine, TALLY, "slots.stand")
    assert seat(engine, TALLY)["until"] == 1004.0
    clock.t += 3
    await ok(engine, MARLO, "slots.stand")
    assert seat(engine, MARLO)["until"] == 1004.0
    assert not await engine.sweep(set())
    clock.t += 1
    assert await engine.sweep(set())
    assert seat(engine, MARLO)["payout"] == 11  # stood together: 110% of 10


async def test_standing_after_the_window_doesnt_count(engine, clock):
    await sit_and_lose(engine, [TALLY, MARLO])
    await ok(engine, TALLY, "slots.stand")
    await after_window(engine, clock)
    await ok(engine, MARLO, "slots.stand")
    await after_window(engine, clock)
    assert seat(engine, TALLY)["payout"] == 5 and seat(engine, MARLO)["payout"] == 5


async def test_sitting_back_down_cancels(engine, clock):
    await sit_and_lose(engine, [TALLY, MARLO])
    await ok(engine, TALLY, "slots.stand")
    await ok(engine, MARLO, "slots.stand")
    await ok(engine, TALLY, "slots.sit_back")
    assert seat(engine, TALLY)["page"] == "play"
    await after_window(engine, clock)
    assert seat(engine, TALLY)["page"] == "play" and credits(engine, "tally") == 190  # still down
    assert seat(engine, MARLO)["payout"] == 5  # stood alone after all


async def test_the_window_closes_when_nobody_is_left_in_it(engine, clock):
    await sit_and_lose(engine, [TALLY])
    await ok(engine, TALLY, "slots.stand")
    await ok(engine, TALLY, "slots.sit_back")
    assert engine.state.slots[KEY].until is None
    clock.t += 10
    assert not await engine.sweep(set())


async def test_payback_resets_what_you_lost(engine, clock):
    await sit_and_lose(engine, [TALLY], pulls=2)
    await ok(engine, TALLY, "slots.stand")
    await after_window(engine, clock)
    assert engine.state.slots[KEY].seats[0].lost == 0


async def test_the_free_spin_costs_nothing_loses_anyway(engine, clock):
    await sit_and_lose(engine, [TALLY])
    await ok(engine, TALLY, "slots.stand")
    await after_window(engine, clock)
    before = credits(engine, "tally")
    await ok(engine, TALLY, "slots.free")
    assert seat(engine, TALLY)["free"] is True
    await ok(engine, TALLY, "slots.pull")
    s = seat(engine, TALLY)
    assert credits(engine, "tally") == before and s["free"] is False and s["near"] is True
    assert s["reels"][:2] == [0, 0]
    await ok(engine, TALLY, "slots.stand")  # lost nothing since the payback: just gets up
    assert seat(engine, TALLY) is None


async def test_leaving(engine, clock):
    await sit_and_lose(engine, [TALLY])
    assert "stand up" in await refused(engine, TALLY, "slots.leave")
    await ok(engine, TALLY, "slots.stand")
    await after_window(engine, clock)
    await ok(engine, TALLY, "slots.leave")
    assert seat(engine, TALLY) is None and card(engine, GM)["taken"] == 0


# The flood


async def flood(engine, clock):
    await sit_and_lose(engine, FOUR, pulls=2)
    await ok(engine, MARLO, "slots.pull")
    for v in FOUR:
        await ok(engine, v, "slots.stand")
    await after_window(engine, clock)


async def test_four_at_once_is_the_flood(engine, clock):
    await flood(engine, clock)
    assert seat(engine, TALLY)["page"] == "flood" and seat(engine, TALLY)["payout"] == 200
    assert seat(engine, MARLO)["payout"] == 300  # each their own lost x 10
    assert credits(engine, "marlo") == 200 - 30 + 300
    assert card(engine, LALE)["out"] is True


async def test_the_tv_plays_it_and_only_the_tv(engine, clock):
    await flood(engine, clock)
    f = view(engine, STAGE)["stage"]["flood"]
    assert f["ends"] == f["at"] + 8 and sorted(f["paid"]) == [200, 200, 200, 300]
    assert "slots/lit-a.png" in {a for a in referenced_assets(view(engine, STAGE))}
    for v in (GM, LALE, TALLY):
        assert "flood" not in view(engine, v)["stage"]


async def test_the_flood_ends_on_out_of_service(engine, clock):
    await flood(engine, clock)
    clock.t += 8
    assert await engine.sweep(set())
    assert view(engine, STAGE)["stage"].get("flood") is None
    assert seat(engine, TALLY)["page"] == "out"
    await ok(engine, TALLY, "slots.leave")
    assert "out of service" in await refused(engine, TALLY, "slots.sit", HERE)


async def test_out_of_service_for_good_and_a_new_preset_keeps_it(engine, clock, content):
    await flood(engine, clock)
    await ok(engine, GM, "gm.world.load_preset", {"preset": content.default_preset.id})
    assert engine.state.slots[KEY].out is True and engine.state.slots[KEY].seats == []
    assert view(engine, TALLY)["slots"] is None


# The GM


async def test_the_gm_can_take_them_out_and_put_them_back(engine):
    await ok(engine, GM, "gm.slots.service", {**HERE, "out": True})
    assert card(engine, TALLY)["out"] is True
    t = next(o for o in view(engine, TALLY)["maps"][EH]["objects"] if o["id"] == "slots")
    assert t["text"] == "Four white machines in a nook, dark and quiet."
    assert "out of service" in await refused(engine, TALLY, "slots.sit", HERE)
    await ok(engine, GM, "gm.slots.service", {**HERE, "out": False})
    await ok(engine, TALLY, "slots.sit", HERE)


async def test_going_out_of_service_turns_the_screens_off_and_closes_the_window(engine, clock):
    await sit_and_lose(engine, [TALLY])
    await ok(engine, TALLY, "slots.stand")
    await ok(engine, GM, "gm.slots.service", {**HERE, "out": True})
    assert seat(engine, TALLY)["page"] == "out"
    clock.t += 10
    assert not await engine.sweep(set())
    await ok(engine, TALLY, "slots.leave")
    assert card(engine, GM)["taken"] == 0


async def test_only_the_gm_runs_the_machines(engine, content):
    with pytest.raises(CommandError) as e:
        handle(TALLY, engine.state, content, "gm.slots.service", {**HERE, "out": True})
    assert e.value.code == "forbidden"


# Going away


async def test_someone_gone_for_two_minutes_loses_their_machine(engine):
    await sit_and_lose(engine, [TALLY, MARLO])
    assert await engine.sweep(set(), seated={"marlo"})
    assert seat(engine, TALLY) is None and seat(engine, MARLO)["unit"] == 2


async def test_nobody_loses_a_machine_to_a_short_nap(engine):
    await sit_and_lose(engine, [TALLY])
    assert not await engine.sweep(set(), seated={"tally"})
    assert not await engine.sweep(set(), seated=None)  # just restarted: nobody has reconnected yet
    assert seat(engine, TALLY)["unit"] == 1


async def test_a_reload_finds_you_still_sitting(engine, content, tmp_path, clock):
    await sit_and_lose(engine, [TALLY], pulls=3)
    again = Engine(content, engine.store, rng=Dice(), clock=clock)
    assert project(again.state, content, TALLY)["slots"]["pulls"] == 3


# Leaks


async def test_nobody_else_hears_how_it_is_going(engine, clock):
    await sit_and_lose(engine, [TALLY], pulls=3)
    await ok(engine, TALLY, "slots.stand")
    secret = {"lost", "pulls", "reels", "until", "payout"}
    for v in (GM, STAGE, LALE, MARLO):
        vw = view(engine, v)
        assert vw["slots"] is None
        text = json.dumps(vw)
        assert not any(f'"{k}"' in text for k in secret), [k for k in secret if f'"{k}"' in text]
        if v is not GM:
            assert "tally" not in json.dumps(vw["maps"][EH]["objects"])


async def test_what_you_lost_never_leaves_the_server(engine):
    await sit_and_lose(engine, [TALLY], pulls=3)
    assert "lost" not in seat(engine, TALLY)


async def test_only_the_auditor_gets_the_real_numbers(engine):
    for v in (TALLY, MARLO):
        await ok(engine, v, "slots.sit", HERE)
    assert seat(engine, TALLY)["audit"] == {"paid_back": [50, 110, 200, 1000], "window": 4.0}
    assert seat(engine, MARLO)["audit"] is None
    assert "1000" not in json.dumps(seat(engine, MARLO)["art"])


async def test_the_art_is_only_served_to_who_needs_it(engine):
    assert "slots/reel.png" not in referenced_assets(view(engine, TALLY))
    await ok(engine, TALLY, "slots.sit", HERE)
    assert "slots/reel.png" in referenced_assets(view(engine, TALLY))
