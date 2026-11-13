#!/usr/bin/env python3
"""Paint the two halves of the SATO & SATO sign onto the Promenade's Calm art (Peter, 2026-11-14).

The chrome clinic's neon used to read CHROME. It now reads SATO, and the board ends in a sawn edge where the rest of it
was. The other half, "& SATO", is taped to the front of the knock-off cart in the Night Market, unlit. Nothing
structural moves: it is paint over base-calm.png and glow-calm.png as they were at SRC_COMMIT, so it can be run again.
Run it from the repo root, then scripts/promenade_takeover.py, which repaints the Takeover mood from the Calm art:

    uv run --no-project --with pillow --with numpy python scripts/sato_signs.py
"""
import hashlib, io, re, subprocess
from pathlib import Path
import numpy as np
from PIL import Image

SRC_COMMIT = "279551f"  # the last commit whose Calm art still says CHROME
DIR = Path("assets/maps/promenade")
BOARD, NEON, WALL, INK = (63, 58, 77), (195, 253, 242), (40, 38, 58), (11, 8, 17)
SHADE = (19, 67, 82)
GLYPH = {
    "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "&": [".##..", "#..#.", "#..#.", ".##..", "#.#.#", "#..#.", ".##.#"],
}

def old(name):
    return Image.open(io.BytesIO(subprocess.run(["git", "show", f"{SRC_COMMIT}:{DIR / name}"], capture_output=True, check=True).stdout))

def text(a, s, x0, y0, k, adv, col, only=None):
    """Letters sheared one pixel down for every two across, as every sign on this wall is."""
    for n, ch in enumerate(s):
        for r, row in enumerate(GLYPH.get(ch, [])):
            for c, bit in enumerate(row):
                if bit != "#": continue
                for dy in range(k):
                    for dx in range(k):
                        x = x0 + n * adv + c * k + dx; y = y0 + r * k + dy + (x - x0) // 2
                        if only is None or tuple(a[y, x][:3]) in only: a[y, x][:3] = col

def clinic(a):
    X0, X1, Y0, Y1 = 1305, 1384, 556, 612
    sub = a[Y0:Y1, X0:X1]
    letters = (sub[..., :3] == NEON).all(-1); sub[letters, :3] = BOARD          # CHROME off
    text(a, "SATO", 1309, 564, 2, 12, NEON, only={BOARD, SHADE})
    for y in range(Y0, Y1):                                                      # the sawn end
        cut = 1361 + (0, 1, 2, 1, 0, -1)[(y // 2) % 6]
        for x in range(cut, X1):
            if tuple(a[y, x][:3]) in (BOARD, SHADE): a[y, x][:3] = INK if x == cut else WALL
    for x, y in ((1366, 594), (1376, 599)): a[y, x][:3] = BOARD; a[y + 1, x][:3] = INK   # two bolt holes left in the wall

def cart(a):
    x0, y0, w, h = 1154, 820, 36, 11
    for i in range(w):
        for j in range(h):
            x, y = x0 + i, y0 + j + i // 2
            edge = j in (0, h - 1) or i == w - 1 or (i <= (1, 0, 2, 0, 1, 2, 0, 1, 0, 2, 1)[j])
            a[y, x][:3] = INK if edge else (52, 48, 64)
    text(a, "&SATO", x0 + 5, y0 + 2, 1, 6, (128, 176, 170))
    for (i, j) in ((2, -2), (3, -2), (2, -1), (3, -1), (2, 0), (3, 0), (32, -2), (33, -2), (32, -1), (33, -1), (32, 0), (33, 0)):   # duct tape
        x, y = x0 + i, y0 + j + i // 2; a[y, x][:3] = (170, 178, 188) if j < 0 else (134, 142, 152)

def glow(g):
    """The neon's halo stops where the sign does now."""
    f = np.ones(g.shape[:2]); xs = np.arange(g.shape[1])[None, :]; ys = np.arange(g.shape[0])[:, None]
    box = (ys > 540) & (ys < 625) & (xs > 1352) & (xs < 1420)
    f = np.where(box, np.clip(1 - (xs - 1352) / 14, .0, 1), 1.0)
    g[..., :3] = (g[..., :3] * f[..., None]).astype(g.dtype)

def manifest(name):
    b = (DIR / name).read_bytes(); m = Path("assets/manifest.yaml"); s = m.read_text()
    pat = re.compile(rf"(  - path: maps/promenade/{re.escape(name)}\n(?:    .*\n)*?    sha256: \")[0-9a-f]+(\"\n    bytes: )\d+")
    s, n = pat.subn(lambda k: f"{k.group(1)}{hashlib.sha256(b).hexdigest()}{k.group(2)}{len(b)}", s); assert n == 1, name
    m.write_text(s)

if __name__ == "__main__":
    base = old("base-calm.png"); mode = base.mode; a = np.array(base.convert("RGBA")); clinic(a); cart(a)
    Image.fromarray(a).convert(mode).save(DIR / "base-calm.png", optimize=True)
    gl = old("glow-calm.png"); gmode = gl.mode; g = np.array(gl.convert("RGBA")); glow(g)
    Image.fromarray(g).convert(gmode).save(DIR / "glow-calm.png", optimize=True)
    for n in ("base-calm.png", "glow-calm.png"): manifest(n)
