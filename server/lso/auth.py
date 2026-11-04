"""Who is who: players pick their character, the GM types a passcode.

The login cookie carries the seat id and the auth epoch; bumping LSO_AUTH_EPOCH logs everyone out.
Player seats aren't secret (the table trusts each other); the GM seat is, because it sees everything.
The TV logs in as the Stage seat, picked like a crew seat. It only watches, and it fetches every film ahead.
"""

from __future__ import annotations

import hmac
from collections.abc import Iterable
from dataclasses import dataclass

from itsdangerous import BadSignature, URLSafeTimedSerializer

from .config import Settings

COOKIE = "lso_session"
MAX_AGE = 180 * 24 * 3600  # half a year: players stay logged in for the whole campaign
GM = "gm"
STAGE = "stage"  # the TV at the table: read-only, and only what everyone may see


@dataclass(frozen=True)
class Viewer:
    seat: str
    role: str  # "gm" | "player" | "stage"

    @property
    def is_gm(self) -> bool:
        return self.role == "gm"

    @property
    def is_stage(self) -> bool:
        return self.role == "stage"

    @property
    def char(self) -> str | None:
        return self.seat if self.role == "player" else None


class Auth:
    def __init__(self, settings: Settings, players: Iterable[str]):
        self.settings = settings
        self.players = frozenset(players)
        self._signer = URLSafeTimedSerializer(settings.secret, salt="lso-session")

    def check_gm(self, passcode: str) -> Viewer | None:
        given = passcode.strip().lower().encode()
        if hmac.compare_digest(given, self.settings.gm_passcode.strip().lower().encode()):
            return Viewer(GM, "gm")
        return None

    def stage(self) -> Viewer:
        return Viewer(STAGE, "stage")

    def player(self, seat: str) -> Viewer | None:
        return Viewer(seat, "player") if seat in self.players else None

    def issue(self, viewer: Viewer) -> str:
        return self._signer.dumps({"s": viewer.seat, "e": self.settings.auth_epoch})

    def read(self, token: str | None) -> Viewer | None:
        if not token:
            return None
        try:
            data = self._signer.loads(token, max_age=MAX_AGE)
        except BadSignature:
            return None
        if not isinstance(data, dict) or data.get("e") != self.settings.auth_epoch:
            return None
        seat = str(data.get("s", ""))
        if seat == GM:
            return Viewer(GM, "gm")
        return self.stage() if seat == STAGE else self.player(seat)
