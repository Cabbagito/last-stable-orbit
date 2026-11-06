"""The roll: dice rules, roll intents, who sees what and when, and the sweeper."""

import json

import pytest
from pydantic import ValidationError

from lso import rules
from lso.auth import Viewer
from lso.commands import sweep
from lso.config import ROOT
from lso.content import load_content
from lso.engine import Engine
from lso.models import DIE_SIDES, STATS, GameState, Npc
from lso.state import KEEP_CLOSED_ROLLS, apply
from lso.store import Store
from lso.views import project

GM = Viewer("gm", "gm")
VES = Viewer("ves", "player")  # body d4, reflex d20, tech d10, intel d8, cool d12, empathy d6; 5 entries
MARLO = Viewer("marlo", "player")


class Dice:
    """Scripted randomness: randint hands out the next die, randrange always picks 0."""

    def __init__(self, *rolls: int):
        self.rolls = list(rolls)

    def push(self, *rolls: int) -> None:
        self.rolls += rolls

    def randint(self, a: int, b: int) -> int:
        v = self.rolls.pop(0)
        assert a <= v <= b, f"scripted {v} isn't on a d{b}"
        return v

    def randrange(self, stop: int) -> int:
        return 0


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self) -> float:
        return self.t


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


@pytest.fixture
def dice():
    return Dice()


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def engine(content, tmp_path, dice, clock):
    return Engine(content, Store(tmp_path / "t.db"), rng=dice, clock=clock)


async def run(engine, viewer, kind, args):
    ack, _ = await engine.run(viewer, None, kind, args)
    return ack


def roll(engine, roll_id):
    return next(r for r in engine.state.rolls if r.id == roll_id)


def latest(engine):
    return engine.state.rolls[-1]


def their(view, char):
    return next(r for r in view["rolls"] if r["char"] == char)


# ---------------------------------------------------------------- the rules


def test_skill_steps_the_die_up():
    assert [rules.effective_die(d, True) for d in (4, 6, 8, 10, 12)] == [(6, 0), (8, 0), (10, 0), (12, 0), (20, 0)]
    assert rules.effective_die(20, True) == (20, 2)  # a d20 can't step up: +2 instead
    assert rules.effective_die(10, False) == (10, 0)
    with pytest.raises(ValueError):
        rules.effective_die(7, False)


def test_dice_explode_and_stop_at_six():
    assert rules.roll_dice(10, Dice(7)) == [7]
    assert rules.roll_dice(6, Dice(6, 6, 2)) == [6, 6, 2]
    assert rules.roll_dice(4, Dice(4, 4, 4, 4, 4, 4, 4)) == [4] * 6  # the seventh die is never rolled


def test_natural_1_is_only_the_first_die():
    assert rules.is_nat1([1])
    assert not rules.is_nat1([6, 1])  # a 1 after an explosion just adds 1
    assert not rules.is_nat1([2])


def test_push_rules():
    assert rules.push_gain([7]) == 1 and rules.push_gain([10, 3]) == 2
    assert rules.push_refusal([7], 0, 1) is None
    assert rules.push_refusal([1], 0, 6) == "a natural 1 can't be pushed"
    assert rules.push_refusal([7], 2, 6) == "a roll can be pushed at most 2 times"
    assert rules.push_refusal([7], 0, 0) == "no Entropy left"
    assert rules.total([10, 3], 2, 4) == 19


def test_insults_come_from_the_stat_or_any(content):
    assert rules.pick_insult("tech", content.insults, Dice()) == content.insults["tech"][0]
    pool = content.insults["body"] * 2 + content.insults["any"]
    assert rules.pick_insult("body", {"body": ["A"], "any": ["B"]}, Dice()) == "A"
    assert len(pool) == 12
    assert rules.pick_insult("cool", {}, Dice()) == "DUMBASS."
    assert rules.pick_insult(None, {"body": ["A"], "any": ["B"]}, Dice()) == "B"  # just a die: only the "any" lines


# ---------------------------------------------------------------- player rolls


