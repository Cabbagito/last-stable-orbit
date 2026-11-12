#!/usr/bin/env python3
"""The way down to the lift station is ISCO's lift: the company's lift on the plaza, which only ever went up, opens by
itself once the crew hold the Seal and takes them down. Two bits of art for that.

At the Lift station the way in was an old wooden doorway. It becomes the other end of that lift: the same blue frame as
the plaza's, shut doors, a white-violet strip over them (ISCO's colour) and a call panel beside it. The wood passage and
the alcove stay as the old landing it lets out onto. Painted over the art as imported, in both of the map's moods.

On the Promenade it's a patch for a switch, ISCO's lift: the plaza lift's doors stand open on white-violet light, with
the light on the floor in front. One patch per mood, cut round whatever stands in front of the doors.

    uv run --no-project --with pillow python scripts/isco_lift.py

It rewrites assets/maps/lift/base-*.png and glow-*.png, writes assets/maps/promenade/patch-lift-*.png, and updates
assets/manifest.yaml.
"""

import hashlib
import io
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

IMPORTED = "47825c6"  # the last commit with the Lift station's art as it came from the Maps canvas, the old doorway in it
VIOLET = (232, 222, 255)
HALO = (150, 140, 225)


def imported(path: str) -> Image.Image:
    data = subprocess.run(["git", "show", f"{IMPORTED}:{path}"], check=True, capture_output=True).stdout
    return Image.open(io.BytesIO(data)).convert("RGB")


def mask(size, polygon) -> Image.Image:
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon(polygon, fill=255)
    return m


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


# ---- the Lift station: the old doorway, in art pixels. It stands on the left wall, so its level edges fall 1 in 2
FRAME = [(112, 417), (194, 376), (194, 488), (112, 521)]  # the wooden frame, outside
SEAM = 154  # where the two doors meet


def lift_station(base: Image.Image) -> Image.Image:
    out = base.copy()
    px, src = out.load(), base.load()
    frame = mask(base.size, FRAME).load()
    for x in range(110, 196):
        for y in range(374, 523):
            if not frame[x, y]:
                continue
            r, g, b = src[x, y]
            if r > b + 12 and r > 36:  # wood, and the lit sill: the frame's blue, shade for shade
                lum = 0.3 * r + 0.59 * g + 0.11 * b
                px[x, y] = lerp((22, 26, 64), (84, 96, 196), max(0.0, min(1.0, (lum - 25) / 95)))
            elif r + g + b < 70:  # the dark of the doorway: two doors, shut
                top = 428 - 0.52 * (x - 125)
                if abs(x - SEAM) < 1:
                    px[x, y] = (7, 9, 20)
                elif 2 <= y - top <= 3 or x in (127, 181):
                    px[x, y] = (44, 50, 92)  # a panel line just inside the frame
                else:
                    px[x, y] = (24, 28, 56) if x < SEAM else (30, 34, 66)
    for x in range(132, 177):  # the strip over the doors
        y = round(420 - 0.5 * (x - 125))
        for dy, c in ((-2, HALO), (-1, VIOLET), (0, VIOLET), (1, VIOLET), (2, HALO)):
            px[x, y + dy] = c
    for x in range(97, 105):  # the call panel on the wall beside it, one arrow lit, pointing down
        y0 = round(450 - 0.5 * (x - 97))
        for y in range(y0, y0 + 14):
            px[x, y] = (40, 46, 90) if x in (97, 104) or y in (y0, y0 + 13) else (14, 16, 34)
    for x, y in ((99, 455), (100, 455), (101, 454), (102, 454), (100, 456), (101, 456), (100, 457)):
        px[x, y] = VIOLET
    return out


def lift_glow(glow: Image.Image) -> Image.Image:
    """The glow layer: whatever warm light fell on the doorway turns ISCO's violet, and the strip gets its own."""
    out = glow.copy()
    px = out.load()
    frame = mask(glow.size, FRAME).load()
    for x in range(110, 196):
        for y in range(374, 523):
            if frame[x, y]:
                r, g, b = px[x, y]
                lum = max(r, g, b)
                px[x, y] = (round(lum * 0.72), round(lum * 0.66), lum)
    for x in range(128, 181):
        y = round(420 - 0.5 * (x - 125))
        for dy in range(-7, 8):
            r, g, b = px[x, y + dy]
            k = (1 - abs(dy) / 8) ** 2
            px[x, y + dy] = (max(r, round(150 * k)), max(g, round(140 * k)), max(b, round(225 * k)))
    return out


