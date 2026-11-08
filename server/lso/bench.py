"""The Bench: tools for testing in the sandbox (`make sandbox`). None of this runs unless the server starts with
LSO_SANDBOX=1, which the real table never does.

Forced dice live on the dice, not in the game. Moments are whole copies of the table: going back to one is an ordinary
`world.loaded` event, so it follows the same path as loading a preset.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .auth import Viewer
from .commands import CommandError, handle
from .state import state_from_preset

if TYPE_CHECKING:
    from .engine import Engine

START_NAME = "Your save, as copied"
HISTORY = 30  # how many recent changes can be gone back to
DICE = {"random": [], "one": [1], "boom": ["max", "stop"], "boom2": ["max", "max", "stop"]}


class BenchDice:
    """The sandbox's dice: whatever they were, except for the next roll the Bench has set."""

    def __init__(self, rng):
        self.rng = rng
        self.armed = "random"
        self.queue: list = []

    def arm(self, name: str) -> None:
        self.armed, self.queue = name, list(DICE[name])

    def randint(self, a: int, b: int) -> int:
        if not self.queue:
            return self.rng.randint(a, b)
        v = self.queue.pop(0)
        if not self.queue:
            self.armed = "random"
        if v == "max":
            return b
        if v == "stop":  # anything but the maximum, so the chain ends here
            return self.rng.randint(a, b - 1) if b > a else a
        return max(a, min(b, v))

    def randrange(self, stop: int) -> int:
        return self.rng.randrange(stop)


def describe(content, state, events: list[tuple[str, dict]]) -> str | None:
    """A line for the Bench's list of changes, or None for what isn't worth going back to (dice landing, a token nudged)."""

    def who(kind, ref):
        return content.characters[ref].short if kind == "crew" else content.npcs[ref].name

    def token(d):
        t = d.get("state") or state.tokens.get(d["token"])  # a new token's is in the event
        if t is None:
            return d["token"]
        return who(t["kind"], t["ref"]) if isinstance(t, dict) else who(t.kind, t.ref)

    def char(c):
        return content.characters[c].short

    def map_name(m):
        return content.maps[m].name

    for ev, d in events:
        if ev == "vitals.set":
            return f"{char(d['char'])}: HP {d['hp']}, Entropy {d['entropy']}"
        if ev == "npc.hp_set":
            return f"{token(d)}: HP {d['hp']}"
        if ev == "map.mood_set":
            m = content.maps[d["map"]]
            return f"{m.name}: {next((x.label for x in m.moods if x.id == d['mood']), d['mood'])}"
        if ev == "map.switch_set":
            return f"{map_name(d['map'])}: {d['switch']} {d['value']}"
        if ev == "object.shown":
            return f"{d['object']}: {'shown' if d['shown'] else 'hidden'}"
        if ev == "token.placed":
            return f"{token(d)} placed"
        if ev == "token.removed":
            return f"{token(d)} removed"
        if ev == "token.hidden_set":
            return f"{token(d)}: {'hidden' if d['hidden'] else 'shown'}"
        if ev == "token.sent":
            return f"{token(d)} sent to {map_name(d['map'])}"
        if ev == "roll.started":
            r = d["roll"]
            name = "The GM" if r["by"] == "gm" and not r.get("token") else char(r["char"]) if r.get("char") else token({"token": r["token"]})
            return f"{name} rolled {r['stat'] or 'a die'}"
        if ev == "fight.started":
            return "The fight started"
    return None


def view(e: Engine) -> dict:
    """What the Bench shows. Goes out through views.project(), to the GM only."""
    return {
        "dice": e.rng.armed,
        "tv": e.fake_tv,
        "scenarios": [{"id": s.id, "name": s.name, "note": s.note} for s in e.content.scenarios.values()],
        "start": e.store.moments("start", 1),
        "kept": e.store.moments("kept"),
        "history": e.store.moments("auto", 8),
    }


def _invalid(msg: str) -> CommandError:
    return CommandError("invalid", msg)


def run(e: Engine, viewer: Viewer, kind: str, args: dict) -> None:
    """One Bench action, under the engine's lock. The real table doesn't know these words."""
    if not e.sandbox:
        raise _invalid(f"unknown intent {kind!r}")
    if not viewer.is_gm:
        raise CommandError("forbidden", "GM only")

    if kind == "bench.dice":
        if args.get("next") not in DICE:
            raise _invalid(f"next must be one of {', '.join(DICE)}")
        e.rng.arm(args["next"])
    elif kind == "bench.tv":
        e.fake_tv = bool(args.get("on"))
    elif kind == "bench.keep":
        last = e.store.moments("auto", 1)
        name = str(args.get("name") or "").strip() or (f"After: {last[0]['name']}" if last else "The table as it was")
        e.store.add_moment("kept", name[:80], e.clock(), e.state.model_dump(mode="json"))
    elif kind == "bench.back":
        found = e.store.moment_state(args.get("id")) if isinstance(args.get("id"), int) else None
        if not found:
            raise _invalid("no such moment")
        moment_kind, state = found
        if moment_kind == "auto":
            e.store.drop_moments_after(args["id"], "auto")  # what came after it never happened
        e._commit(viewer.seat, None, [("world.loaded", {"preset": "(moment)", "state": state})], {})
    elif kind == "bench.scenario":
        sc = e.content.scenarios.get(args.get("id"))
        if not sc:
            raise _invalid("no such scenario")
        e._commit(viewer.seat, None, [("world.loaded", {"preset": sc.id, "state": state_from_preset(sc, e.content)})], {})
        for step in sc.after:
            events = handle(viewer, e.state, e.content, step.type, step.args, rng=e.rng, now=e.clock())
            e._commit(viewer.seat, None, events, {})
    elif kind == "bench.as":
        seat, what, inner = args.get("seat"), args.get("type"), args.get("args") or {}
        if seat not in e.content.characters or not isinstance(what, str) or what.startswith(("gm.", "bench.")):
            raise _invalid("bench.as runs a player's action, as one of the crew")
        events = handle(Viewer(seat, "player"), e.state, e.content, what, inner, rng=e.rng, now=e.clock())
        e._commit(seat, None, events, {})
    else:
        raise _invalid(f"unknown intent {kind!r}")