async def test_player_rolls_their_own_stat(engine, dice):
    dice.push(7)
    assert (await run(engine, VES, "roll.start", {"stat": "tech"}))["ok"]
    r = latest(engine)
    assert (r.by, r.char, r.stat, r.sides, r.bonus, r.dice, r.shown, r.open) == ("ves", "ves", "tech", 10, 0, [7], 0, True)
    assert r.entry is None and r.insult is None and r.handle == "ves"

    dice.push(11)
    await run(engine, VES, "roll.start", {"stat": "tech", "entry": 0})  # Been in worse vents: d10 -> d12
    r = latest(engine)
    assert r.sides == 12 and r.entry == "Been in worse vents"

    dice.push(15)
    await run(engine, VES, "roll.start", {"stat": "reflex", "entry": 1})  # a d20 with a skill: +2
    assert (latest(engine).sides, latest(engine).bonus) == (20, 2)


async def test_bad_roll_starts(engine):
    for args in ({"stat": "luck"}, {}, {"stat": "tech", "entry": 99}, {"stat": "tech", "entry": True}, {"stat": "tech", "entry": "0"}):
        assert (await run(engine, VES, "roll.start", args))["code"] == "invalid", args
    assert (await run(engine, GM, "roll.start", {"stat": "tech"}))["code"] == "invalid"
    assert engine.state.rolls == []


async def test_a_new_roll_closes_your_last(engine, dice):
    dice.push(3, 2)
    await run(engine, VES, "roll.start", {"stat": "body"})
    first = latest(engine).id
    await run(engine, VES, "roll.start", {"stat": "body"})
    assert not roll(engine, first).open and latest(engine).open
    assert [r.open for r in engine.state.rolls] == [False, True]


async def test_reveal_push_close(engine, dice):
    dice.push(10, 3)  # tech d10 explodes: 10 + 3
    await run(engine, VES, "roll.start", {"stat": "tech"})
    rid = latest(engine).id
    assert (await run(engine, MARLO, "roll.reveal", {"roll": rid, "shown": 1}))["code"] == "forbidden"

    ack, changed = await engine.run(VES, None, "roll.reveal", {"roll": rid, "shown": 1})
    assert ack["ok"] and changed and roll(engine, rid).shown == 1
    _, changed = await engine.run(VES, None, "roll.reveal", {"roll": rid, "shown": 0})  # never goes back
    assert not changed and roll(engine, rid).shown == 1

    assert engine.state.vitals["ves"].entropy == 2
    assert (await run(engine, MARLO, "roll.push", {"roll": rid}))["code"] == "forbidden"
    assert (await run(engine, GM, "roll.push", {"roll": rid}))["code"] == "forbidden"  # players spend their own
    assert (await run(engine, VES, "roll.push", {"roll": rid}))["ok"]
    r = roll(engine, rid)
    assert (r.pushes, r.pushed, r.shown) == (1, 2, 2)  # exploded: +2, and pushing shows the dice
    assert engine.state.vitals["ves"].entropy == 1 and engine.state.vitals["ves"].hp == 4
    assert (await run(engine, VES, "roll.push", {"roll": rid}))["ok"]
    assert roll(engine, rid).pushed == 4 and engine.state.vitals["ves"].entropy == 0
    ack = await run(engine, VES, "roll.push", {"roll": rid})
    assert ack["code"] == "invalid" and "at most 2" in ack["error"]

    assert (await run(engine, MARLO, "roll.close", {"roll": rid}))["code"] == "forbidden"
    assert (await run(engine, VES, "roll.close", {"roll": rid}))["ok"]
    assert not roll(engine, rid).open
    assert (await run(engine, VES, "roll.push", {"roll": rid}))["code"] == "invalid"


async def test_push_needs_entropy(engine, dice):
    await run(engine, GM, "gm.vitals.set", {"char": "ves", "entropy": 0})
    dice.push(5)
    await run(engine, VES, "roll.start", {"stat": "empathy"})
    ack = await run(engine, VES, "roll.push", {"roll": latest(engine).id})
    assert ack["code"] == "invalid" and ack["error"] == "no Entropy left"


