"""Settings, read once from the environment.

Every player seat is named after its character id (lale, marlo, ...); the GM seat is "gm".
Passcodes live only in the environment (.env locally, Railway variables later), never in git.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Seat:
    id: str  # "gm" or a character id
    role: str  # "gm" | "player"
    passcode: str


@dataclass(frozen=True)
class Settings:
    secret: str
    seats: tuple[Seat, ...]
    data_dir: Path
    content_dir: Path
    assets_dir: Path
    web_dist: Path
    secure_cookies: bool = False
    auth_epoch: int = 1
    allowed_origins: tuple[str, ...] = ()

    def seat(self, seat_id: str) -> Seat | None:
        return next((s for s in self.seats if s.id == seat_id), None)


class SettingsError(RuntimeError):
    pass


def parse_passcodes(raw: str) -> tuple[Seat, ...]:
    """Parse "gm=ember-1234,lale=quiet-5678" into seats."""
    seats: list[Seat] = []
    seen: set[str] = set()
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        seat_id, _, code = part.partition("=")
        seat_id, code = seat_id.strip().lower(), code.strip()
        if not seat_id or not code:
            raise SettingsError(f"LSO_PASSCODES entry {part!r} must look like seat=passcode")
        if seat_id in seen:
            raise SettingsError(f"LSO_PASSCODES lists seat {seat_id!r} twice")
        seen.add(seat_id)
        seats.append(Seat(seat_id, "gm" if seat_id == "gm" else "player", code))
    codes = [s.passcode.lower() for s in seats]
    if len(set(codes)) != len(codes):
        raise SettingsError("LSO_PASSCODES: two seats share a passcode")
    return tuple(seats)


def _flag(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def load_settings(env: dict[str, str] | None = None) -> Settings:
    env = dict(os.environ if env is None else env)
    secret = env.get("LSO_SECRET", "").strip()
    if len(secret) < 16:
        raise SettingsError("LSO_SECRET is missing or shorter than 16 characters. Run `make env`.")
    seats = parse_passcodes(env.get("LSO_PASSCODES", ""))
    if not any(s.role == "gm" for s in seats):
        raise SettingsError("LSO_PASSCODES needs a gm=... entry. Run `make env`.")
    origins = tuple(o.strip().rstrip("/") for o in env.get("LSO_ALLOWED_ORIGINS", "").split(",") if o.strip())
    return Settings(
        secret=secret,
        seats=seats,
        data_dir=Path(env.get("LSO_DATA_DIR", ROOT / "data")),
        content_dir=Path(env.get("LSO_CONTENT_DIR", ROOT / "content")),
        assets_dir=Path(env.get("LSO_ASSETS_DIR", ROOT / "assets")),
        web_dist=Path(env.get("LSO_WEB_DIST", ROOT / "web" / "dist")),
        secure_cookies=_flag(env.get("LSO_SECURE_COOKIES")),
        auth_epoch=int(env.get("LSO_AUTH_EPOCH", "1") or 1),
        allowed_origins=origins,
    )
