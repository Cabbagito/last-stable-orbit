from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from lso.auth import COOKIE
from lso.config import ROOT, Settings, parse_passcodes
from lso.main import create_app

PASSCODES = "gm=gm-code,lale=lale-code,marlo=marlo-code,tally=tally-code,ves=ves-code,tomo=tomo-code"


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        secret="test-secret-test-secret",
        seats=parse_passcodes(PASSCODES),
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
    def login(passcode: str) -> dict:
        r = client.post("/api/login", json={"passcode": passcode})
        assert r.status_code == 200, r.text
        token = r.cookies.get(COOKIE)
        client.cookies.clear()
        return {"cookie": f"{COOKIE}={token}"}

    return login