async def test_natural_1_cracks_and_cannot_be_pushed(engine, dice, content):
    dice.push(1)
    await run(engine, VES, "roll.start", {"stat": "tech"})
    r = latest(engine)
    assert r.insult in content.insults["tech"] + content.insults["any"]
    ack = await run(engine, VES, "roll.push", {"roll": r.id})
    assert ack["code"] == "invalid" and "natural 1" in ack["error"]
    assert engine.state.vitals["ves"].entropy == 2  # and nothing awards Entropy by itself
    assert (await run(engine, VES, "roll.close", {"roll": r.id}))["ok"]


async def test_closing_mid_roll_reveals_it(engine, dice):
    dice.push(6, 6, 2)
    await run(engine, VES, "roll.start", {"stat": "empathy"})
    rid = latest(engine).id
    await run(engine, VES, "roll.close", {"roll": rid})
    assert roll(engine, rid).shown == 3
    assert their(project(engine.state, engine.content, MARLO), "ves")["value"] == 14


async def test_gm_can_close_any_roll(engine, dice):
    dice.push(2)
    await run(engine, VES, "roll.start", {"stat": "cool"})
    assert (await run(engine, GM, "roll.close", {"roll": latest(engine).id}))["ok"]
    assert not latest(engine).open


# ---------------------------------------------------------------- GM rolls


def test_every_npc_has_a_sheet(content):
    for n in content.npcs.values():
        assert list(n.stats) == list(STATS) and set(n.stats.values()) <= set(DIE_SIDES), n.id
    base = {"id": "x", "name": "X", "portrait": "portraits/dax.gif"}
    six = dict.fromkeys(STATS, 6)
    for bad in ({}, {**six, "body": 7}, {k: 6 for k in STATS[:5]}, {**six, "luck": 6}):
        with pytest.raises(ValidationError):
            Npc.model_validate({**base, "stats": bad})
    with pytest.raises(ValidationError):
        Npc.model_validate(base)  # stats are required


async def test_gm_rolls_for_npcs(engine, dice):
    dice.push(9)
    assert (await run(engine, GM, "gm.roll.start", {"token": "dax", "stat": "cool"}))["ok"]
    r = latest(engine)
    assert (r.by, r.token, r.char, r.handle, r.sides, r.hidden, r.bonus) == ("gm", "dax", None, "dax", 20, False, 0)  # Dax's Cool is a d20
    dice.push(2)
    await run(engine, GM, "gm.roll.start", {"token": "dax", "stat": "reflex"})
    assert latest(engine).sides == 6  # and his Reflex a d6

    dice.push(3)
    await run(engine, GM, "gm.roll.start", {"token": None, "sides": 20})
    r = latest(engine)
    assert r.god and not r.hidden and r.stat is None and r.sides == 20  # just a die: no stat, and always God
    assert not engine.state.rolls[0].open  # the GM has one roll open at a time too

    await run(engine, GM, "gm.token.hide", {"token": "cleaner-14", "hidden": True})
    ack = await run(engine, GM, "gm.roll.start", {"token": "cleaner-14", "stat": "body"})
    assert ack["code"] == "invalid" and "hidden" in ack["error"]
    dice.push(4)
    assert (await run(engine, GM, "gm.roll.start", {"token": "cleaner-14", "stat": "body", "mode": "someone"}))["ok"]
    assert latest(engine).sides == 6

    for bad in ({"token": "ves", "stat": "body"}, {"token": "nobody", "stat": "body"}, {"token": "dax", "stat": "luck"},
                {"token": "dax", "sides": 20, "stat": "body"},  # an NPC's die is on its sheet, not picked
                {"token": None, "sides": 7}, {"token": None}, {"token": "dax"},
                {"token": "dax", "stat": "body", "mode": "loud"},
                {"token": "dax", "stat": "body", "mode": "someone"},  # players can see Dax
                {"token": "cleaner-14", "stat": "body", "mode": "hidden"},  # would show the face of an NPC nobody can see
                {"token": None, "sides": 20, "mode": "public"}, {"token": None, "sides": 20, "mode": "hidden"}):
        assert (await run(engine, GM, "gm.roll.start", bad))["code"] == "invalid", bad
    assert (await run(engine, VES, "gm.roll.start", {"token": "dax", "stat": "body"}))["code"] == "forbidden"


