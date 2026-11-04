"""Who is who: players pick their character, the GM types a passcode.

The login cookie carries the seat id and the auth epoch; bumping LSO_AUTH_EPOCH logs everyone out.
Player seats aren't secret (the table trusts each other); the GM seat is, because it sees everything.
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


@dataclass(frozen=True)
class Viewer:
    seat: str
    role: str  # "gm" | "player"

    @property
    def is_gm(self) -> bool:
        return self.role == "gm"

    @property
    def char(self) -> str | None:
        return None if self.is_gm else self.seat


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
        return Viewer(GM, "gm") if seat == GM else self.player(seat)
