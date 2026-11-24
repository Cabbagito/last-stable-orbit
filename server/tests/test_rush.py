"""Sarge's rush: one of the crew works a shift at Sarge's stall, and the TV shows it live.

The shift plays out from its seed and the cook's serves, the same on the server, the cook's laptop and the TV
(lso/rush.py and web/src/rush/sim.ts). Only the cook acts; other players hear nothing of it; the TV gets all of it,
the sound included. To write web/src/rush/sim.fixture.json again (after changing rush.yaml or the simulation):
LSO_WRITE_RUSH_FIXTURE=1 uv run pytest tests/test_rush.py
"""

import json
import os
import struct

import pytest

from lso import rush
from lso.auth import Viewer
from lso.commands import CommandError, handle
from lso.config import ROOT
from lso.content import load_content
from lso.engine import Engine
from lso.store import Store
from lso.views import project, referenced_assets

GM = Viewer("gm", "gm")
STAGE = Viewer("stage", "stage")
TOMO, VES, MARLO = (Viewer(c, "player") for c in ("tomo", "ves", "marlo"))
FIXTURE = ROOT / "web" / "src" / "rush" / "sim.fixture.json"


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


@pytest.fixture(scope="module")
def g(content):
    return content.rush


class Dice:
    def randrange(self, stop):
        return 4242 % stop


@pytest.fixture
def clock():
    class C:
        t = 1000.0

        def __call__(self):
            return self.t

    return C()


@pytest.fixture
def engine(content, tmp_path, clock):
    return Engine(content, Store(tmp_path / "t.db"), rng=Dice(), clock=clock)


async def ok(engine, viewer, kind, args):
    ack, _ = await engine.run(viewer, None, kind, args)
    assert ack["ok"], ack
    return ack


def view(engine, viewer):
    return project(engine.state, engine.content, viewer)


def bowl_for(g, tk):
    if tk["kind"] == "csat":
        return {"n": "ramen", "b": "miso", "t": []}
    return {"n": tk["n"], "b": tk["b"], "t": list(tk["t"])}


# ---------------------------------------------------------------- the shift itself


def test_the_numbers_are_the_prototypes(g):
    assert (g.shift, g.rush, g.last, g.gap, g.first) == (90, (40, 70), 84, 0.5, 1)
    assert (g.every.calm, g.every.rush, g.every.after) == (5.5, 3, 5)
    assert (g.patience.calm, g.patience.rush, g.gran.at, g.gran.patience, g.csat.at, g.csat.patience) == (18, 13, 26, 26, 52, 15)
    assert [(r.rank, r.min) for r in g.ranks] == [("SERGEANT", 16), ("CORPORAL", 9), ("PRIVATE", -99)]


def test_the_same_seed_and_serves_play_the_same_shift(g):
    a, b = rush.simulate(g, 99, [], 90000), rush.simulate(g, 99, [], 90000)
    assert a == b
    assert rush.simulate(g, 100, [], 30000)["slots"] != rush.simulate(g, 99, [], 30000)["slots"]


@pytest.mark.parametrize("seed", [1, 7, 12345, 2**31 - 1])
def test_the_ticket_schedule(g, seed):
    tickets = {}
    for t in range(100, 90001, 100):
        for tk in rush.simulate(g, seed, [], t)["slots"]:
            if tk:
                tickets[tk["id"]] = tk
    born = sorted(tickets.values(), key=lambda tk: tk["id"])
    assert born[0]["born"] == 1000  # the first ticket at 1 s
    assert all(tk["born"] < 84000 for tk in born)  # none after 84 s
    for tk in born:
        if tk["kind"] != "std":
            continue
        in_rush = 40000 <= tk["born"] < 70000
        assert tk["pat"] == (13000 if in_rush else 18000)
        n = len(tk["t"])
        assert n == 1 if tk["born"] < 14000 else n in ((2, 3) if in_rush else (1, 2))
        assert len(set(tk["t"])) == n


