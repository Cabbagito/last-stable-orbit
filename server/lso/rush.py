"""Sarge's rush, played out from its seed and the cook's serves.

The prototype (LSO — Sarge's rush, board Main) ran the shift in the browser on a 100 ms tick, drawing tickets and
Sarge's lines with Math.random. Here every draw comes from the shift's seed instead, so the same seed and the same
serves give the same shift anywhere: on the server (for the tally), on the cook's laptop (at once, without waiting
for the round trip) and on the TV. `web/src/rush/sim.ts` is this file in TypeScript, line for line, and
`web/src/rush/sim.fixture.json` holds shifts both must play out the same (test_rush.py writes and checks it).

All times are whole milliseconds after clocking in, so both languages count them the same way.
"""

from __future__ import annotations

from .models import RushGame, RushServe

M32 = 0xFFFFFFFF


class Mulberry32:
    """A small seeded generator (mulberry32) that's easy to write the same in Python and JavaScript."""

    def __init__(self, seed: int):
        self.a = seed & M32

    def __call__(self) -> float:
        self.a = (self.a + 0x6D2B79F5) & M32
        a = self.a
        t = ((a ^ (a >> 15)) * (1 | a)) & M32
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & M32)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296


def ms(seconds: float) -> int:
    return round(seconds * 1000)


def rank(g: RushGame, score: int):
    """The best rank this score reaches. Score is bowls out, minus wrong bowls, minus lost tickets."""
    return next(r for r in g.ranks if score >= r.min)


def _same(a: list[str], b: list[str]) -> bool:
    return len(a) == len(b) and all(x in b for x in a)


