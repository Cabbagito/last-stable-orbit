"""The join card: how someone at the table gets on the wifi and into the game.

It comes from the environment, so nothing about the network is in the repo, and it goes out only to the screens the
table looks at (the TV and the GM; see views._stage_view). Nobody reads it from the app before they're on the wifi, so
no login screen and no player's view ever needs it. With no LSO_JOIN_URL there is no card at all, which is what
a server on the public internet wants.
"""

from __future__ import annotations

import segno
from segno.helpers import make_wifi_data

from .config import Settings


def _qr(data: str) -> dict:
    """A QR code as one SVG path, so the web app needs no QR library: `size` modules a side, with no quiet zone."""
    rows = segno.make(data, error="m").matrix
    runs = []
    for y, row in enumerate(rows):
        x = 0
        while x < len(row):
            if not row[x]:
                x += 1
                continue
            start = x
            while x < len(row) and row[x]:
                x += 1
            runs.append(f"M{start} {y}h{x - start}v1h-{x - start}z")
    return {"size": len(rows), "path": "".join(runs)}


def join_card(settings: Settings) -> dict | None:
    if not settings.join_url:
        return None
    card: dict = {"url": settings.join_url, "url_qr": _qr(settings.join_url), "fallback": settings.join_fallback}
    if settings.wifi_ssid:
        security = "WPA" if settings.wifi_password else None
        card |= {
            "ssid": settings.wifi_ssid,
            "password": settings.wifi_password,
            "wifi_qr": _qr(make_wifi_data(settings.wifi_ssid, settings.wifi_password or None, security)),
        }
    return card
