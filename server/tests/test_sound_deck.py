"""The Sound deck (content/soundboard.yaml): music the GM picks, flares and pads the GM presses, and the sounds that
play by themselves. All of it reaches only the TV; the GM gets the names, and a player's laptop nothing at all.

Music is one track at a time. A film ends it; a fight can bring its own and hand back what it interrupted. Every
track's file is exactly its loop, to the sample."""

import json
import struct

import pytest

from lso.auth import Viewer
from lso.commands import ARRIVE_LEAD, FIGHT_MUSIC_LEAD, FILM_LEAD, WON_MUSIC_LEAD
from lso.config import ROOT
from lso.content import ContentError, load_content
from lso.engine import Engine
from lso.models import AUTO_SOUNDS, VOLUME_DEFAULT, GameState, SoundDeck
from lso.state import apply
from lso.store import Store
from lso.views import project, referenced_assets

GM = Viewer("gm", "gm")
STAGE = Viewer("stage", "stage")
VES = Viewer("ves", "player")
EH = "event-horizon"


@pytest.fixture(scope="module")
def content():
    return load_content(ROOT / "content", ROOT / "assets")


class Clock:
    def __init__(self, t: float = 1000.0):
        self.t = t

    def __call__(self) -> float:
        return self.t


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def engine(content, tmp_path, clock):
    return Engine(content, Store(tmp_path / "t.db"), clock=clock)


async def run(engine, viewer, kind, args=None):
    ack, _ = await engine.run(viewer, None, kind, args or {})
    return ack


async def ok(engine, kind, args=None):
    ack = await run(engine, GM, kind, args)
    assert ack["ok"], ack


def stage(engine, viewer):
    return project(engine.state, engine.content, viewer)["stage"]


def heard(engine, since=0):
    """What the TV has been told to play, in order."""
    return [s["id"] for s in stage(engine, STAGE)["sounds"]][since:]


async def place(engine, ref, hidden=False):
    await ok(engine, "gm.token.place", {"ref": ref, "map": EH, "at": [3, 3, 0], "hidden": hidden})
    return ref


# ---------------------------------------------------------------- the content


def test_the_deck_has_what_was_agreed(content):
    d = content.deck
    assert [(g.id, [t.id for t in g.tracks]) for g in d.music] == [
        ("around", ["aurora", "station_air", "lounge", "funked_up"]),
        ("fight", ["funk", "arcade", "battle_theme", "boss_battle_2"]),
        ("boss", ["nothing_personal", "no_way_out"]),
    ]
    assert [f.id for f in d.flares] == ["quest_done", "great_move", "gone_wrong"]
    assert [(c.id, len(c.sounds)) for c in d.pads] == [("fight", 10), ("droid", 8), ("station", 6), ("bits", 2)]
    assert set(d.auto) == set(AUTO_SOUNDS)
    assert not [m for m in content.missing_assets if m.startswith(("sounds/", "music/"))]


def flac(path) -> tuple[int, int]:
    """A FLAC's sample rate and how many samples it holds, from its STREAMINFO block."""
    data = path.read_bytes()[:42]
    assert data[:4] == b"fLaC"
    info = data[8:42]
    return int.from_bytes(info[10:13], "big") >> 4, struct.unpack(">Q", info[10:18])[0] & ((1 << 36) - 1)


def test_every_track_is_exactly_its_loop(content):
    """The TV loops the decoded file from `loop_from` to its end, so the file has to end where the loop does."""
    for t in content.deck.tracks.values():
        rate, samples = flac(ROOT / "assets" / t.file)
        assert rate == 44100, t.id
        assert abs(samples / rate - t.length) < 0.0001, t.id
        assert abs(t.loop_from * rate - round(t.loop_from * rate)) < 0.05, f"{t.id}: loop_from isn't on a sample"
        assert t.length - t.loop_from > 10, t.id


def test_an_opening_is_only_where_one_was_cut(content):
    assert {t.id: t.loop_from for t in content.deck.tracks.values() if t.loop_from} == {"battle_theme": 11.636372, "boss_battle_2": 39.72415}


def test_a_broken_deck_is_refused(content):
    with pytest.raises(ValueError, match="nothing plays"):
        SoundDeck.model_validate({"auto": {"kazoo": "sounds/x.mp3"}})
    with pytest.raises(ValueError, match="loop_from"):
        SoundDeck.model_validate({"music": [{"id": "g", "name": "G", "tracks": [{"id": "t", "name": "T", "file": "music/t.flac", "length": 10, "loop_from": 10}]}]})