@pytest.mark.parametrize("seed", [1, 7, 12345])
def test_gran_orders_the_usual_once_after_26_s_and_csat_once_after_52_s(g, seed):
    kinds = {}
    for t in range(100, 90001, 100):
        for tk in rush.simulate(g, seed, [], t)["slots"]:
            if tk:
                kinds[tk["id"]] = tk
    gran = [tk for tk in kinds.values() if tk["kind"] == "gran"]
    csat = [tk for tk in kinds.values() if tk["kind"] == "csat"]
    assert len(gran) == 1 and len(csat) == 1
    assert gran[0]["born"] >= 26000 and gran[0]["pat"] == 26000
    assert (gran[0]["n"], gran[0]["b"], sorted(gran[0]["t"])) == ("udon", "clear", ["egg", "scallion"])
    assert csat[0]["born"] >= 52000 and csat[0]["pat"] == 15000


def test_grans_ticket_never_spells_the_usual_out(g):
    text = (g.ticket.gran.text + g.lines.call_gran).upper()
    assert not any(w in text for w in ("UDON", "CLEAR", "EGG", "SCALLION"))


def first(g, seed, kind, upto=90000):
    for t in range(100, upto + 1, 100):
        st = rush.simulate(g, seed, [], t)
        for tk in st["slots"]:
            if tk and tk["kind"] == kind:
                return tk
    raise AssertionError(kind)


def test_any_bowl_satisfies_csat_and_scores_nothing(g):
    tk = first(g, 7, "csat")
    at = tk["born"] + 50
    st = rush.simulate(g, 7, [{"k": 1, "at": at, "n": "glass", "b": "spicy", "t": ["tofu"]}], at)
    assert st["bark"] == g.lines.droid_served and st["out"] == 0 and st["wrong"] == 0
    assert all(not x or x["id"] != tk["id"] for x in st["slots"])
    half = rush.simulate(g, 7, [{"k": 1, "at": at, "n": "glass", "b": None, "t": []}], at)  # no broth: not a bowl he takes
    assert half["wrong"] == 1


def test_csat_walking_off_costs_nothing(g):
    tk = first(g, 7, "csat")
    at = tk["born"] + tk["pat"]
    before = rush.simulate(g, 7, [], at - 100)["lost"]
    st = rush.simulate(g, 7, [], at)
    assert st["lost"] == before and st["bark"] == g.lines.droid_left


def test_the_usual_scores_and_a_wrong_one_hears_about_it(g):
    tk = first(g, 7, "gran")
    at = tk["born"] + 50
    good = rush.simulate(g, 7, [{"k": 1, "at": at, "n": "udon", "b": "clear", "t": ["scallion", "egg"]}], at)
    assert good["out"] == 1 and good["bark"] == g.lines.usual


def test_scoring_and_the_ranks(g):
    assert [rush.rank(g, s).rank for s in (20, 16, 15, 9, 8, 0, -14)] == ["SERGEANT", "SERGEANT", "CORPORAL", "CORPORAL", "PRIVATE", "PRIVATE", "PRIVATE"]
    st = rush.simulate(g, 12345, [], 90000)
    assert st["done"] and st["score"] == st["out"] - st["wrong"] - st["lost"] == -st["lost"]
    assert st["rank"] == "PRIVATE" and st["bark"] == g.lines.cease + g.ranks[-1].line


def test_an_empty_bowl_and_a_wrong_one(g):
    tk = first(g, 7, "std", 2000)
    at = tk["born"] + 333
    empty = rush.simulate(g, 7, [{"k": 1, "at": at, "n": None, "b": None, "t": []}], at)
    assert empty["bark"] == g.lines.empty and (empty["out"], empty["wrong"]) == (0, 0) and not empty["red"]
    wrong_b = next(b for b in g.ids("broths") if b != tk["b"])
    bad = rush.simulate(g, 7, [{"k": 1, "at": at, "n": tk["n"], "b": wrong_b, "t": tk["t"]}], at)
    assert bad["wrong"] == 1 and bad["red"] and bad["bark"] in g.lines.bad
    assert not rush.simulate(g, 7, [{"k": 1, "at": at, "n": tk["n"], "b": wrong_b, "t": tk["t"]}], at + 1100)["red"]