async def test_gm_rolls_can_be_pushed_by_no_one(engine, dice):
    dice.push(5)
    await run(engine, GM, "gm.roll.start", {"token": "dax", "stat": "body"})
    ack = await run(engine, GM, "roll.push", {"roll": latest(engine).id})
    assert ack["code"] == "invalid"


# ---------------------------------------------------------------- who sees what


async def test_others_see_the_dice_only_as_they_land(engine, dice):
    dice.push(10, 3)
    await run(engine, VES, "roll.start", {"stat": "tech"})
    rid = latest(engine).id

    def marlo():
        v = project(engine.state, engine.content, MARLO)
        return their(v, "ves"), json.dumps(v["rolls"])

    seen, raw = marlo()
    assert seen["phase"] == "roll" and seen["token"] == "ves" and seen["stat"] == "tech"
    for secret in ("dice", "value", "seed", "insult", "bonus"):
        assert f'"{secret}"' not in raw, secret

    mine = their(project(engine.state, engine.content, VES), "ves")
    assert mine["dice"] == [10, 3] and mine["seed"] == 0 and mine["handle"] == "ves"
    assert their(project(engine.state, engine.content, GM), "ves")["dice"] == [10, 3]

    await run(engine, VES, "roll.reveal", {"roll": rid, "shown": 1})
    seen, raw = marlo()
    assert seen["phase"] == "boom" and '"value"' not in raw  # it exploded, and it's still rolling

    await run(engine, VES, "roll.reveal", {"roll": rid, "shown": 2})
    seen, _ = marlo()
    assert (seen["phase"], seen["value"], seen["count"]) == ("land", 13, 2)

    await run(engine, VES, "roll.push", {"roll": rid})
    seen, _ = marlo()
    assert (seen["phase"], seen["value"], seen["pushed"]) == ("push", 15, 2)
    assert next(c for c in project(engine.state, engine.content, MARLO)["crew"] if c["id"] == "ves")["entropy"] == 1

    await run(engine, VES, "roll.close", {"roll": rid})
    seen, _ = marlo()
    assert seen["open"] is False and seen["value"] == 15


async def test_natural_1_shows_red_to_everyone(engine, dice):
    dice.push(1)
    await run(engine, VES, "roll.start", {"stat": "body"})
    await run(engine, VES, "roll.reveal", {"roll": latest(engine).id, "shown": 1})
    seen = their(project(engine.state, engine.content, MARLO), "ves")
    assert (seen["phase"], seen["value"]) == ("nat1", 1) and seen["insult"]  # the banner shows the insult to everyone


async def test_natural_1_shows_1_whatever_the_bonus(engine, dice):
    tally = Viewer("tally", "player")  # Tech d20: with a skill, +2
    dice.push(1)
    await run(engine, tally, "roll.start", {"stat": "tech", "entry": 0})
    await run(engine, tally, "roll.reveal", {"roll": latest(engine).id, "shown": 1})
    seen = their(project(engine.state, engine.content, MARLO), "tally")
    assert (latest(engine).bonus, seen["phase"], seen["value"]) == (2, "nat1", 1)


async def test_secret_gm_rolls_never_reach_players(engine, dice):
    before = {v.seat: project(engine.state, engine.content, v) for v in (VES, MARLO)}
    dice.push(20, 20, 4)
    await run(engine, GM, "gm.roll.start", {"token": None, "sides": 20, "mode": "secret"})
    rid = latest(engine).id
    await run(engine, GM, "roll.reveal", {"roll": rid, "shown": 3})
    for v in (VES, MARLO):
        assert project(engine.state, engine.content, v) == before[v.seat]  # not one byte changed
    gm_view = project(engine.state, engine.content, GM)
    assert gm_view["rolls"][-1]["hidden"] is True and gm_view["rolls"][-1]["value"] == 44 and gm_view["rolls"][-1]["tag"] == "SECRET"
    await run(engine, GM, "roll.close", {"roll": rid})
    for v in (VES, MARLO):
        assert project(engine.state, engine.content, v) == before[v.seat]


