"""A test game for Round 16's screenshots: session 1 at the Event Horizon, two hired guns at the founder's table (shown) and
a guard by the door (still hidden); Ves split off on the Promenade with a guard of her own. Run from server/: PYTHONPATH=. uv run python ../scripts/fight_test_game.py <data dir>, then start a test server on that data dir (see CLAUDE.md for the two-seat trick)."""

import asyncio
import sys
from pathlib import Path

from lso.auth import Viewer
from lso.config import ROOT
from lso.content import load_content
from lso.engine import Engine
from lso.store import Store

DATA = Path(sys.argv[1])
DATA.mkdir(parents=True, exist_ok=True)
GM = Viewer("gm", "gm")


async def main():
    content = load_content(ROOT / "content", ROOT / "assets")
    store = Store(DATA / "lso.db")
    e = Engine(content, store)

    async def run(kind, args):
        ack, _ = await e.run(GM, None, kind, args)
        assert ack["ok"], (kind, ack)

    await run("gm.token.place", {"ref": "hired-gun", "map": "event-horizon", "at": [5.7, 6.3, 0], "hidden": False})
    await run("gm.token.place", {"ref": "hired-gun", "map": "event-horizon", "at": [4.3, 7.1, 0], "hidden": False})
    await run("gm.token.place", {"ref": "guard", "map": "event-horizon", "at": [10.6, 11.2, 0], "hidden": True})
    await run("gm.token.place", {"ref": "guard", "map": "promenade", "at": [3.4, 3.6, 0], "hidden": False})
    await run("gm.vitals.set", {"char": "tomo", "hp": 7})
    # Ves has wandered off to the Promenade (test data only: there's no command to send one of the crew alone)
    ves = next(t for t in e.state.tokens.values() if t.ref == "ves")
    ves.map, ves.at = "promenade", (2.2, 4.4, 0)
    store.commit("system", None, [], e.state.model_dump(mode="json"), {})
    print({tid: (t.ref, t.map, t.hidden) for tid, t in e.state.tokens.items() if t.map in ("event-horizon", "promenade")})


asyncio.run(main())