def test_two_sounds_cannot_share_an_id(tmp_path):
    import shutil

    shutil.copytree(ROOT / "content", tmp_path / "content")
    board = tmp_path / "content" / "soundboard.yaml"
    board.write_text(board.read_text().replace("id: quest_done", "id: punch"))
    with pytest.raises(ContentError, match="share an id"):
        load_content(tmp_path / "content", ROOT / "assets")


# ---------------------------------------------------------------- who gets what


def test_the_gm_gets_names_the_tv_gets_files_and_a_player_nothing(engine):
    gm, tv, player = (stage(engine, v) for v in (GM, STAGE, VES))
    assert [(g["name"], g["fight"]) for g in gm["deck"]["music"]] == [("Around", False), ("Fight", True), ("Boss", True)]
    assert gm["deck"]["music"][1]["tracks"][3] == {"id": "boss_battle_2", "name": "Boss Battle #2"}
    assert gm["deck"]["flares"][0] == {"id": "quest_done", "name": "Quest done", "tone": "good"}
    assert [c["id"] for c in gm["deck"]["pads"]] == ["fight", "droid", "station", "bits"]
    assert gm["music"] == {"track": None, "volume": VOLUME_DEFAULT}
    assert "/assets/" not in json.dumps(gm["deck"]) and "music_files" not in gm and "sound_files" not in gm

    assert tv["music_files"]["battle_theme"] == {"src": "/assets/music/battle_theme.flac", "loop_from": 11.636372}
    assert tv["music_files"]["aurora"]["loop_from"] == 0
    assert tv["sound_files"]["quest_done"] == "/assets/sounds/flares/quest_done.mp3"
    assert tv["sound_files"]["crew_hit"] == "/assets/sounds/auto/crew_hit.mp3"
    assert tv["music"] == {"track": None, "volume": VOLUME_DEFAULT} and "deck" not in tv

    for key in ("deck", "music", "music_files", "sound_files", "sounds"):
        assert key not in player
    full = project(engine.state, engine.content, VES)
    assert "music/" not in json.dumps(full) and "sounds/" not in json.dumps(full)


async def test_only_the_tv_may_fetch_the_music(engine):
    await ok(engine, "gm.music.play", {"track": "aurora"})
    assert "music/aurora.flac" in referenced_assets(project(engine.state, engine.content, STAGE))
    assert not [a for a in referenced_assets(project(engine.state, engine.content, VES)) if a.startswith(("music/", "sounds/"))]


def test_a_machine_is_never_told_apart_in_what_goes_out(engine, content):
    assert content.npcs["spider-mech"].machine and not content.npcs["hired-gun"].machine
    for viewer in (GM, STAGE, VES):
        assert '"machine"' not in json.dumps(project(engine.state, content, viewer))


# ---------------------------------------------------------------- music


async def test_a_track_plays_until_another_is_picked_or_it_is_stopped(engine, clock):
    await ok(engine, "gm.music.play", {"track": "aurora"})
    assert stage(engine, STAGE)["music"] == {"track": "aurora", "at": 1000.0, "fade": 1.5, "volume": VOLUME_DEFAULT}
    assert stage(engine, GM)["music"] == {"track": "aurora", "volume": VOLUME_DEFAULT}
    clock.t += 30
    await ok(engine, "gm.music.play", {"track": "lounge"})
    assert stage(engine, STAGE)["music"]["track"] == "lounge" and stage(engine, STAGE)["music"]["at"] == 1030.0
    await ok(engine, "gm.music.stop")
    assert stage(engine, STAGE)["music"]["track"] is None and stage(engine, GM)["music"]["track"] is None
    seq = engine.state.seq
    await ok(engine, "gm.music.stop")  # already silent: nothing to log
    assert engine.state.seq == seq


async def test_only_the_gm_runs_the_music(engine):
    for viewer in (VES, STAGE):
        for kind, args in (("gm.music.play", {"track": "aurora"}), ("gm.music.stop", {}), ("gm.music.volume", {"volume": 3})):
            assert not (await run(engine, viewer, kind, args))["ok"]
    assert not (await run(engine, GM, "gm.music.play", {"track": "kazoo"}))["ok"]
    assert not (await run(engine, GM, "gm.music.play", {"track": "punch"}))["ok"]  # a pad isn't a track


