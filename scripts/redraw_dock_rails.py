#!/usr/bin/env python3
"""Redraw the queue rails at Dock 7 on the Promenade's art, from the art as imported from the Maps canvas.

The imported rope ran as one zigzag, which left three lanes that didn't connect. This makes it one queue of four lanes:
a new set of rails along the wall gives the fourth lane, the plaza side is shut, and the only two openings are at the
dock end, in from the gangway at the front lane and out at the clerk's desk from the new lane. Each inner rope stops
one post short of the wall at alternating ends, so the line turns there. Run it from the repo root:

    uv run --no-project --with pillow python scripts/redraw_dock_rails.py

It rewrites the Promenade's two bases and two glows and updates their sha256 and size in assets/manifest.yaml.
"""

import hashlib
import io
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

IMPORTED = "1c382ba"  # the last commit with the art as it came from the Maps canvas
ART = "assets/maps/promenade"
MOODS = {"calm": (184, 171, 254), "hunted": (185, 168, 255)}  # each with its old rope's exact colour

# World X of the five posts along each rope, and world Y of the four ropes. Art origin (360, 190), as in proj.ts.
XS = (3.0, 4.65, 6.3, 7.95, 9.6)
YS = (2.27, 3.97, 5.67, 7.37)
POST_HEIGHT = 0.92  # world Z of the top of a post
POST_PX = 29  # art pixels from a post's foot to its top

# The new set of rails along the wall, row -1: four posts, because the crate at the wall takes the fifth place.
TOP = -1
TOP_Y = 0.57
TOP_COLS = range(4)
GONE = (4, 0)  # the third lane now ends at column 3, so this post goes

# Posts are (column, row) into XS and YS. Each pair of posts is one length of rope.
OLD_ROPES = [
    *(((c, 0), (c + 1, 0)) for c in range(4)),
    ((4, 0), (4, 1)),
    *(((c, 1), (c + 1, 1)) for c in range(4)),
    ((0, 1), (0, 2)),
    *(((c, 2), (c + 1, 2)) for c in range(4)),
    ((4, 2), (4, 3)),
    *(((c, 3), (c + 1, 3)) for c in range(4)),
]
NEW_ROPES = [
    *(((c, 3), (c + 1, 3)) for c in range(4)),  # the front rope, the whole way
    ((4, 3), (4, 2)),  # the plaza side, closing the front and second lanes
    ((4, 2), (4, 1)),
    *(((c, 2), (c + 1, 2)) for c in range(3)),  # stops one post short at the plaza end: the first turn
    *(((c, 1), (c + 1, 1)) for c in range(1, 4)),  # stops one post short at the dock end: the second turn
    ((0, 2), (0, 1)),  # the dock side, closing the second and third lanes
    ((0, 1), (0, 0)),
    *(((c, 0), (c + 1, 0)) for c in range(2)),  # stops one post short at the plaza end: the third turn
    ((3, 1), (3, 0)),  # the plaza side of the third and top lanes
    ((3, 0), (3, TOP)),
    *(((c, TOP), (c + 1, TOP)) for c in range(3)),  # the new rails along the wall
]

# Dark belt, as the Patience's rail reads on its carpet, with the station's violet along the top edge.
BELT_TOP = (112, 92, 214)
BELT_BOTTOM = (46, 36, 112)
POST_DARK = (20, 17, 34)
POST_LIGHT = (124, 118, 168)
CAP = (214, 208, 244)
GLOW = (46, 40, 92)


def project(X: float, Y: float, Z: float = 0) -> tuple[float, float]:
    return (X - Y) * 30 + 360, (X + Y) * 15 - Z * 36 + 190


def imported(path: str) -> Image.Image:
    data = subprocess.run(["git", "show", f"{IMPORTED}:{path}"], check=True, capture_output=True).stdout
    return Image.open(io.BytesIO(data)).convert("RGB")


def find_posts(img: Image.Image) -> dict[tuple[int, int], tuple[int, int, int]]:
    """Each post's centre column and its top and foot rows, read off the art, plus the new posts along the wall."""
    posts = {}
    luma = img.convert("L")
    for r, y in enumerate(YS):
        for c, x in enumerate(XS):
            sx, foot = project(x, y)
            mid = round(foot) - 15
            dark = [i for i in range(round(sx) - 4, round(sx) + 5) if luma.getpixel((i, mid)) < 90]
            col = dark[0]
            bottom = mid
            while luma.getpixel((col, bottom + 1)) < 90 and bottom < mid + 40:
                bottom += 1
            posts[(c, r)] = (round(sum(dark) / len(dark)), bottom - POST_PX, bottom)
    for c in TOP_COLS:
        below, _, bottom = posts[(c, 0)]
        dx, dy = project(XS[c], TOP_Y)[0] - project(XS[c], YS[0])[0], project(XS[c], TOP_Y)[1] - project(XS[c], YS[0])[1]
        posts[(c, TOP)] = (below + round(dx), bottom + round(dy) - POST_PX, bottom + round(dy))
    return posts


def rope_rows(a, b):
    """The art column and row of each step along a length of rope, end to end."""
    (ax, ay), (bx, by) = a, b
    if ax > bx:
        (ax, ay), (bx, by) = (bx, by), (ax, ay)
    for x in range(ax, bx + 1):
        yield x, round(ay + (by - ay) * (x - ax) / max(1, bx - ax))


