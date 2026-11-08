from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from lso.auth import COOKIE
from lso.config import ROOT, Settings
from lso.main import create_app

GM_CODE = "gm-code"


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        secret="test-secret-test-secret",
        gm_passcode=GM_CODE,
        data_dir=tmp_path / "data",
        content_dir=ROOT / "content",
        assets_dir=ROOT / "assets",
        web_dist=tmp_path / "no-dist",
    )


@pytest.fixture
def app(settings):
    return create_app(settings)


@pytest.fixture
def client(app):
    # One client = one event loop. Every seat shares it and carries its own cookie header,
    # so a broadcast from one seat's socket can reach another's.
    with TestClient(app) as c:
        yield c


@pytest.fixture
def seat(client):
    def login(who: str) -> dict:
        """seat("ves") picks Ves; seat("gm") logs in with the GM passcode."""
        body = {"passcode": GM_CODE} if who == "gm" else {"seat": who}
        r = client.post("/api/login", json=body)
        assert r.status_code == 200, r.text
        token = r.cookies.get(COOKIE)
        client.cookies.clear()
        return {"cookie": f"{COOKIE}={token}"}

    return login


def place_dax(engine) -> None:
    """The default preset is the pitch, and Dax has left by then. Tests that need a visible NPC with a sheet put him back."""
    from lso.models import TokenState

    state = TokenState(kind="npc", ref="dax", map="event-horizon", at=(11.6, 1.05, 0)).model_dump()
    engine._commit("system", None, [("token.placed", {"token": "dax", "state": state})], {})
