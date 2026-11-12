#!/usr/bin/env python3
"""Make the Bot bays' Alert art: the red-lit deck with the mech and its tarp gone from the repair frame.

Day and Night keep the mech under its tarp, which is how the crew find it on day 2 and on heist night. Alert is
session 4, when the mercenaries have taken it. The work is done on the Night image, where the floor is easy to tell
from the tarp: the floor under it is cloned from the same floor elsewhere (tiles repeat every world unit), and the
frame's two hidden hazard stripes are carried on along their own length. Each new pixel is then given Alert's light,
taken from the nearest pixel of the same Night colour in the Alert art as it was imported. Run it from the repo root:

    uv run --no-project --with pillow python scripts/empty_bot_frame.py

It rewrites assets/maps/bots/base-alert.png and updates its sha256 and size in assets/manifest.yaml.
"""

import hashlib
import io
import re
import subprocess
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw

IMPORTED = "fb091fc"  # the last commit with the Alert art as it came from the Heist maps canvas, the mech in the frame
SRC = "assets/maps/bots/base-night.png"
ALERT = "assets/maps/bots/base-alert.png"
OX, OY = 460, 150

# The frame on the floor, in world units, read off the art.
X0, X1, Y0, Y1 = 11.65, 17.0, 2.72, 7.0
STRIPE = 0.13  # half the width of a hazard stripe, in world units

# Around the tarp and what shows beside it, in art pixels. Crop (620, 300), 5x, is how these were read.
TARP = [(360, 255), (500, 180), (650, 205), (715, 125), (840, 145), (842, 305), (810, 325), (975, 395), (990, 505), (1000, 620), (1040, 690), (1000, 800), (830, 880), (650, 880), (515, 815), (385, 745), (262, 660), (342, 530), (372, 440), (352, 300)]
TARP = [(620 + x / 5, 300 + y / 5) for x, y in TARP]


def world(x: int, y: int) -> tuple[float, float]:
    a, b = (x - OX) / 30, (y - OY) / 15
    return (a + b) / 2, (b - a) / 2


def over_tarp(x: int, y: int) -> tuple[bool, bool]:
    """The front post, and the front beam or the rear rail. All three are drawn over the tarp, so they stay."""
    cx, cy = (x - 620) * 5, (y - 300) * 5
    post = 665 <= cx <= 735 and cy >= 490
    band = (0.5 * cx + 130 <= cy <= 0.5 * cx + 196 and cx <= 745) or (-0.445 * cx + 425 <= cy <= -0.445 * cx + 492)
    return post, band


def imported(path: str) -> Image.Image:
    data = subprocess.run(["git", "show", f"{IMPORTED}:{path}"], check=True, capture_output=True).stdout
    return Image.open(io.BytesIO(data)).convert("RGB")