async def test_npc_rolls_follow_their_token(engine, dice):
    dice.push(5)
    await run(engine, GM, "gm.roll.start", {"token": "dax", "stat": "empathy"})
    rolls = project(engine.state, engine.content, VES)["rolls"]
    assert [r["token"] for r in rolls] == ["dax"]
    await run(engine, GM, "gm.token.hide", {"token": "dax", "hidden": True})
    assert project(engine.state, engine.content, VES)["rolls"] == []  # Dax is gone, and so is his roll


# ---------------------------------------------------------------- the GM's roll modes (Round 17)

STAGE = Viewer("stage", "stage")
WATCHERS = (VES, MARLO, STAGE)
# never in a sealed roll's frame, whatever the dice did
OUTCOME = ('"value"', '"count"', '"chain"', '"insult"', '"dice"', '"seed"', '"bonus"', '"shown"', '"handle"', '"tag"', '"hidden"')


def seen_by(engine, viewer):
    return project(engine.state, engine.content, viewer)["rolls"]


def assert_sealed(rolls, phase):
    assert len(rolls) == 1
    raw = json.dumps(rolls)
    for field in OUTCOME:
        assert field not in raw, field
    r = rolls[0]
    assert r["sealed"] and r["phase"] == phase and not r["failed"]


@pytest.mark.parametrize("thrown", [(9,), (20, 20, 4), (1,)], ids=["plain", "exploding", "natural 1"])
async def test_hidden_shows_the_face_and_type_never_the_outcome(engine, dice, thrown):
    dice.push(*thrown)
    assert (await run(engine, GM, "gm.roll.start", {"token": "dax", "stat": "cool", "mode": "hidden"}))["ok"]
    rid = latest(engine).id
    for v in WATCHERS:
        assert_sealed(seen_by(engine, v), "roll")
        assert (seen_by(engine, v)[0]["token"], seen_by(engine, v)[0]["stat"], seen_by(engine, v)[0]["sides"]) == ("dax", "cool", 20)
    if len(thrown) > 1:
        await run(engine, GM, "roll.reveal", {"roll": rid, "shown": 1})  # an explosion looks like nothing at all
        for v in WATCHERS:
            assert_sealed(seen_by(engine, v), "roll")
    await run(engine, GM, "roll.reveal", {"roll": rid, "shown": len(thrown)})
    for v in WATCHERS:
        assert_sealed(seen_by(engine, v), "seal")
    gm = seen_by(engine, GM)[-1]
    assert gm["tag"] == "HIDDEN" and not gm["sealed"] and gm["dice"] == list(thrown)
    await run(engine, GM, "roll.close", {"roll": rid})
    for v in WATCHERS:
        assert_sealed(seen_by(engine, v), "seal")  # still nothing, after it's over


async def test_someone_names_nobody(engine, dice, content):
    await run(engine, GM, "gm.token.hide", {"token": "dax", "hidden": True})
    dice.push(1)
    assert (await run(engine, GM, "gm.roll.start", {"token": "dax", "stat": "reflex", "mode": "someone"}))["ok"]
    await run(engine, GM, "roll.reveal", {"roll": latest(engine).id, "shown": 1})
    for v in WATCHERS:
        rolls = seen_by(engine, v)
        assert_sealed(rolls, "seal")
        assert rolls[0]["token"] is None and rolls[0]["stat"] == "reflex"
        assert "dax" not in json.dumps(rolls) and content.npcs["dax"].name not in json.dumps(rolls)
    assert seen_by(engine, GM)[-1]["tag"] == "SOMEONE"


async def test_someone_is_only_heard_in_the_room(engine, dice):
    await run(engine, GM, "gm.token.place", {"ref": "guard", "map": "promenade", "at": [3, 3, 0], "hidden": True})
    dice.push(4)
    assert (await run(engine, GM, "gm.roll.start", {"token": "guard", "stat": "reflex", "mode": "someone"}))["ok"]
    assert seen_by(engine, VES) == []  # the crew is at the Event Horizon


