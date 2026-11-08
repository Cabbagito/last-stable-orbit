"""SQLite persistence: an append-only event log plus a snapshot, written in one transaction."""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    actor TEXT NOT NULL,
    intent_id TEXT,
    type TEXT NOT NULL,
    data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS intents (
    id TEXT PRIMARY KEY,
    seat TEXT NOT NULL,
    ack TEXT NOT NULL,
    first_seq INTEGER,
    last_seq INTEGER
);
CREATE TABLE IF NOT EXISTS snapshot (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    seq INTEGER NOT NULL,
    state TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""
SCHEMA_VERSION = "1"
# the sandbox's copies of the whole table. Only a sandbox creates this: the real game's file never gets it
MOMENTS = """
CREATE TABLE IF NOT EXISTS moments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    ts REAL NOT NULL,
    state TEXT NOT NULL
);
"""


class Store:
    def __init__(self, path: Path | str):
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path), isolation_level=None, check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=NORMAL")
        self.db.executescript(SCHEMA)
        self.db.execute("INSERT OR IGNORE INTO meta VALUES ('schema_version', ?)", (SCHEMA_VERSION,))

    def close(self) -> None:
        self.db.close()

    def load_snapshot(self) -> tuple[int, dict] | None:
        row = self.db.execute("SELECT seq, state FROM snapshot WHERE id = 1").fetchone()
        return (row[0], json.loads(row[1])) if row else None

    def find_intent(self, intent_id: str) -> dict | None:
        row = self.db.execute("SELECT ack FROM intents WHERE id = ?", (intent_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def next_seq(self) -> int:
        row = self.db.execute("SELECT seq FROM sqlite_sequence WHERE name = 'events'").fetchone()
        return (row[0] if row else 0) + 1

    def commit(self, actor: str, intent_id: str | None, events: list[tuple[str, dict]], state: dict, ack: dict) -> list[int]:
        """Append events, remember the intent's ack and rewrite the snapshot, all or nothing."""
        seqs: list[int] = []
        now = time.time()
        cur = self.db.cursor()
        cur.execute("BEGIN IMMEDIATE")
        try:
            for ev_type, data in events:
                cur.execute(
                    "INSERT INTO events (ts, actor, intent_id, type, data) VALUES (?, ?, ?, ?, ?)",
                    (now, actor, intent_id, ev_type, json.dumps(data)),
                )
                seqs.append(cur.lastrowid)
            if intent_id:
                cur.execute(
                    "INSERT INTO intents (id, seat, ack, first_seq, last_seq) VALUES (?, ?, ?, ?, ?)",
                    (intent_id, actor, json.dumps(ack), seqs[0] if seqs else None, seqs[-1] if seqs else None),
                )
            cur.execute(
                "INSERT INTO snapshot (id, seq, state) VALUES (1, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET seq = excluded.seq, state = excluded.state",
                (state["seq"], json.dumps(state)),
            )
            cur.execute("COMMIT")
        except BaseException:
            cur.execute("ROLLBACK")
            raise
        return seqs

    def enable_moments(self) -> None:
        self.db.executescript(MOMENTS)

    def add_moment(self, kind: str, name: str, ts: float, state: dict, keep: int | None = None) -> None:
        """Keep a copy of the table. With `keep`, only that many of this kind stay."""
        self.db.execute("INSERT INTO moments (kind, name, ts, state) VALUES (?, ?, ?, ?)", (kind, name, ts, json.dumps(state)))
        if keep:
            self.db.execute("DELETE FROM moments WHERE kind = ? AND id NOT IN (SELECT id FROM moments WHERE kind = ? ORDER BY id DESC LIMIT ?)", (kind, kind, keep))

    def moments(self, kind: str, limit: int = 50) -> list[dict]:
        rows = self.db.execute("SELECT id, name, ts FROM moments WHERE kind = ? ORDER BY id DESC LIMIT ?", (kind, limit))
        return [{"id": r[0], "name": r[1], "at": r[2]} for r in rows]

    def moment_state(self, moment_id: int) -> tuple[str, dict] | None:
        row = self.db.execute("SELECT kind, state FROM moments WHERE id = ?", (moment_id,)).fetchone()
        return (row[0], json.loads(row[1])) if row else None

    def drop_moments_after(self, moment_id: int, kind: str) -> None:
        self.db.execute("DELETE FROM moments WHERE kind = ? AND id > ?", (kind, moment_id))

    def events(self):
        yield from self.db.execute("SELECT seq, type, data FROM events ORDER BY seq")