def main() -> None:
    img = Image.open(SRC).convert("RGB")
    px = img.load()
    shape = Image.new("L", img.size, 0)
    ImageDraw.Draw(shape).polygon(TARP, fill=255)
    area = shape.load()
    x0, y0, x1, y1 = shape.getbbox()
    def in_front(x: int, y: int) -> bool:
        post, band = over_tarp(x, y)
        r, _, b = px[x, y]
        return post or (band and r - b < 18)  # along the beam and rail, whatever is still tarp-coloured goes

    hole = {(x, y) for x in range(x0, x1) for y in range(y0, y1) if area[x, y] and not in_front(x, y)}
    keep_out = hole | {(x, y) for x in range(x0 - 10, x1 + 10) for y in range(y0 - 10, y1 + 10) if over_tarp(x, y)[0] or over_tarp(x, y)[1]}

    # the floor is one repeating tile, so each pixel takes the commonest colour at its place in the tile
    def phase(x: int, y: int) -> tuple[int, int]:
        k = y // 15
        return (x - 30 * k) % 60, y - 15 * k

    def tile(sample) -> dict[tuple[int, int], tuple[int, int, int]]:
        seen: dict[tuple[int, int], Counter] = {}
        for x in range(560, 960):
            for y in range(260, 560):
                if (x, y) not in keep_out and not any(over_tarp(x, y)) and sample(*world(x, y)) and px[x, y][0] - px[x, y][2] < 0:
                    seen.setdefault(phase(x, y), Counter())[px[x, y]] += 1
        return {k: c.most_common(1)[0][0] for k, c in seen.items() if sum(c.values()) >= 3}  # never a stray speck

    in_frame = tile(lambda wx, wy: X0 + 0.3 <= wx <= X1 - 0.3 and Y0 + 0.3 <= wy <= Y1 - 0.3)
    round_it = tile(lambda wx, wy: (12.3 <= wx <= 13.7 and 0.7 <= wy <= 1.9) or (8.2 <= wx <= 11.0 and 2.6 <= wy <= 3.9))
    out = img.copy()
    done = out.load()
    for x, y in hole:
        wx, wy = world(x, y)
        floor = in_frame if X0 <= wx <= X1 and Y0 <= wy <= Y1 else round_it
        u, v = phase(x, y)
        near = sorted(floor, key=lambda k: min(abs(k[0] - u), 60 - abs(k[0] - u)) ** 2 + (k[1] - v) ** 2)
        done[x, y] = floor[near[0]]

    # the two stripes the tarp hid: each is carried on from the part of it that shows
    def carry(on_stripe, step: tuple[int, int]) -> None:
        cells = [(x, y) for x, y in hole if on_stripe(*world(x, y))]
        for x, y in sorted(cells, key=lambda p: (p[0] * step[0] + p[1] * step[1]), reverse=True):
            sx, sy = x + step[0], y + step[1]
            for _ in range(12):
                if (sx, sy) not in keep_out:
                    done[x, y] = px[sx, sy]
                    break
                sx, sy = sx + step[0], sy + step[1]

    near_x = lambda wx, wy: abs(wx - X0) <= STRIPE and wy >= Y0 - STRIPE
    near_y = lambda wx, wy: abs(wy - Y0) <= STRIPE and wx >= X0 - STRIPE
    carry(near_x, (-PERIOD_X[0], PERIOD_X[1]))
    carry(near_y, PERIOD_Y)
    # the rear post's foot, which only the tarp hid: the front post's, at the same height from the floor
    for x in range(722, 738):
        for y in range(330, 372):
            if (x, y) in hole:
                r, g, b = px[x + 30, y + 145]
                if r > 150 and b < 90 or r + g + b < 60:
                    done[x, y] = (r, g, b)
    relit = relight(px, done, hole, (x0, y0, x1, y1))
    relit.save(ALERT, optimize=True)
    data = Path(ALERT).read_bytes()
    manifest = Path("assets/manifest.yaml")
    rel = ALERT.removeprefix("assets/")
    pattern = re.compile(rf'(  - path: {re.escape(rel)}.*\n(?:    (?!sha256).*\n)*?    sha256: ")[0-9a-f]+("\n    bytes: )\d+')
    text, n = pattern.subn(lambda m: f"{m.group(1)}{hashlib.sha256(data).hexdigest()}{m.group(2)}{len(data)}", manifest.read_text())
    assert n == 1, rel
    manifest.write_text(text)


def relight(night, empty, hole: set[tuple[int, int]], box: tuple[int, int, int, int]) -> Image.Image:
    """The Alert art with the hole filled: each new pixel takes Alert's colour at the nearest pixel around the hole
    whose Night colour is the one the hole now has there, so the red light falls on the bare floor as it does beside it."""
    alert = imported(ALERT)
    lit = alert.load()
    x0, y0, x1, y1 = box
    around: dict[tuple[int, int, int], list[tuple[int, int]]] = {}
    for x in range(x0 - 70, x1 + 70):
        for y in range(y0 - 70, y1 + 70):
            if (x, y) not in hole and night[x, y] != (0, 0, 0):
                around.setdefault(night[x, y], []).append((x, y))
    for x, y in hole:
        c = empty[x, y]
        if c not in around:  # a colour only the tarp hid: the closest one that does show
            c = min(around, key=lambda k: sum((a - b) ** 2 for a, b in zip(k, c)))
        qx, qy = min(around[c], key=lambda q: (q[0] - x) ** 2 + (q[1] - y) ** 2)
        lit[x, y] = lit[qx, qy]
    return alert


PERIOD_X = (44, 22)  # one light and dark stripe along each edge, in art pixels
PERIOD_Y = (44, 22)

if __name__ == "__main__":
    main()