async def test_god_names_an_npc_you_can_see_and_shows_its_number(engine, dice):
    dice.push(13)
    assert (await run(engine, GM, "gm.roll.start", {"token": "dax", "stat": "cool", "mode": "god"}))["ok"]
    rid = latest(engine).id
    for v in WATCHERS:
        r = seen_by(engine, v)[0]
        assert r["god"] and not r["sealed"] and r["token"] == "dax" and r["started"] == latest(engine).started
        assert '"value"' not in json.dumps(r)  # not until it lands
    await run(engine, GM, "roll.reveal", {"roll": rid, "shown": 1})
    for v in WATCHERS:
        assert seen_by(engine, v)[0]["value"] == 13


async def test_god_for_an_npc_players_cant_see_is_someone(engine, dice):
    await run(engine, GM, "gm.token.hide", {"token": "dax", "hidden": True})
    dice.push(5)  # Dax's Reflex is a d6
    await run(engine, GM, "gm.roll.start", {"token": "dax", "stat": "reflex", "mode": "god"})
    await run(engine, GM, "roll.reveal", {"roll": latest(engine).id, "shown": 1})
    for v in WATCHERS:
        rolls = seen_by(engine, v)
        assert_sealed(rolls, "seal")
        assert rolls[0]["god"] and rolls[0]["token"] is None and rolls[0]["stat"] == "reflex" and "dax" not in json.dumps(rolls)
    assert seen_by(engine, GM)[-1]["value"] == 5 and seen_by(engine, GM)[-1]["tag"] == "GOD"


async def test_god_for_an_npc_on_another_map_is_someone_there(engine, dice):
    await run(engine, GM, "gm.token.place", {"ref": "guard", "map": "promenade", "at": [3, 3, 0], "hidden": False})
    dice.push(4)
    await run(engine, GM, "gm.roll.start", {"token": "guard", "stat": "reflex", "mode": "god"})
    await run(engine, GM, "roll.reveal", {"roll": latest(engine).id, "shown": 1})
    rolls = seen_by(engine, VES)
    assert_sealed(rolls, "seal")
    assert rolls[0]["token"] is None and "guard" not in json.dumps(rolls)


async def test_just_a_die_shows_nothing_about_the_die(engine, dice):
    dice.push(6, 3)
    assert (await run(engine, GM, "gm.roll.start", {"token": None, "sides": 6}))["ok"]
    await run(engine, GM, "roll.reveal", {"roll": latest(engine).id, "shown": 2})
    for v in WATCHERS:
        rolls = seen_by(engine, v)
        assert_sealed(rolls, "seal")
        assert rolls[0]["god"] and rolls[0]["stat"] is None and rolls[0]["sides"] == 20
    gm = seen_by(engine, GM)[-1]
    assert (gm["sides"], gm["value"], gm["tag"]) == (6, 9, "GOD")


async def test_hiding_an_npc_mid_roll_takes_its_number_away(engine, dice):
    dice.push(13)
    await run(engine, GM, "gm.roll.start", {"token": "dax", "stat": "cool", "mode": "god"})
    god = latest(engine).id
    await run(engine, GM, "gm.token.hide", {"token": "dax", "hidden": True})
    await run(engine, GM, "roll.reveal", {"roll": god, "shown": 1})
    rolls = seen_by(engine, VES)
    assert_sealed(rolls, "seal")
    assert "dax" not in json.dumps(rolls)


async def test_the_banner_gets_the_skill_and_the_chain(engine, dice):
    dice.push(12, 3)
    await run(engine, VES, "roll.start", {"stat": "tech", "entry": 0})  # Been in worse vents: d10 -> d12
    rid = latest(engine).id
    assert their(project(engine.state, engine.content, MARLO), "ves")["entry"] == "Been in worse vents"
    await run(engine, VES, "roll.reveal", {"roll": rid, "shown": 1})
    seen = their(project(engine.state, engine.content, MARLO), "ves")
    assert (seen["phase"], seen["chain"]) == ("boom", 12) and "value" not in seen
    await run(engine, VES, "roll.reveal", {"roll": rid, "shown": 2})
    seen = their(project(engine.state, engine.content, MARLO), "ves")
    assert (seen["phase"], seen["value"], seen["chain"], seen["count"]) == ("land", 15, 12, 2)