def test_the_rush_window(g):
    assert not rush.simulate(g, 7, [], 39900)["rush"]
    st = rush.simulate(g, 7, [], 40000)
    assert st["rush"] and {"at": 40000, "kind": "rush", "key": "rush"} in st["cues"]
    assert rush.simulate(g, 7, [], 69900)["rush"] and not rush.simulate(g, 7, [], 70000)["rush"]


def test_a_serve_between_ticks_lands_at_its_own_time(g):
    tk = first(g, 7, "std", 2000)
    at = tk["born"] + 1234
    st = rush.simulate(g, 7, [{"k": 1, "at": at, **bowl_for(g, tk)}], at)
    assert st["out"] == 1 and {"at": at, "kind": "ok", "key": "s1"} in st["cues"]


# ---------------------------------------------------------------- one shift, the same in TypeScript


def play(g, seed, sloppy=False):
    """A cook at the pass: serves the oldest ticket once it's 1.6 s old. A sloppy one gets every fourth wrong and
    serves an empty bowl now and then."""
    serves, k, rest = [], 0, 0
    for t in range(37, 90000, 100):
        st = rush.simulate(g, seed, serves, t)
        if st["done"]:
            break
        if t < rest:
            continue
        old = [tk for tk in st["slots"] if tk and t - tk["born"] >= 1600]
        if not old:
            continue
        tk = min(old, key=lambda x: x["born"])
        k += 1
        bowl = bowl_for(g, tk)
        if sloppy and k % 4 == 0:
            bowl["b"] = next(b for b in g.ids("broths") if b != bowl["b"])
        if sloppy and k % 7 == 0:
            bowl = {"n": None, "b": None, "t": []}
        serves.append({"k": k, "at": t, **bowl})
        rest = t + 700
    return serves


def fixture_cases(g):
    cases = [
        {"seed": 12345, "serves": [], "upto": 90000},
        {"seed": 12345, "serves": [], "upto": 41234},
        {"seed": 7, "serves": play(g, 7), "upto": 90000},
        {"seed": 2024, "serves": play(g, 2024, sloppy=True), "upto": 90000},
    ]
    cases.append({"seed": 2024, "serves": cases[-1]["serves"], "upto": 55555})
    return cases


def test_the_typescript_fixture_is_what_this_plays(g):
    game = g.model_dump(mode="json", exclude={"art", "sound"})
    if os.environ.get("LSO_WRITE_RUSH_FIXTURE"):
        cases = [c | {"result": rush.simulate(g, c["seed"], c["serves"], c["upto"])} for c in fixture_cases(g)]
        FIXTURE.write_text(json.dumps({"game": game, "cases": cases}, indent=1) + "\n")
    fx = json.loads(FIXTURE.read_text())
    assert fx["game"] == game, "rush.yaml changed: write the fixture again (see the docstring)"
    for c in fx["cases"]:
        assert rush.simulate(g, c["seed"], c["serves"], c["upto"]) == c["result"]
    perfect, sloppy = fx["cases"][2]["result"], fx["cases"][3]["result"]
    assert perfect["rank"] == "SERGEANT" and perfect["wrong"] == 0
    assert sloppy["wrong"] > 0 and sloppy["rank"] != "SERGEANT"


# ---------------------------------------------------------------- the music


def flac_length(path) -> float:
    data = path.read_bytes()
    assert data[:4] == b"fLaC"
    info = data[8:42]  # STREAMINFO, the first metadata block
    rate = int.from_bytes(info[10:13], "big") >> 4
    total = struct.unpack(">Q", info[10:18])[0] & ((1 << 36) - 1)
    return total / rate