def erase_old(img: Image.Image, posts, rope: tuple[int, int, int]) -> None:
    """The old rope is one exact colour in each mood, so only those pixels change, to the floor beside them."""
    px = img.load()
    for pa, pb in OLD_ROPES:
        ca, ta, _ = posts[pa]
        cb, tb, _ = posts[pb]
        for x, y in rope_rows((ca, ta + 1), (cb, tb + 1)):
            for dy in range(-7, 8):
                if px[x, y + dy] == rope:
                    clear = dy - 1
                    while px[x, y + clear] == rope:
                        clear -= 1
                    px[x, y + dy] = px[x, y + clear]


def erase_posts(img: Image.Image, posts) -> None:
    """Take the posts back to the floor down to the base, so they can all be drawn alike."""
    px = img.load()
    for key, (col, top, foot) in posts.items():
        if key[1] == TOP:
            continue
        for y in range(top - 8, foot - 2):
            left, right = px[col - 5, y], px[col + 5, y]
            for dx in range(-4, 5):
                px[col + dx, y] = left if dx <= 0 else right


def erase_gone(img: Image.Image, post) -> None:
    """Take the base of a post that's gone back to the floor, with the patch of floor that best fits around it."""
    px = img.load()
    col, _, foot = post
    hole = [(x, y) for x in range(col - 8, col + 9) for y in range(foot - 2, foot + 10)]
    inside = set(hole)
    ring = [(x, y) for x in range(col - 13, col + 14) for y in range(foot - 7, foot + 15) if (x, y) not in inside]

    def fit(dx: int, dy: int) -> int:
        return sum(sum(abs(a - b) for a, b in zip(px[x, y], px[x + dx, y + dy])) for x, y in ring)

    # tiles repeat on the isometric lattice, so only look there
    dx, dy = min(((30 * i, 15 * j) for i in range(-8, 9) for j in range(-6, 7) if (i + j) % 2 == 0 and abs(i) >= 2), key=lambda d: fit(*d))
    for x, y in hole:
        px[x, y] = px[x + dx, y + dy]


def stamp_bases(img: Image.Image, posts) -> None:
    """Give each new post the round base of the post below it, in this art's own colours."""
    px = img.load()
    for c in TOP_COLS:
        sc, _, sf = posts[(c, 0)]
        tc, _, tf = posts[(c, TOP)]
        for dy in range(-2, 9):
            for dx in range(-6, 7):
                if (dx / 6.2) ** 2 + ((dy - 3) / 5.2) ** 2 <= 1:
                    px[tc + dx, tf + dy] = px[sc + dx, sf + dy]


def draw_new(img: Image.Image, posts) -> None:
    px = img.load()
    for pa, pb in NEW_ROPES:
        ca, ta, _ = posts[pa]
        cb, tb, _ = posts[pb]
        for x, y in rope_rows((ca, ta + 3), (cb, tb + 3)):
            px[x, y] = BELT_TOP
            px[x, y + 1] = BELT_BOTTOM
    for key, (col, top, foot) in posts.items():
        if key == GONE:
            continue
        for y in range(top, foot + 1):
            px[col - 1, y] = POST_LIGHT
            px[col, y] = POST_DARK
            px[col + 1, y] = POST_DARK
        for dx in (-1, 0, 1):
            for dy in (0, 1, 2):
                px[col + dx, top - 1 + dy] = CAP


def redo_glow(img: Image.Image, posts) -> Image.Image:
    corners = [project(XS[c], YS[r], POST_HEIGHT) for c, r in ((0, 0), (4, 0), (4, 3), (0, 3))]
    out = img.copy()
    # the old rope's glow is all there is on this patch of floor
    pad = [(corners[0][0], corners[0][1] - 14), (corners[1][0] + 14, corners[1][1]), (corners[2][0], corners[2][1] + 14), (corners[3][0] - 14, corners[3][1])]
    ImageDraw.Draw(out).polygon(pad, fill=(0, 0, 0))
    lines = Image.new("L", img.size, 0)
    d = ImageDraw.Draw(lines)
    for pa, pb in NEW_ROPES:
        ca, ta, _ = posts[pa]
        cb, tb, _ = posts[pb]
        d.line([(ca, ta + 3), (cb, tb + 3)], fill=255, width=3)
    soft = lines.filter(ImageFilter.GaussianBlur(3))
    return Image.composite(Image.new("RGB", img.size, GLOW), out, soft.point(lambda v: min(255, v * 3)))


def save(img: Image.Image, rel: str) -> None:
    img.save(Path("assets") / rel, optimize=True)
    data = (Path("assets") / rel).read_bytes()
    manifest = Path("assets/manifest.yaml")
    text = manifest.read_text()
    pattern = re.compile(rf'(  - path: {re.escape(rel)}\n(?:    (?!sha256).*\n)*?    sha256: ")[0-9a-f]+("\n    bytes: )\d+')
    text, n = pattern.subn(lambda m: f"{m.group(1)}{hashlib.sha256(data).hexdigest()}{m.group(2)}{len(data)}", text)
    assert n == 1, rel
    manifest.write_text(text)


def main() -> None:
    posts = find_posts(imported(f"{ART}/base-calm.png"))
    for mood, rope in MOODS.items():
        base = imported(f"{ART}/base-{mood}.png")
        stamp_bases(base, posts)
        erase_posts(base, posts)
        erase_old(base, posts, rope)
        erase_gone(base, posts[GONE])
        draw_new(base, posts)
        save(base, f"maps/promenade/base-{mood}.png")
        save(redo_glow(imported(f"{ART}/glow-{mood}.png"), posts), f"maps/promenade/glow-{mood}.png")
    for (c, r), p in sorted(posts.items()):
        print(c, r, p)


if __name__ == "__main__":
    main()