async def test_the_volume_goes_from_0_to_10(engine):
    await ok(engine, "gm.music.volume", {"volume": 3})
    assert stage(engine, STAGE)["music"]["volume"] == 3 and stage(engine, GM)["music"]["volume"] == 3
    for bad in (-1, 11, 2.5, "loud", True):
        assert not (await run(engine, GM, "gm.music.volume", {"volume": bad}))["ok"]
    seq = engine.state.seq
    await ok(engine, "gm.music.volume", {"volume": 3})
    assert engine.state.seq == seq


async def test_a_film_ends_the_music_and_the_next_track_can_be_cued_under_it(engine, clock):
    await ok(engine, "gm.music.play", {"track": "aurora"})
    await ok(engine, "gm.film.play", {"cue": "shotgun"})
    assert engine.state.stage.music is None and stage(engine, STAGE)["music"]["track"] is None
    clock.t += FILM_LEAD + 1
    await ok(engine, "gm.music.play", {"track": "lounge"})  # the TV holds it silent until the film is over
    assert stage(engine, STAGE)["music"]["track"] == "lounge" and stage(engine, STAGE)["film"]


async def test_the_opening_ends_the_music(engine):
    await ok(engine, "gm.music.play", {"track": "aurora"})
    await ok(engine, "gm.opening.set", {"on": True})
    assert engine.state.stage.music is None


async def test_the_music_carries_over_a_scene_and_a_restart(engine, content, tmp_path):
    await ok(engine, "gm.music.play", {"track": "aurora"})
    await ok(engine, "gm.music.volume", {"volume": 4})
    await ok(engine, "gm.world.load_preset", {"preset": content.default_preset.id})
    assert engine.state.stage.music.track == "aurora" and engine.state.stage.volume == 4
    state = GameState()
    for seq, ev_type, data in engine.store.events():
        state = apply(state, seq, ev_type, json.loads(data))
    assert state.stage.music == engine.state.stage.music and state.stage.volume == 4


def test_a_game_saved_before_the_deck_still_loads():
    old = GameState().model_dump(mode="json")
    del old["stage"]["music"], old["stage"]["volume"]
    st = GameState.model_validate(old)
    assert st.stage.music is None and st.stage.volume == VOLUME_DEFAULT


def test_a_track_the_content_has_lost_is_silence(engine, content):
    st = apply(engine.state, engine.state.seq + 1, "stage.music_set", {"track": "gone", "at": 1.0})
    assert project(st, content, STAGE)["stage"]["music"]["track"] is None
    assert project(st, content, GM)["stage"]["music"]["track"] is None


# ---------------------------------------------------------------- flares and pads


async def test_a_flare_and_a_new_pad_play_like_any_press(engine, clock):
    await ok(engine, "gm.sound.play", {"sound": "great_move"})
    await ok(engine, "gm.sound.play", {"sound": "pa_chime"})
    assert stage(engine, STAGE)["sounds"] == [{"id": "great_move", "at": clock.t}, {"id": "pa_chime", "at": clock.t}]


# ---------------------------------------------------------------- the sounds that play by themselves


async def test_the_crew_getting_hurt_healed_and_dropped(engine):
    await ok(engine, "gm.vitals.set", {"char": "ves", "hp": 2})
    await ok(engine, "gm.vitals.set", {"char": "ves", "hp": 3})
    await ok(engine, "gm.vitals.set", {"char": "ves", "hp": 0})
    await ok(engine, "gm.vitals.set", {"char": "ves", "hp": 0})  # no change, no sound
    assert heard(engine) == ["crew_hit", "healed", "crew_down"]


async def test_three_heals_are_three_chimes(engine, clock):
    await ok(engine, "gm.vitals.set", {"char": "ves", "hp": 0})
    for hp in (1, 2, 3):
        clock.t += 0.2
        await ok(engine, "gm.vitals.set", {"char": "ves", "hp": hp})
    assert heard(engine, 1) == ["healed", "healed", "healed"]


async def test_entropy_gained_and_spent(engine):
    en = engine.state.vitals["ves"].entropy if "ves" in engine.state.vitals else 2
    await ok(engine, "gm.vitals.set", {"char": "ves", "entropy": en + 1})
    await ok(engine, "gm.vitals.set", {"char": "ves", "entropy": en})
    assert heard(engine) == ["entropy_gained", "entropy_spent"]