async def test_a_viewers_rolls_come_in_the_order_they_were_rolled(engine, dice):
    dice.push(5, 6, 7)
    await run(engine, GM, "gm.roll.start", {"token": "dax", "stat": "cool", "mode": "god"})
    await run(engine, GM, "gm.roll.start", {"token": None, "sides": 20})
    await run(engine, GM, "gm.roll.start", {"token": "dax", "stat": "cool", "mode": "god"})
    rolls = seen_by(engine, VES)
    assert len(rolls) == 2 and rolls[-1]["id"] == latest(engine).id  # the newest God roll is the one to play


async def test_players_get_one_callout_per_roller(engine, dice):
    dice.push(2, 3, 1)
    for _ in range(3):
        await run(engine, VES, "roll.start", {"stat": "body"})
    rolls = project(engine.state, engine.content, MARLO)["rolls"]
    assert len(rolls) == 1 and rolls[0]["id"] == latest(engine).id
    assert len(project(engine.state, engine.content, GM)["rolls"]) == 3  # the GM keeps the history


async def test_closed_rolls_are_trimmed(engine, dice):
    dice.push(*([2] * (KEEP_CLOSED_ROLLS + 5)))
    for _ in range(KEEP_CLOSED_ROLLS + 5):
        await run(engine, VES, "roll.start", {"stat": "body"})
    await run(engine, VES, "roll.close", {"roll": latest(engine).id})
    assert len(engine.state.rolls) == KEEP_CLOSED_ROLLS and not any(r.open for r in engine.state.rolls)


# ---------------------------------------------------------------- the sweeper


async def test_sweeper_reveals_then_closes(engine, dice, clock):
    dice.push(10, 4)
    await run(engine, VES, "roll.start", {"stat": "tech"})
    rid = latest(engine).id
    clock.t += 40
    assert not await engine.sweep({"ves"})
    clock.t += 6  # 46 s: everyone sees it, even if Ves's screen never gets there
    assert await engine.sweep({"ves"})
    assert roll(engine, rid).shown == 2 and roll(engine, rid).open

    dice.push(3)
    await run(engine, VES, "roll.start", {"stat": "tech"})
    rid = latest(engine).id
    clock.t += 25  # Ves gone, but too soon to close
    assert not await engine.sweep(set())
    clock.t += 6  # 31 s
    assert await engine.sweep(set())
    assert not roll(engine, rid).open and roll(engine, rid).shown == 1


def test_sweeper_closes_anything_stale(engine):
    from lso.models import RollState

    st = engine.state.model_copy(deep=True)
    st.rolls.append(RollState(id="r9", by="ves", char="ves", handle="ves", stat="body", sides=4, dice=[2], seed=0, shown=1, started=0))
    assert sweep(st, 599, {"ves"}) == []
    assert sweep(st, 601, {"ves"}) == [("roll.closed", {"roll": "r9"})]


async def test_replay_with_rolls_rebuilds_snapshot(engine, dice):
    dice.push(10, 3, 1, 6)
    await run(engine, VES, "roll.start", {"stat": "tech"})
    rid = latest(engine).id
    await run(engine, VES, "roll.reveal", {"roll": rid, "shown": 1})
    await run(engine, VES, "roll.push", {"roll": rid})
    await run(engine, VES, "roll.start", {"stat": "tech"})  # closes the first
    await run(engine, GM, "gm.roll.start", {"token": "dax", "stat": "body"})
    state = GameState()
    for seq, ev_type, data in engine.store.events():
        state = apply(state, seq, ev_type, json.loads(data))
    _, snap = engine.store.load_snapshot()
    assert state.model_dump(mode="json") == snap
    assert [r.dice for r in state.rolls] == [[10, 3], [1], [6]]
