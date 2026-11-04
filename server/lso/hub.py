"""Live connections. After every change each connection gets its own projection, and only if it changed."""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field

from fastapi import WebSocket

from .auth import Viewer
from .engine import Engine
from .views import project, referenced_assets

log = logging.getLogger("lso.hub")


@dataclass(eq=False)
class Conn:
    ws: WebSocket
    viewer: Viewer
    last_hash: str = ""
    frames: int = 0  # per-connection counter, so gaps reveal nothing about hidden activity
    visible_tokens: set[str] = field(default_factory=set)


def _dump(obj) -> str:
    return json.dumps(obj, separators=(",", ":"), sort_keys=True)


class Hub:
    def __init__(self, engine: Engine):
        self.engine = engine
        self.conns: set[Conn] = set()
        self._asset_cache: dict[str, tuple[int, set[str]]] = {}

    def add(self, ws: WebSocket, viewer: Viewer) -> Conn:
        c = Conn(ws, viewer)
        self.conns.add(c)
        return c

    def remove(self, c: Conn) -> None:
        self.conns.discard(c)

    async def _send(self, c: Conn, frame: dict) -> None:
        try:
            await c.ws.send_text(_dump(frame))
        except Exception:  # a dead socket is cleaned up by its own receive loop
            log.debug("send to %s failed", c.viewer.seat)

    async def send_view(self, c: Conn, force: bool = False) -> None:
        view = project(self.engine.state, self.engine.content, c.viewer)
        body = _dump(view)
        h = hashlib.sha256(body.encode()).hexdigest()
        if h == c.last_hash and not force:
            return
        c.last_hash = h
        c.frames += 1
        c.visible_tokens = set(view["tokens"])
        await self._send(c, {"t": "view", "v": c.frames, "view": view})

    async def broadcast(self) -> None:
        for c in list(self.conns):
            await self.send_view(c)

    async def relay_drag(self, sender: Conn, token: str, at) -> None:
        frame = {"t": "drag", "token": token, "at": list(at), "by": sender.viewer.seat}
        for c in list(self.conns):
            if c is not sender and token in c.visible_tokens:
                await self._send(c, frame)

    def allowed_assets(self, viewer: Viewer) -> set[str]:
        seq = self.engine.state.seq
        hit = self._asset_cache.get(viewer.seat)
        if hit and hit[0] == seq:
            return hit[1]
        allowed = referenced_assets(project(self.engine.state, self.engine.content, viewer))
        self._asset_cache[viewer.seat] = (seq, allowed)
        return allowed