def simulate(g: RushGame, seed: int, serves: list[RushServe] | list[dict], upto: int) -> dict:
    """The shift as it stands `upto` ms after clocking in. Serves at or before a tick land before it."""
    rnd = Mulberry32(seed)

    def pick(a: list):
        return a[int(rnd() * len(a))]

    SHIFT, R0, R1, LAST, GAP, TICK, RED = ms(g.shift), ms(g.rush[0]), ms(g.rush[1]), ms(g.last), ms(g.gap), ms(g.tick), ms(g.red)
    L = g.lines
    tops = g.ids("toppings")
    s = {
        "slots": [None, None, None, None], "free": [-9000] * 4, "next": ms(g.first), "count": 0, "gran": False, "csat": False,
        "rushed": False, "out": 0, "wrong": 0, "lost": 0, "bark": L.start, "red_until": -1, "done": False, "rank": None,
        "cues": [{"at": 0, "kind": "start", "key": "start"}],
    }

    def cue(at: int, kind: str, key: str):
        s["cues"].append({"at": at, "kind": kind, "key": key})

    def make(el: int) -> dict:
        s["count"] += 1
        tid = s["count"]
        if not s["gran"] and el >= ms(g.gran.at):
            s["gran"] = True
            tk = {"kind": "gran", "n": g.gran.noodle, "b": g.gran.broth, "t": list(g.gran.toppings), "pat": ms(g.gran.patience)}
        elif not s["csat"] and el >= ms(g.csat.at):
            s["csat"] = True
            tk = {"kind": "csat", "n": None, "b": None, "t": [], "pat": ms(g.csat.patience)}
        else:
            rush = R0 <= el < R1
            k = (3 if rnd() < g.three else 2) if rush else (1 if el < ms(g.easy) else (2 if rnd() < g.two else 1))
            pool, t = list(tops), []
            while len(t) < k:
                t.append(pool.pop(int(rnd() * len(pool))))
            n = pick(g.noodles)[0]
            b = pick(g.broths)[0]
            tk = {"kind": "std", "n": n, "b": b, "t": t, "pat": ms(g.patience.rush if rush else g.patience.calm)}
        tk["id"], tk["born"] = tid, el
        return tk

    def call(tk: dict) -> str:
        name = dict(g.noodles + g.broths + g.toppings)
        if tk["kind"] == "gran":
            return L.call_gran.replace("{id}", str(tk["id"]))
        if tk["kind"] == "csat":
            return L.call_csat.replace("{id}", str(tk["id"]))
        return (L.call.replace("{id}", str(tk["id"])).replace("{noodle}", name[tk["n"]]).replace("{broth}", name[tk["b"]])
                .replace("{toppings}", ". ".join(name[x] for x in tk["t"])))

    def tick(el: int):
        was_red = el < s["red_until"]
        reddened = False
        for i, tk in enumerate(s["slots"]):
            if tk and el - tk["born"] >= tk["pat"]:
                s["free"][i] = el
                s["slots"][i] = None
                if tk["kind"] == "csat":
                    s["bark"] = L.droid_left
                    cue(el, "droid_left", f"l{tk['id']}")
                else:
                    s["lost"] += 1
                    s["bark"] = pick(L.gone)
                    reddened = True
                    cue(el, "lost", f"l{tk['id']}")
        if reddened and not was_red:
            s["red_until"] = el + RED
        if el >= SHIFT:
            score = s["out"] - s["wrong"] - s["lost"]
            r = rank(g, score)
            s.update(done=True, slots=[None] * 4, red_until=-1, rank=r.rank, bark=L.cease + r.line)
            cue(el, "end", "end")
            return
        if not s["rushed"] and el >= R0:
            s["rushed"] = True
            s["bark"] = L.rush
            cue(el, "rush", "rush")
        if el >= s["next"] and el < LAST:
            i = next((j for j, tk in enumerate(s["slots"]) if not tk and el - s["free"][j] >= GAP), -1)
            if i >= 0:
                tk = make(el)
                s["slots"][i] = tk
                s["bark"] = call(tk)
                cue(el, "ticket", f"t{tk['id']}")
                s["next"] = el + ms(g.every.after if el >= R1 else g.every.rush if el >= R0 else g.every.calm)

    def serve(sv: dict):
        el, key = sv["at"], f"s{sv['k']}"
        n, b, t = sv.get("n"), sv.get("b"), list(sv.get("t") or [])
        if not n and not b and not t:
            s["bark"] = L.empty
            cue(el, "empty", key)
            return
        idx, best = -1, None
        for i, tk in enumerate(s["slots"]):
            if tk and tk["kind"] != "csat" and tk["n"] == n and tk["b"] == b and _same(tk["t"], t) and (best is None or tk["born"] < best):
                idx, best = i, tk["born"]
        if idx < 0 and n and b:
            idx = next((i for i, tk in enumerate(s["slots"]) if tk and tk["kind"] == "csat"), -1)
        if idx >= 0:
            tk = s["slots"][idx]
            s["slots"][idx] = None
            s["free"][idx] = el
            if tk["kind"] == "csat":
                s["bark"] = L.droid_served
            else:
                s["out"] += 1
                s["bark"] = L.usual if tk["kind"] == "gran" else pick(L.ok)
            cue(el, "ok", key)
            return
        open_ = [tk for tk in s["slots"] if tk]
        only_gran = bool(open_) and all(tk["kind"] == "gran" for tk in open_)
        s["wrong"] += 1
        s["red_until"] = el + RED
        s["bark"] = L.not_usual if only_gran else pick(L.bad)
        cue(el, "wrong", key)

    queue = sorted((x.model_dump() if isinstance(x, RushServe) else dict(x) for x in serves), key=lambda x: (x["at"], x["k"]))
    qi, k = 0, 1
    while True:
        at = k * TICK
        while qi < len(queue) and queue[qi]["at"] <= min(at, upto) and not s["done"]:
            serve(queue[qi])
            qi += 1
        if at > upto or s["done"]:
            break
        tick(at)
        k += 1

    done = s["done"]
    return {
        "el": min(upto, SHIFT),
        "done": done,
        "slots": s["slots"],
        "bark": s["bark"],
        "red": upto < s["red_until"],
        "out": s["out"],
        "wrong": s["wrong"],
        "lost": s["lost"],
        "score": s["out"] - s["wrong"] - s["lost"],
        "rank": s["rank"],
        "rush": not done and R0 <= upto < R1,
        "cues": s["cues"],
    }
