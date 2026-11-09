"""The join card: how someone at the table gets on the wifi and into the game.

It comes from the environment, so nothing about the network is in the repo, and it goes out only to the screens the
table looks at (the TV and the GM; see views._stage_view). Nobody reads it from the app before they're on the wifi, so
no login screen and no player's view ever needs it. With no LSO_JOIN_URL there is no card at all, which is what
a server on the public internet wants.
"""

from __future__ import annotations

from .config import Settings


def join_card(settings: Settings) -> dict | None:
    if not settings.join_url:
        return None
    card: dict = {"url": settings.join_url, "fallback": settings.join_fallback}
    if settings.wifi_ssid:
        card |= {"ssid": settings.wifi_ssid, "password": settings.wifi_password}
    return card
