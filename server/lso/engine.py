"""The engine: one authoritative GameState, changed only by logged events, one intent at a time."""

from __future__ import annotations

import asyncio
import logging
import random
import time

from . import bench
from .auth import Viewer
from .commands import CommandError, handle, sweep
from .content import Content
from .models import RULES, GameState, InvEntry, MapState
from .state import apply, state_from_preset
from .store import Store

log = logging.getLogger("lso.engine")

# NPC ids that changed, old to new. The Patience's pilgrims became passengers who came to see the Vigil (2026-11-09).
RENAMED_NPCS = {
    "frail-pilgrim": "frail-passenger",
    "pilgrim": "passenger",
    "pilgrim-flowers": "passenger-flowers",
    "pilgrim-candles": "passenger-candles",
    "pilgrim-old": "passenger-old",
    "pilgrim-young": "passenger-young",
}


class Engine:
    def __init__(self, content: Content, store: Store, rng=None, clock=time.time, sandbox: bool = False):
        self.content = content
        self.store = store
        self.lock = asyncio.Lock()
        self.rng = rng or random.SystemRandom()  # the dice; tests swap in a scripted one
        self.clock = clock
        self.sandbox = sandbox
        self.fake_tv = False  # the Bench: pretend a TV is connected
        if sandbox:
            self.rng = bench.BenchDice(self.rng)
            store.enable_moments()
        snap = store.load_snapshot()
        if snap is None:
            self.state = GameState()
            preset = content.default_preset
            self._commit("system", None, [("world.loaded", {"preset": preset.id, "state": state_from_preset(preset, content)})], {})
            log.info("seeded the world from preset %s", preset.id)
        else:
            saved = snap[1]
            saved.get("stage", {}).pop("setup", None)  # the TV / no TV / online choice: the TV is always there now
            saved.get("stage", {}).pop("played", None)  # which cues had played: no longer tracked
            self.state = GameState.model_validate(saved)
            self._heist_maps()  # first: the checks below would stop at a map that's gone on purpose
            self._story_update()  # likewise, for an item, an NPC and Codex pages that are gone on purpose
            self._renamed_npcs()  # and NPCs that only changed id
            self._check_refs()
            self._add_new_maps()
            self._update_rules()
        if sandbox and not store.moments("start"):
            store.add_moment("start", bench.START_NAME, self.clock(), self.state.model_dump(mode="json"))

    def _update_rules(self) -> None:
        """A game saved under older rules, brought up to date once. Rules 1 gave each character their own health:
        whoever was at the old full 6 is at their new full, and nobody keeps more than their health. Rules 2 added
        the Codex: the default preset's entries are unlocked."""
        if self.state.rules >= RULES:
            return
        events: list[tuple[str, dict]] = []
        data: dict = {"rules": RULES}
        if self.state.rules < 1:
            hp = {}
            for c_id, c in self.content.characters.items():
                v = self.state.vitals.get(c_id)
                hp[c_id] = c.health if v is None or v.hp == 6 else min(v.hp, c.health)
            data["hp"] = hp
        if self.state.rules < 2 and not self.state.codex and self.content.default_preset.codex:
            events.append(("codex.set", {"keys": list(self.content.default_preset.codex), "unlocked": True}))
        if self.state.rules < 6 and "music-credit" in self.content.codex:
            # Rules 6 moved the music credit off the login screen: its page has to be open for the licence's sake
            events.append(("codex.set", {"keys": ["music-credit"], "unlocked": True}))
        if self.state.rules < 3 and self.content.station:
            # Rules 3 added the Station: light the default preset's places, the party map, and where the crew is
            places = {p.map for p in self.content.station.places}
            seen = list(self.content.default_preset.station) + [self.state.party_map]
            seen += [t.map for t in self.state.tokens.values() if t.kind == "crew"]
            for m in dict.fromkeys(seen):
                if m in places and m not in self.state.station:
                    events.append(("station.shown", {"map": m, "shown": True}))
        self._commit("system", None, events + [("rules.updated", data)], {})
        log.info("brought the saved game up to rules %s", RULES)

    def _heist_maps(self) -> None:
        """Rules 4: the Executive tower became four separate decks, and the Secure floor and the Bot bays were redrawn.
        Old positions mean nothing on the new art, so anyone there lands at their map's entrance (from the tower, on the
        deck they were on: each was 12.5 high). A mood the new art doesn't have becomes its first."""
        if self.state.rules >= 4:
            return
        events: list[tuple[str, dict]] = []
        landed: dict[str, int] = {}
        for tid, t in self.state.tokens.items():
            if t.map not in ("executive", "secure", "bots"):
                continue
            to = t.map if t.map != "executive" else f"deck-{6 + min(3, int((t.at[2] + 0.01) // 12.5))}"
            spots = self.content.maps[to].arrive
            n = landed.get(to, 0)
            landed[to] = n + 1
            events.append(("token.sent", {"token": tid, "map": to, "at": list(spots[n % len(spots)])}))
        for m_id, ms in self.state.maps.items():
            d = self.content.maps.get(m_id)
            if d and ms.mood not in {x.id for x in d.moods}:
                events.append(("map.mood_set", {"map": m_id, "mood": d.moods[0].id}))
        if "executive" in self.state.maps:
            if self.state.party_map == "executive":
                events.append(("party.map_set", {"map": "deck-6"}))
            if "executive" in self.state.station:
                events += [("station.shown", {"map": "executive", "shown": False}), ("station.shown", {"map": "deck-6", "shown": True})]
            events.append(("map.removed", {"map": "executive"}))
        if events:
            self._commit("system", None, events, {})

    def _story_update(self) -> None:
        """Rules 5: the content caught up with the live bible. Everyone's invitation becomes their own letter, the old
        man leaves the map, his page and the invitation's page go (the letter's page is unlocked in its place), and the
        head-count terminal, cut from deck 7, stops being shown."""
        if self.state.rules >= 5:
            return
        s, events = self.state, []
        for holder, entries in s.inventory.items():
            for e in entries:
                if e.item != "invitation":
                    continue
                events.append(("item.taken", {"holder": holder, "uid": e.uid}))
                letter = InvEntry(uid=f"{e.uid}-letter", item=f"letter-{holder}", new=e.new)
                events.append(("item.given", {"holder": holder, "entry": letter.model_dump()}))
        events += [("token.removed", {"token": tid}) for tid, t in s.tokens.items() if t.kind == "npc" and t.ref == "old-man"]
        gone = [k for k in s.codex if k in ("invitation", "old-man", "old-man/pause")]
        if gone:
            events.append(("codex.set", {"keys": gone, "unlocked": False}))
        if "invitation" in gone:
            events.append(("codex.set", {"keys": ["letter"], "unlocked": True}))
        if "deck-7" in s.maps and "head-count" in s.maps["deck-7"].shown:
            events.append(("object.shown", {"map": "deck-7", "object": "head-count", "shown": False}))
        if events:
            self._commit("system", None, events, {})

    def _renamed_npcs(self) -> None:
        """NPCs whose id changed: their tokens keep their place and take the new id. Safe to run on every boot."""
        events = [
            ("token.placed", {"token": tid, "state": {**t.model_dump(mode="json"), "ref": RENAMED_NPCS[t.ref]}})
            for tid, t in self.state.tokens.items()
            if t.kind == "npc" and t.ref in RENAMED_NPCS
        ]
        if events:
            self._commit("system", None, events, {})
            log.info("renamed %d NPC tokens", len(events))

    def _add_new_maps(self) -> None:
        """A game saved before a map existed has no state for it: give it the default preset's (or its first mood)."""
        preset = self.content.default_preset
        events = [
            ("map.added", {"map": m_id, "state": (preset.maps.get(m_id) or MapState(mood=m.moods[0].id)).model_dump()})
            for m_id, m in self.content.maps.items()
            if m_id not in self.state.maps
        ]
        if events:
            self._commit("system", None, events, {})
            log.info("added state for new maps: %s", ", ".join(e[1]["map"] for e in events))

    def _check_refs(self) -> None:
        """A renamed content id would leave state pointing at nothing. Say so at boot, loudly."""
        c, s, bad = self.content, self.state, []
        for tid, t in s.tokens.items():
            if t.ref not in (c.characters if t.kind == "crew" else c.npcs):
                bad.append(f"token {tid} -> {t.kind} {t.ref!r}")
            if t.map not in c.maps:
                bad.append(f"token {tid} -> map {t.map!r}")
        bad += [f"map state {m!r}" for m in s.maps if m not in c.maps]
        bad += [f"slots at {k!r}" for k in s.slots if not (m := c.maps.get(k.split("/")[0])) or not any(o.id == k.split("/", 1)[-1] and o.game == "slots" for o in m.objects)]
        bad += [f"inventory {h}: item {e.item!r}" for h, es in s.inventory.items() for e in es if e.item not in c.items]
        if s.party_map and s.party_map not in c.maps:
            bad.append(f"party_map {s.party_map!r}")
        if s.stage.film and s.stage.film.cue not in c.cutscenes:
            bad.append(f"film {s.stage.film.cue!r}")
        if s.stage.opening and not c.opening:
            bad.append("the opening")
        from .content import codex_keys

        bad += [f"codex {k!r}" for k in s.codex if k not in codex_keys(c)]
        places = {p.map for p in c.station.places} if c.station else set()
        bad += [f"station {m!r}" for m in s.station if m not in places]
        if s.stage.burn and s.stage.burn.char not in c.characters:
            bad.append(f"burn {s.stage.burn.char!r}")
        if s.stage.follow and s.stage.follow not in c.characters and s.stage.follow not in s.tokens:
            bad.append(f"camera follow {s.stage.follow!r}")
        for m, f in s.fights.items():
            if m not in c.maps:
                bad.append(f"fight on map {m!r}")
            bad += [f"fight on {m}: token {tid!r}" for tid in f.order if tid not in s.tokens]
        if bad:
            raise RuntimeError(
                "Saved state refers to content that no longer exists:\n  "
                + "\n  ".join(bad)
                + "\nFix the content, or load a preset into a fresh database (make reset-world)."
            )

    def _commit(self, actor: str, intent_id: str | None, events: list[tuple[str, dict]], ack: dict) -> None:
        state, seq = self.state, self.store.next_seq()
        for i, (ev_type, data) in enumerate(events):
            state = apply(state, seq + i, ev_type, data)
        dumped = state.model_dump(mode="json")
        seqs = self.store.commit(actor, intent_id, events, dumped, ack)
        assert not seqs or seqs[-1] == state.seq, "event log and state disagree on seq"
        if self.sandbox and actor != "system" and (name := bench.describe(self.content, self.state, events)):
            self.store.add_moment("auto", name, self.clock(), dumped, keep=bench.HISTORY)
        self.state = state

    async def run(self, viewer: Viewer, intent_id: str | None, kind: str, args: dict) -> tuple[dict, bool]:
        """Apply one intent. Returns (ack, changed). A retried intent id gets its first ack back."""
        async with self.lock:
            if intent_id:
                prior = self.store.find_intent(intent_id)
                if prior is not None:
                    return prior, False
            try:
                if kind.startswith("bench."):
                    bench.run(self, viewer, kind, args)
                    return {"id": intent_id, "ok": True}, True
                events = handle(viewer, self.state, self.content, kind, args, rng=self.rng, now=self.clock())
            except CommandError as e:
                return {"id": intent_id, "ok": False, "code": e.code, "error": str(e)}, False
            ack = {"id": intent_id, "ok": True}
            self._commit(viewer.seat, intent_id, events, ack)
            return ack, bool(events)

    def bench_view(self) -> dict | None:
        """What the GM's Bench shows. None on the real table, so the Bench doesn't exist there."""
        return bench.view(self) if self.sandbox else None

    async def sweep(self, online: set[str], seated: set[str] | None = None) -> bool:
        """Housekeeping the server does on its own (rolls whose roller went quiet). True if anything changed."""
        async with self.lock:
            events = sweep(self.state, self.clock(), online, self.content, seated)
            if events:
                self._commit("system", None, events, {})
            return bool(events)
