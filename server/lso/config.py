"""Settings, read once from the environment.

Players pick their character on the login screen; the seats are the characters in content/.
Only the GM seat has a passcode, and it lives in the environment (.env locally, Railway later).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    secret: str
    gm_passcode: str
    data_dir: Path
    content_dir: Path
    assets_dir: Path
    web_dist: Path
    secure_cookies: bool = False
    auth_epoch: int = 1
    allowed_origins: tuple[str, ...] = ()


class SettingsError(RuntimeError):
    pass


def _flag(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _legacy_gm(raw: str) -> str:
    """Older .env files had LSO_PASSCODES=gm=...,lale=...; only the gm entry still matters."""
    for part in raw.split(","):
        seat, _, code = part.partition("=")
        if seat.strip().lower() == "gm":
            return code.strip()
    return ""


def load_settings(env: dict[str, str] | None = None) -> Settings:
    env = dict(os.environ if env is None else env)
    secret = env.get("LSO_SECRET", "").strip()
    if len(secret) < 16:
        raise SettingsError("LSO_SECRET is missing or shorter than 16 characters. Run `make env`.")
    gm = env.get("LSO_GM_PASSCODE", "").strip() or _legacy_gm(env.get("LSO_PASSCODES", ""))
    if not gm:
        raise SettingsError("LSO_GM_PASSCODE is missing. Run `make env`.")
    origins = tuple(o.strip().rstrip("/") for o in env.get("LSO_ALLOWED_ORIGINS", "").split(",") if o.strip())
    return Settings(
        secret=secret,
        gm_passcode=gm,
        data_dir=Path(env.get("LSO_DATA_DIR", ROOT / "data")),
        content_dir=Path(env.get("LSO_CONTENT_DIR", ROOT / "content")),
        assets_dir=Path(env.get("LSO_ASSETS_DIR", ROOT / "assets")),
        web_dist=Path(env.get("LSO_WEB_DIST", ROOT / "web" / "dist")),
        secure_cookies=_flag(env.get("LSO_SECURE_COOKIES")),
        auth_epoch=int(env.get("LSO_AUTH_EPOCH", "1") or 1),
        allowed_origins=origins,
    )