async def test_a_person_grunts_and_a_machine_clanks(engine):
    gun, mech = await place(engine, "hired-gun"), await place(engine, "spider-mech")
    top = engine.content.npcs["hired-gun"].health
    await ok(engine, "gm.npc.hp", {"token": gun, "hp": top - 1})
    await ok(engine, "gm.npc.hp", {"token": gun, "hp": 0})
    await ok(engine, "gm.npc.hp", {"token": gun, "hp": 1})
    await ok(engine, "gm.npc.hp", {"token": mech, "hp": engine.content.npcs["spider-mech"].health - 1})
    await ok(engine, "gm.npc.hp", {"token": mech, "hp": 0})
    assert heard(engine) == ["npc_hit", "npc_down", "healed", "machine_hit", "machine_down"]


async def test_a_hidden_npc_makes_no_noise(engine):
    gun = await place(engine, "hired-gun", hidden=True)
    await ok(engine, "gm.npc.hp", {"token": gun, "hp": 0})
    assert heard(engine) == []


async def test_items_and_credits(engine):
    await ok(engine, "gm.item.give", {"holder": "marlo", "item": "maintenance-log"})
    uid = engine.state.inventory["marlo"][-1].uid
    await ok(engine, "gm.item.take", {"holder": "marlo", "uid": uid})
    before = len(heard(engine))
    assert heard(engine) == ["item_found", "item_taken"]
    have = next((e for e in engine.state.inventory.get("ves", []) if e.item == "credits"), None)
    await ok(engine, "gm.item.give", {"holder": "ves", "item": "credits", "count": 60})
    cr = next(e for e in engine.state.inventory["ves"] if e.item == "credits")
    await ok(engine, "gm.item.count", {"holder": "ves", "uid": cr.uid, "count": (have.count if have else 0) + 10})
    await ok(engine, "gm.item.take", {"holder": "ves", "uid": cr.uid})
    assert heard(engine, before) == ["credits_gained", "credits_spent", "credits_spent"]


async def test_a_handover_between_two_of_the_crew_is_silent(engine):
    await ok(engine, "gm.item.give", {"holder": "marlo", "item": "maintenance-log"})
    uid = engine.state.inventory["marlo"][-1].uid
    await ok(engine, "gm.item.move", {"holder": "marlo", "uid": uid, "to": "ves"})
    assert heard(engine) == ["item_found"]


async def test_arriving_lands_as_the_new_map_comes_up(engine, clock):
    await ok(engine, "gm.crew.send", {"map": "promenade"})
    assert stage(engine, STAGE)["sounds"] == [{"id": "arrive", "at": round(clock.t + ARRIVE_LEAD, 3)}]
    await ok(engine, "gm.crew.send", {"map": "promenade"})  # already there
    assert heard(engine) == ["arrive"]


async def test_a_film_that_brings_its_scene_does_not_ring_the_arrival(engine):
    await ok(engine, "gm.film.play", {"cue": "vigil"})
    assert heard(engine) == []


async def test_what_players_do_makes_no_deck_sound(engine):
    """A push, a Burn and a roll have their own sound on the TV, or none."""
    ack = await run(engine, VES, "roll.start", {"stat": "reflex"})
    assert ack["ok"], ack
    await run(engine, VES, "burn.use", {})
    assert heard(engine) == []


async def test_a_maximum_coming_down_is_not_a_hit(engine, content):
    top = project(engine.state, content, GM)["crew"]
    ves = next(c for c in top if c["id"] == "ves")
    await ok(engine, "gm.vitals.max", {"char": "ves", "health": max(1, ves["health"] - 1)})
    assert heard(engine) == []


async def test_an_automatic_sound_never_says_who(engine):
    await ok(engine, "gm.item.give", {"holder": "marlo", "item": "maintenance-log"})
    tv = json.dumps(stage(engine, STAGE)["sounds"])
    assert "marlo" not in tv and "maintenance" not in tv
    assert "sounds" not in stage(engine, VES) and "sounds" not in stage(engine, GM)


# ---------------------------------------------------------------- a fight's bell and its track