# ---- the Promenade: the plaza lift's doors, on the back wall, so their level edges rise 1 in 2
DOORS = [(1062, 452), (1119, 480), (1119, 562), (1062, 548)]
SPILL = [(1062, 547), (1092, 562), (1052, 583), (1022, 567)]  # the floor in front of them
WIRE = ((1038, 566), (1108, 494))  # a lantern string hangs across the doors: it stays in front


def near_wire(x: int, y: int) -> bool:
    (x0, y0), (x1, y1) = WIRE
    t = ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2)
    if not 0 <= t <= 1:
        return False
    return abs((x - x0) * (y1 - y0) - (y - y0) * (x1 - x0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5 < 1.6


def lift_open(base: Image.Image) -> Image.Image:
    """A see-through layer with the doors open. Only what is door or bare floor is painted, so the awning, the lantern
    string and anything dropped on the floor stay in front."""
    out = Image.new("RGBA", base.size, (0, 0, 0, 0))
    px, src = out.load(), base.load()
    doors, spill = mask(base.size, DOORS).load(), mask(base.size, SPILL).load()
    for x in range(1020, 1122):
        for y in range(448, 586):
            r, g, b = src[x, y]
            if doors[x, y] and not (near_wire(x, y) and r + g + b < 62):  # the string itself stays, not the door behind it
                door = b < 100 and r < 90 and abs(r - b) < 45 and not (g > r + 6)  # the panels and their seams, not the blue frame
                if not door:
                    continue
                top = 452 + 0.5 * (x - 1062)
                if x < 1067 or x > 1114:
                    continue  # the two doors, slid aside
                depth = max(0.0, min(1.0, (y - top) / 90))
                side = abs(x - 1090.5) / 26
                px[x, y] = (*lerp(VIOLET, (150, 138, 226), min(1.0, 0.55 * depth + 0.35 * side**2)), 255)
            elif spill[x, y] and b > 80 and b > r + 40:  # the lift's own blue floor: the light lies on it
                d = ((x - 1062) + 2 * (y - 547)) / 80  # how far out from the doors
                px[x, y] = (*lerp((r, g, b), VIOLET, max(0.0, 0.5 - 0.45 * max(0.0, d))), 255)
    return out


def save(img: Image.Image, rel: str, note: str) -> None:
    img.save(Path("assets") / rel, optimize=True)
    data = (Path("assets") / rel).read_bytes()
    manifest = Path("assets/manifest.yaml")
    text = manifest.read_text()
    pattern = re.compile(rf'(  - path: {re.escape(rel)}.*\n(?:    (?!sha256).*\n)*?    sha256: ")[0-9a-f]+("\n    bytes: )\d+')
    text, n = pattern.subn(lambda m: f"{m.group(1)}{hashlib.sha256(data).hexdigest()}{m.group(2)}{len(data)}", text)
    if not n:
        text = text.rstrip("\n") + (
            f"\n  - path: {rel}  # {note}\n    store: MAPS\n    asset_id: \"\"\n"
            f'    sha256: "{hashlib.sha256(data).hexdigest()}"\n    bytes: {len(data)}\n    width: {img.width}\n    height: {img.height}\n'
        )
    manifest.write_text(text)


def main() -> None:
    for mood in ("shut", "open"):
        save(lift_station(imported(f"assets/maps/lift/base-{mood}.png")), f"maps/lift/base-{mood}.png", "")
        save(lift_glow(imported(f"assets/maps/lift/glow-{mood}.png")), f"maps/lift/glow-{mood}.png", "")
    for mood in ("calm", "takeover"):
        base = Image.open(f"assets/maps/promenade/base-{mood}.png").convert("RGB")
        save(lift_open(base), f"maps/promenade/patch-lift-{mood}.png", "generated by scripts/isco_lift.py")


if __name__ == "__main__":
    main()
