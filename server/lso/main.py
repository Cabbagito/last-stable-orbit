"""HTTP and WebSocket entry points."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .auth import COOKIE, MAX_AGE, Auth, Viewer
from .commands import CommandError, check_drag
from .config import Settings, load_settings
from .content import load_content
from .engine import Engine
from .hub import Hub
from .join import join_card
from .store import Store
from .views import url

log = logging.getLogger("lso")
PUBLIC_ASSET_DIRS = ("icons/",)  # stat icons, dice, items: no spoilers, any logged-in seat may fetch
SWEEP_EVERY = 0.25  # seconds between housekeeping passes: a slot machine's stand window closes on one of these
AWAY_AFTER = 15.0  # a seat with no socket for this long counts as gone (a Wi-Fi blip doesn't)
KEEP_MACHINE_FOR = 120.0  # a player with no socket for this long loses their slot machine (a laptop nap doesn't)


async def sweeper(engine: Engine, hub: Hub) -> None:
    """Reveal or close rolls whose roller's screen went quiet (laptop asleep, tab closed)."""
    last_seen: dict[str, float] = {}
    booted = time.time()
    while True:
        await asyncio.sleep(SWEEP_EVERY)
        try:
            now = time.time()
            for s in hub.online():
                last_seen[s] = now
            online = {seat for seat, t in last_seen.items() if now - t < AWAY_AFTER}
            # right after a restart nobody has reconnected yet: give them the same grace before freeing machines
            seated = None if now - booted < KEEP_MACHINE_FOR else {seat for seat, t in last_seen.items() if now - t < KEEP_MACHINE_FOR}
            if await engine.sweep(online, seated):
                await hub.broadcast()
        except Exception:
            log.exception("roll sweep failed")


