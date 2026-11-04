"""HTTP and WebSocket entry points."""

from __future__ import annotations

import json
import logging
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
from .store import Store

log = logging.getLogger("lso")
PUBLIC_ASSET_DIRS = ("icons/",)  # stat icons, dice, items: no spoilers, any logged-in seat may fetch


class LoginBody(BaseModel):
    passcode: str


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        content = load_content(settings.content_dir, settings.assets_dir)
        unknown = [s.id for s in settings.seats if s.role == "player" and s.id not in content.characters]
        if unknown:
            raise RuntimeError(f"LSO_PASSCODES has seats with no character: {unknown}")
        store = Store(settings.data_dir / "lso.db")
        engine = Engine(content, store)
        app.state.auth = Auth(settings)
        app.state.engine = engine
        app.state.hub = Hub(engine)
        log.info("ready: %d maps, %d tokens, seq %d", len(content.maps), len(engine.state.tokens), engine.state.seq)
        yield
        store.close()

    app = FastAPI(title="Last Stable Orbit", lifespan=lifespan, docs_url=None, redoc_url=None)

    def viewer_from(request: Request) -> Viewer | None:
        return request.app.state.auth.read(request.cookies.get(COOKIE))

    def me_json(v: Viewer) -> dict:
        return {"seat": v.seat, "role": v.role, "char": v.char}

    @app.get("/healthz")
    async def healthz():
        return {"ok": True}

    @app.post("/api/login")
    async def login(body: LoginBody, request: Request, response: Response):
        v = request.app.state.auth.check_passcode(body.passcode)
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
        if not v:
            raise HTTPException(401)
        root = settings.assets_dir.resolve()
        f = (root / path).resolve()
        if not f.is_relative_to(root) or not f.is_file():
            raise HTTPException(404)
        rel = f.relative_to(root).as_posix()
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
        hub: Hub = ws.app.state.hub
        engine: Engine = ws.app.state.engine
        conn = hub.add(ws, viewer)
        try:
            await hub.send_view(conn, force=True)
            while True:
                try:
                    msg = json.loads(await ws.receive_text())
                except json.JSONDecodeError:
                    continue
                if not isinstance(msg, dict):
                    continue
                t = msg.get("t")
                if t == "ping":
                    await ws.send_text('{"t":"pong"}')
                elif t == "resync":
                    await hub.send_view(conn, force=True)
                elif t == "intent":
                    kind, args, iid = msg.get("type"), msg.get("args") or {}, msg.get("id")
                    if not isinstance(kind, str) or (iid is not None and not isinstance(iid, str)):
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