async def test_a_fight_rings_its_bell_and_brings_its_track(engine, clock):
    await ok(engine, "gm.music.play", {"track": "aurora"})
    clock.t += 60
    gun = await place(engine, "hired-gun")
    await ok(engine, "gm.fight.start", {"map": EH, "tokens": ["ves", gun], "music": "battle_theme"})
    assert heard(engine) == ["fight_start"]
    m = engine.state.stage.music
    assert (m.track, m.at, m.fight, m.back) == ("battle_theme", clock.t + FIGHT_MUSIC_LEAD, EH, "aurora")
    assert stage(engine, STAGE)["music"] == {"track": "battle_theme", "at": clock.t + FIGHT_MUSIC_LEAD, "fade": 0.05, "volume": VOLUME_DEFAULT}


async def test_a_fight_with_no_track_leaves_the_music_alone(engine):
    await ok(engine, "gm.music.play", {"track": "aurora"})
    gun = await place(engine, "hired-gun")
    await ok(engine, "gm.fight.start", {"map": EH, "tokens": ["ves", gun]})
    assert heard(engine) == ["fight_start"] and engine.state.stage.music.track == "aurora"
    await ok(engine, "gm.fight.end", {"map": EH})
    assert engine.state.stage.music.track == "aurora"
    assert not (await run(engine, GM, "gm.fight.start", {"map": EH, "tokens": ["ves", gun], "music": "kazoo"}))["ok"]


async def test_a_won_fight_plays_its_jingle_and_hands_the_music_back(engine, clock):
    await ok(engine, "gm.music.play", {"track": "aurora"})
    gun = await place(engine, "hired-gun")
    await ok(engine, "gm.fight.start", {"map": EH, "tokens": ["ves", "tomo", gun], "music": "funk"})
    await ok(engine, "gm.vitals.set", {"char": "tomo", "hp": 0})  # one of the crew down is still a win
    await ok(engine, "gm.npc.hp", {"token": gun, "hp": 0})
    clock.t += 90
    await ok(engine, "gm.fight.end", {"map": EH})
    assert heard(engine)[-1] == "fight_won"
    m = engine.state.stage.music
    assert (m.track, m.at, m.fade, m.fight, m.back) == ("aurora", clock.t + WON_MUSIC_LEAD, 2.0, None, None)


async def test_a_fight_that_just_stops_is_quiet_and_the_music_returns_at_once(engine, clock):
    await ok(engine, "gm.music.play", {"track": "aurora"})
    gun = await place(engine, "hired-gun")
    await ok(engine, "gm.fight.start", {"map": EH, "tokens": ["ves", gun], "music": "funk"})
    await ok(engine, "gm.fight.end", {"map": EH})  # nobody is down: they talked, or ran
    assert "fight_won" not in heard(engine)
    assert (engine.state.stage.music.track, engine.state.stage.music.at) == ("aurora", clock.t)


async def test_a_lost_fight_is_not_won(engine):
    gun = await place(engine, "hired-gun")
    await ok(engine, "gm.fight.start", {"map": EH, "tokens": ["ves", gun], "music": "funk"})
    await ok(engine, "gm.vitals.set", {"char": "ves", "hp": 0})
    await ok(engine, "gm.fight.end", {"map": EH})
    assert "fight_won" not in heard(engine)
    assert engine.state.stage.music is None  # there was silence before it, and there is again


async def test_a_track_picked_by_hand_mid_fight_stays_when_the_fight_ends(engine):
    await ok(engine, "gm.music.play", {"track": "aurora"})
    gun = await place(engine, "hired-gun")
    await ok(engine, "gm.fight.start", {"map": EH, "tokens": ["ves", gun], "music": "funk"})
    await ok(engine, "gm.music.play", {"track": "no_way_out"})
    await ok(engine, "gm.fight.end", {"map": EH})
    assert engine.state.stage.music.track == "no_way_out"


async def test_a_second_fight_keeps_what_the_first_one_interrupted(engine):
    await ok(engine, "gm.music.play", {"track": "aurora"})
    gun = await place(engine, "hired-gun")
    await ok(engine, "gm.fight.start", {"map": EH, "tokens": ["ves", gun], "music": "funk"})
    await ok(engine, "gm.token.place", {"ref": "hired-gun", "map": "promenade", "at": [3, 3, 0]})
    await ok(engine, "gm.token.place", {"ref": "guard", "map": "promenade", "at": [4, 3, 0]})
    await ok(engine, "gm.fight.start", {"map": "promenade", "tokens": ["hired-gun-2", "guard"], "music": "arcade"})
    m = engine.state.stage.music
    assert (m.track, m.fight, m.back) == ("arcade", "promenade", "aurora")