class LoginBody(BaseModel):
    seat: str | None = None  # a character id: players just pick who they are. "stage": the TV
    passcode: str | None = None  # the GM's passcode


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        content = load_content(settings.content_dir, settings.assets_dir)
        store = Store(settings.data_dir / "lso.db")
        engine = Engine(content, store)
        app.state.auth = Auth(settings, content.characters)
        # the character picker shows the crew before anyone is logged in
        app.state.login_assets = {c.portrait for c in content.characters.values()}
        app.state.engine = engine
        app.state.hub = Hub(engine, join_card(settings))
        log.info("ready: %d maps, %d tokens, seq %d", len(content.maps), len(engine.state.tokens), engine.state.seq)
        sweep_task = asyncio.create_task(sweeper(engine, app.state.hub))
        yield
        sweep_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await sweep_task
        store.close()

    app = FastAPI(title="Last Stable Orbit", lifespan=lifespan, docs_url=None, redoc_url=None)

    def viewer_from(request: Request) -> Viewer | None:
        return request.app.state.auth.read(request.cookies.get(COOKIE))

    def me_json(v: Viewer) -> dict:
        return {"seat": v.seat, "role": v.role, "char": v.char}

    @app.get("/healthz")
    async def healthz():
        return {"ok": True}

    @app.get("/api/seats")
    async def seats(request: Request):
        """The character picker: who can be chosen, and who is already on board."""
        engine: Engine = request.app.state.engine
        online = request.app.state.hub.online()
        return {
            "crew": [
                {"id": c.id, "name": c.name, "short": c.short, "role": c.role, "portrait": url(c.portrait), "color": c.color, "online": c.id in online}
                for c in engine.content.characters.values()
            ],
            "gm_online": "gm" in online,
        }

    @app.post("/api/login")
    async def login(body: LoginBody, request: Request, response: Response):
        auth: Auth = request.app.state.auth
        if body.seat == "stage":
            v = auth.stage()  # the TV: picked like a seat, no passcode (Peter's call)
        elif body.seat and body.seat != "gm":
            v = auth.player(body.seat)
            if not v:
                raise HTTPException(404, "No one by that name is on this crew.")
        else:
            v = auth.check_gm(body.passcode or "")
            if not v:
                raise HTTPException(401, "That passcode doesn't open anything.")
        response.set_cookie(
            COOKIE,
            request.app.state.auth.issue(v),
            max_age=MAX_AGE,
            httponly=True,
            samesite="lax",
            secure=settings.secure_cookies,
            path="/",
        )
        return me_json(v)

    @app.get("/api/me")
    async def me(request: Request):
        v = viewer_from(request)
        if not v:
            raise HTTPException(401, "Not logged in")
        return me_json(v)

    @app.post("/api/logout")
    async def logout(response: Response):
        response.delete_cookie(COOKIE, path="/")
        return {"ok": True}

    @app.get("/assets/{path:path}")
    async def asset(path: str, request: Request):
        v = viewer_from(request)
        root = settings.assets_dir.resolve()
        f = (root / path).resolve()
        rel = f.relative_to(root).as_posix() if f.is_relative_to(root) else ""
        if not v:
            if rel in request.app.state.login_assets and f.is_file():
                return FileResponse(f, headers={"Cache-Control": "private, max-age=86400"})
            raise HTTPException(401)
        if not rel or not f.is_file():
            raise HTTPException(404)
        if not v.is_gm and not rel.startswith(PUBLIC_ASSET_DIRS) and rel not in request.app.state.hub.allowed_assets(v):
            raise HTTPException(404)  # same answer as a missing file: guessing a URL tells you nothing
        return FileResponse(f, headers={"Cache-Control": "private, max-age=86400"})

    def origin_ok(ws: WebSocket) -> bool:
        origin = ws.headers.get("origin")
        if not origin:
            return True  # not a browser; the cookie still has to be valid
        if origin.rstrip("/") in settings.allowed_origins:
            return True
        return urlsplit(origin).netloc == ws.headers.get("host", "")

    @app.websocket("/ws")
    async def ws_endpoint(ws: WebSocket):
        await ws.accept()
        viewer = ws.app.state.auth.read(ws.cookies.get(COOKIE))
        if viewer is None or not origin_ok(ws):
            await ws.close(code=4401, reason="login required")
            return
        view_as = ws.query_params.get("as")
        if view_as is not None:
            # "View as player" (/ws?as=tally): the GM gets that seat's own feed, read-only
            if not viewer.is_gm:
                await ws.close(code=4403, reason="only the GM can view as a player")
                return
            # "/ws?as=stage": what the TV shows, for the GM tab's preview
            viewer = ws.app.state.auth.stage() if view_as == "stage" else ws.app.state.auth.player(view_as)
            if viewer is None:
                await ws.close(code=4404, reason="no one by that name is on this crew")
                return
        hub: Hub = ws.app.state.hub
        engine: Engine = ws.app.state.engine
        conn = hub.add(ws, viewer, preview=view_as is not None)
        read_only = conn.preview or viewer.is_stage  # the TV, and the GM looking through someone's screen, only watch
        try:
            await hub.send_view(conn, force=True)
            if viewer.is_stage and not conn.preview:
                await hub.broadcast()  # the GM tab says the TV is connected
            while True:
                try:
                    msg = json.loads(await ws.receive_text())
                except json.JSONDecodeError:
                    continue
                if not isinstance(msg, dict):
                    continue
                t = msg.get("t")
                if t == "ping":
                    await ws.send_text(json.dumps({"t": "pong", "now": round(time.time(), 3)}))
                elif t == "resync":
                    await hub.send_view(conn, force=True)
                elif t == "intent":
                    kind, args, iid = msg.get("type"), msg.get("args") or {}, msg.get("id")
                    if not isinstance(kind, str) or (iid is not None and not isinstance(iid, str)):
                        continue
                    if read_only:  # looking only: nothing done here may act as anyone
                        if kind != "token.drag":
                            why = "The TV only shows the game" if viewer.is_stage and not conn.preview else "This is a read-only view"
                            await ws.send_text(json.dumps({"t": "ack", "id": iid, "ok": False, "code": "read_only", "error": why}))
                        continue
                    if kind == "token.drag":  # live, unlogged, relayed to whoever can see the token
                        try:
                            token, at = check_drag(viewer, engine.state, args if isinstance(args, dict) else {})
                        except CommandError:
                            continue
                        await hub.relay_drag(conn, token, at)
                        continue
                    ack, changed = await engine.run(viewer, iid, kind, args)
                    if changed:
                        await hub.broadcast()  # views first, so the sender's ack lands on fresh state
                    await ws.send_text(json.dumps({"t": "ack", **ack}))
        except WebSocketDisconnect:
            pass
        finally:
            hub.remove(conn)
            if viewer.is_stage and not conn.preview:
                with contextlib.suppress(Exception):
                    await hub.broadcast()  # the GM tab says the TV went away

    dist = settings.web_dist

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path.startswith(("api/", "assets/", "ws")):
            raise HTTPException(404)
        index = dist / "index.html"
        if not index.is_file():
            return JSONResponse({"error": "web app not built; use the vite dev server on :5173"}, status_code=404)
        f = (dist / path).resolve()
        if path and f.is_relative_to(dist.resolve()) and f.is_file():
            cache = "public, max-age=31536000, immutable" if path.startswith("assets-web/") else "no-cache"
            return FileResponse(f, headers={"Cache-Control": cache})
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    return app


def app_factory() -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    return create_app()