@pytest.mark.parametrize("which", ["shift", "rush"])
def test_each_song_is_exactly_its_loop(g, which):
    song = getattr(g.sound.music, which)
    secs = flac_length(ROOT / "assets" / g.sound.file(song.file))
    assert abs(secs - song.length) < 0.001, (secs, song.length)


def test_the_rush_song_is_as_long_as_the_rush(g):
    assert g.sound.music.rush.length == pytest.approx(g.rush[1] - g.rush[0])
    assert g.sound.music.shift.length == pytest.approx(32 * 4 * 60 / 126)


# ---------------------------------------------------------------- the GM sends it, the cook plays, the TV watches


async def send(engine, char="tomo"):
    await ok(engine, GM, "gm.overview.send", {"overview": "rush", "chars": [char]})
    return engine.state.rush.id


async def test_it_goes_to_one_cook_and_the_tv(engine):
    rid = await send(engine)
    cook = view(engine, TOMO)
    assert cook["overview"]["kind"] == "rush" and cook["overview"]["rush"] is True
    assert cook["rush"]["id"] == rid and cook["rush"]["start"] is None and "sound" not in cook["rush"]
    tv = view(engine, STAGE)
    assert tv["rush"]["id"] == rid and tv["overview"] is None
    assert tv["rush"]["sound"]["files"]["music_shift"] == "/assets/rush/sound/music_shift.flac"
    assert tv["rush"]["sound"]["music"]["rush"]["length"] == pytest.approx(30.0)


async def test_nobody_else_hears_of_it(engine):
    await send(engine)
    for who in (VES, MARLO, GM):
        v = view(engine, who)
        assert v["rush"] is None
        assert not any(a.startswith("rush/") for a in referenced_assets(v))
        if who is not GM:
            assert v["overview"] is None
    assert "rush/sound/music_rush.flac" in referenced_assets(view(engine, STAGE))
    assert "rush/sound/music_rush.flac" not in referenced_assets(view(engine, TOMO))  # laptops are silent
    assert "rush/art/bin-udon.png" in referenced_assets(view(engine, TOMO))


async def test_the_gm_sees_it_as_one_cook_and_whose_screen_has_it(engine):
    games = {x["id"]: x for x in view(engine, GM)["overviews"]["games"]}
    assert games["rush"].get("one") is True and "one" not in games["golf"]
    await send(engine)
    assert view(engine, GM)["overviews"]["open"]["tomo"]["kind"] == "rush"


async def test_one_cook_only(engine, content):
    with pytest.raises(CommandError):
        handle(GM, engine.state, content, "gm.overview.send", {"overview": "rush", "chars": ["tomo", "ves"]}, rng=Dice())


async def test_only_the_cook_acts(engine, content, clock):
    rid = await send(engine)
    for who in (VES, GM, STAGE):
        for kind, args in (("rush.clock_in", {}), ("rush.bowl", {"n": "udon"}), ("rush.serve", {"k": 1, "at": 10})):
            with pytest.raises(CommandError) as e:
                handle(who, engine.state, content, kind, {"id": rid, **args}, now=clock.t)
            assert e.value.code == "forbidden"


