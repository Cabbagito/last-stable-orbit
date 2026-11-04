"""Passcode login and the signed session cookie.

A passcode identifies a seat. The cookie carries the seat id and the auth epoch;
bumping LSO_AUTH_EPOCH logs everyone out.
"""

from __future__ import annotations

import hmac
from dataclasses import dataclass

from itsdangerous import BadSignature, URLSafeTimedSerializer

from .config import Settings

COOKIE = "lso_session"
MAX_AGE = 180 * 24 * 3600  # half a year: players stay logged in for the whole campaign


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
    def __init__(self, settings: Settings):
        self.settings = settings
        self._signer = URLSafeTimedSerializer(settings.secret, salt="lso-session")

    def check_passcode(self, passcode: str) -> Viewer | None:
        given = passcode.strip().lower().encode()
        found = None
        for seat in self.settings.seats:  # compare against every seat so timing says nothing
            if hmac.compare_digest(given, seat.passcode.lower().encode()) and found is None:
                found = seat
        return Viewer(found.id, found.role) if found else None

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
        seat = self.settings.seat(str(data.get("s", "")))
        return Viewer(seat.id, seat.role) if seat else None