async def test_a_shift_from_clock_in_to_the_screen_closing(engine, clock):
    g = engine.content.rush
    rid = await send(engine)
    await ok(engine, TOMO, "rush.clock_in", {"id": rid})
    start = engine.state.rush.start
    assert start == clock.t
    seed = engine.state.rush.seed
    tk = first(g, seed, "std", 2000)
    clock.t = start + (tk["born"] + 900) / 1000
    await ok(engine, TOMO, "rush.bowl", {"id": rid, "n": tk["n"]})
    assert view(engine, STAGE)["rush"]["bowl"] == {"n": tk["n"], "b": None, "t": []}  # the TV sees the bowl being built
    await ok(engine, TOMO, "rush.serve", {"id": rid, "k": 1, "at": tk["born"] + 880, **bowl_for(g, tk)})
    r = engine.state.rush
    assert r.serves[0].at == tk["born"] + 880 and r.bowl.n is None
    assert view(engine, STAGE)["rush"]["serves"] == view(engine, TOMO)["rush"]["serves"]
    clock.t = start + g.shift - 0.01
    assert not await engine.sweep(set())
    clock.t = start + g.shift
    assert await engine.sweep(set())
    tally = engine.state.rush.tally
    end = rush.simulate(g, seed, [x.model_dump() for x in r.serves], 90000)
    assert tally == {k: end[k] for k in ("out", "wrong", "lost", "score", "rank")} and tally["out"] == 1
    await ok(engine, TOMO, "rush.serve", {"id": rid, "k": 2, "at": 89000, "n": "udon", "b": "clear", "t": []})
    assert len(engine.state.rush.serves) == 1  # over is over
    clock.t = start + g.shift + g.hold
    assert await engine.sweep(set())
    assert engine.state.rush is None and "tomo" not in engine.state.overviews


async def test_a_late_serve_lands_no_further_back_than_three_seconds(engine, clock):
    rid = await send(engine)
    await ok(engine, TOMO, "rush.clock_in", {"id": rid})
    clock.t += 20
    await ok(engine, TOMO, "rush.serve", {"id": rid, "k": 1, "at": 1000, "n": "udon", "b": "clear", "t": []})
    await ok(engine, TOMO, "rush.serve", {"id": rid, "k": 2, "at": 99999, "n": "udon", "b": "clear", "t": []})
    await ok(engine, TOMO, "rush.serve", {"id": rid, "k": 2, "at": 20000, "n": "udon", "b": "clear", "t": []})  # again: once
    assert [(x.k, x.at) for x in engine.state.rush.serves] == [(1, 17000), (2, 20500)]


async def test_bad_bowls_are_refused(engine, content, clock):
    rid = await send(engine)
    await ok(engine, TOMO, "rush.clock_in", {"id": rid})
    for args in ({"n": "spaghetti"}, {"b": "gravy"}, {"t": ["egg", "egg"]}, {"t": "egg"}):
        with pytest.raises(CommandError):
            handle(TOMO, engine.state, content, "rush.bowl", {"id": rid, **args}, now=clock.t + 1)


async def test_the_gm_takes_it_back(engine):
    await send(engine)
    await ok(engine, GM, "gm.overview.recall", {"char": "tomo"})
    assert engine.state.rush is None and view(engine, STAGE)["rush"] is None


async def test_a_new_cook_replaces_the_last(engine):
    await send(engine, "tomo")
    await send(engine, "ves")
    assert engine.state.rush.char == "ves" and "tomo" not in engine.state.overviews
    assert view(engine, TOMO)["rush"] is None and view(engine, VES)["rush"]


async def test_another_event_for_the_cook_ends_the_shift(engine):
    await send(engine)
    await ok(engine, GM, "gm.overview.send", {"overview": "golf", "chars": ["tomo"]})
    assert engine.state.rush is None


async def test_a_reload_picks_the_shift_back_up(engine, clock, tmp_path, content):
    rid = await send(engine)
    await ok(engine, TOMO, "rush.clock_in", {"id": rid})
    clock.t += 5
    await ok(engine, TOMO, "rush.serve", {"id": rid, "k": 1, "at": 4900, "n": "udon", "b": "clear", "t": []})
    again = Engine(content, Store(tmp_path / "t.db"), rng=Dice(), clock=clock)  # the server restarts, or a screen reloads
    assert again.state.rush == engine.state.rush
    assert view(again, STAGE)["rush"]["start"] == engine.state.rush.start
