#!/usr/bin/env python3
"""Paint the Promenade's Takeover mood over its Calm art: Act 4, the street shot up a few minutes ago, on emergency light.

Peter approved the picture on the LSO - Takeover canvas (https://claude.ai/artifact/Gmv7MPt5H32nqnzCGusGoo) on
2026-11-12. Nothing structural moves: every change is paint over base-calm.png and glow-calm.png, so tokens stay where
they were. The street goes dark under red emergency lamps and the deck's orange edge strip, as on the other decks'
Alert art, and the stalls keep their own light. Lantern strings are down or dead, the lift's barrier is smashed, stools
and crates are over in the market, queue posts are down at Dock 7 among dropped luggage and Vigil flowers, and there
are scorch marks, bullet holes and broken glass along the street. The bar's dark sign comes from the old Hunted
picture, which these two files replace. Run it from the repo root:

    uv run --no-project --with pillow --with numpy --with scipy python scripts/promenade_takeover.py

It rewrites assets/maps/promenade/base-takeover.png and glow-takeover.png and updates their sha256 and size in
assets/manifest.yaml. Give it a folder to also get the two as the app shows them, glow over base, for a look.
"""

import hashlib
import io
import re
import subprocess
import math
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

SRC = Path("assets/maps/promenade")
HUNTED = "651dcc2"  # the last commit with the old Hunted picture at base-takeover.png
W, H = 1800, 1080
OX, OY = 360, 190
rng = random.Random(4)

INK = (11, 8, 17)
AMBER, TEAL = (255, 179, 85), (89, 224, 212)
DEAD_AMBER, DEAD_TEAL = (59, 40, 22), (27, 49, 46)
BELT_TOP, BELT_BOTTOM = (112, 92, 214), (46, 36, 112)
POST_DARK, POST_LIGHT, CAP = (20, 17, 34), (124, 118, 168), (214, 208, 244)
RED_LAMP, STRIP = (255, 86, 66), (255, 118, 84)


def P(X, Y, Z=0.0):
    return (X - Y) * 30 + OX, (X + Y) * 15 - Z * 36 + OY


def Pi(X, Y, Z=0.0):
    x, y = P(X, Y, Z)
    return round(x), round(y)


def W_(X, Z):  # a point on the back wall (Y = 0)
    return Pi(X, 0, Z)


calm = np.array(Image.open(SRC / "base-calm.png").convert("RGB"))
hunted = np.array(Image.open(io.BytesIO(subprocess.run(["git", "show", f"{HUNTED}:{SRC}/base-takeover.png"], check=True, capture_output=True).stdout)).convert("RGB"))
glow_calm = np.array(Image.open(SRC / "glow-calm.png").convert("RGB")).astype(float)

art = calm.copy()
ys, xs = np.mgrid[0:H, 0:W]
A, B = (xs - OX) / 30.0, (ys - OY) / 15.0
FX, FY = (A + B) / 2, (B - A) / 2  # each pixel as a point of the floor
WZ = (A * 15 + OY - ys) / 36.0  # ... or of the back wall, at X = A
LZ = (-A * 15 + OY - ys) / 36.0  # ... or of the left wall, at Y = -A
on_back = (A >= 0) & (WZ > 0)
on_left = (A < 0) & (LZ > 0)
nonblack = calm.max(axis=2) > 0

glow_kill = np.zeros((H, W), bool)  # where Calm's glow goes out
glow_src = np.zeros((H, W, 3), float)  # new things that glow
unlit = np.zeros((H, W), bool)  # pixels that keep the colour painted here (dead bulbs, the bar's door)


def eq(a, col):
    return (a[..., 0] == col[0]) & (a[..., 1] == col[1]) & (a[..., 2] == col[2])


def isin(a, cols):
    m = np.zeros(a.shape[:2], bool)
    for c in cols:
        m |= eq(a, c)
    return m


def box(x0, y0, x1, y1):
    m = np.zeros((H, W), bool)
    m[y0:y1, x0:x1] = True
    return m


def heal(mask, avoid=None):
    """Fill the masked pixels with the nearest pixel outside the mask (and outside avoid)."""
    idx = ndi.distance_transform_edt(mask if avoid is None else mask | avoid, return_distances=False, return_indices=True)
    art[mask] = art[idx[0][mask], idx[1][mask]]


def clone(mask, dx, dy):
    """Fill the masked pixels from the same floor one lattice step away."""
    yy, xx = np.nonzero(mask)
    art[yy, xx] = art[yy + dy, xx + dx]


def paint(fn):
    """Draw on the art with PIL."""
    global art
    im = Image.fromarray(art)
    fn(ImageDraw.Draw(im))
    art = np.array(im)


def mul(mask, k):
    art[mask] = np.clip(art[mask] * np.array(k, float), 0, 255).astype(np.uint8)


def wobble(theta, seed):
    r = random.Random(seed)
    a, b, c = r.uniform(0, 6.3), r.uniform(0, 6.3), r.uniform(0, 6.3)
    return 1 + 0.22 * np.sin(3 * theta + a) + 0.13 * np.sin(5 * theta + b) + 0.08 * np.sin(9 * theta + c)


# ---------------------------------------------------------------- lanterns

def bulbs(col):
    lab, _ = ndi.label(eq(calm, col))
    out = {}
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        yy, xx = sl
        if (lab[sl] == i).sum() < 25:
            continue
        out[((xx.start + xx.stop - 1) // 2, (yy.start + yy.stop - 1) // 2)] = (sl, lab[sl] == i)
    return out


BULBS = {**{k: (v, AMBER) for k, v in bulbs(AMBER).items()}, **{k: (v, TEAL) for k, v in bulbs(TEAL).items()}}


def bulb_at(x, y):
    key = min(BULBS, key=lambda k: abs(k[0] - x) + abs(k[1] - y))
    assert abs(key[0] - x) + abs(key[1] - y) < 6, (x, y, key)
    return BULBS[key]


def kill_bulb(x, y):
    (sl, m), col = bulb_at(x, y)
    art[sl][m] = DEAD_AMBER if col == AMBER else DEAD_TEAL
    unlit[sl] |= m
    glow_kill[max(0, y - 12):y + 13, max(0, x - 12):x + 13] = True


def remove_bulb(x, y):
    (sl, m), _ = bulb_at(x, y)
    mask = np.zeros((H, W), bool)
    mask[sl] = m
    mask = ndi.binary_dilation(mask, iterations=1)
    mask[sl[0].start - 3:sl[0].start, x - 1:x + 2] = True  # its cap on the string
    glow_kill[max(0, y - 12):y + 13, max(0, x - 12):x + 13] = True
    return mask


def lanterns():
    # String 1, the one by the lift: shot through over the stall. From the wall to the awning's corner it still hangs,
    # dead. The rest has dropped: it hangs down the awning's pole and lies across the market floor to its own pole.
    for b in ((1128, 495), (1099, 521), (1069, 544)):
        kill_bulb(*b)
    gone = np.zeros((H, W), bool)
    for b in ((1040, 565), (1011, 584), (981, 601), (952, 617), (923, 630)):
        gone |= remove_bulb(*b)
    line = Image.new("L", (W, H), 0)
    ImageDraw.Draw(line).line([(1064, 548), (894, 632)], fill=255, width=3)
    dark = calm.astype(int).sum(axis=2) < 60
    gone |= (np.array(line) > 0) & dark & nonblack
    heal(gone)
    # String 3, over the clinic's corner: up, and dead from end to end.
    for b in ((1091, 714), (1120, 701), (1149, 685), (1179, 668), (1208, 649), (1237, 628), (1267, 605), (1296, 579)):
        kill_bulb(*b)
    # Odd bulbs shot out on the two strings still lit, and the bar's own two lanterns.
    for b in ((1036, 659), (1124, 607), (1233, 727), (1321, 670), (1402, 712), (1498, 745)):
        kill_bulb(*b)

    def fallen(d):
        # down the awning's pole, then across the floor to the string's pole at the market's edge
        path = [(1069, 548), (1068, 566), (1070, 590), (1069, 612), (1066, 628)]
        floor = [(26.45, 3.05), (26.2, 3.9), (26.9, 4.8), (26.55, 5.7), (27.3, 6.5), (26.8, 7.4), (27.45, 8.3), (27.0, 9.0), (27.2, 9.4)]
        path += [Pi(*p) for p in floor]
        d.line(path, fill=INK, width=1)
        for i, (X, Y) in enumerate(((26.3, 4.1), (26.85, 5.2), (27.2, 6.7), (27.0, 7.9), (27.35, 8.8))):
            x, y = Pi(X, Y)
            col = DEAD_AMBER if i % 2 else DEAD_TEAL
            if i == 2:  # one smashed where it landed
                for dx, dy in ((-3, 0), (-1, 2), (2, 1), (4, -1), (1, -2), (-4, 3)):
                    d.point((x + dx, y + dy), fill=(120, 150, 150) if (dx + dy) % 2 else col)
                continue
            d.ellipse([x - 4, y - 3, x + 4, y + 3], fill=col, outline=INK)
            d.point((x - 1, y - 1), fill=(82, 96, 96) if col == DEAD_TEAL else (104, 76, 50))
    paint(fallen)


# ---------------------------------------------------------------- signs and the bar

def poly(points):
    im = Image.new("L", (W, H), 0)
    ImageDraw.Draw(im).polygon(points, fill=255)
    return np.array(im) > 0


def signs():
    # NIGHT MARKET: three letters dead.
    cols = ((254, 221, 154), (255, 154, 58))
    region = box(1146, 452, 1298, 548) & isin(calm, cols)
    words = ((1152, 1206, 5), (1215, 1286, 6))
    letters = [(a + (b - a + 1) * i / n, a + (b - a + 1) * (i + 1) / n - 1) for a, b, n in words for i in range(n)]
    for i in (2, 6, 9):  # G, A, E
        m = region & (xs >= letters[i][0]) & (xs <= letters[i][1])
        art[m & eq(calm, cols[0])] = (84, 62, 48)
        art[m & eq(calm, cols[1])] = (58, 44, 40)
        unlit[:] |= m
        glow_kill[:] |= ndi.binary_dilation(m, iterations=7)
    # DOCK 7: off.
    m = box(155, 108, 250, 178)
    for src, dst in (((239, 234, 255), (96, 90, 128)), ((139, 121, 230), (66, 60, 92)), ((184, 171, 254), (80, 74, 110)), ((203, 195, 248), (88, 82, 120))):
        hit = m & eq(calm, src)
        art[hit] = dst
        unlit[:] |= hit
    glow_kill[:] |= box(150, 100, 256, 186)
    # The bar. Its sign is off: the old Hunted picture has it dark, letter for letter.
    pink = isin(calm, ((250, 82, 169), (255, 214, 234))) & box(1395, 585, 1520, 665)
    art[pink] = hunted[pink]
    unlit[:] |= pink
    glow_kill[:] |= box(1395, 585, 1520, 665)
    # Its door is shut and dark,
    door = poly([(1459, 656), (1529, 691), (1529, 776), (1459, 746)]) & ((calm[..., 0].astype(int) - calm[..., 2] > 40) | isin(calm, ((187, 136, 57), (231, 163, 81), (148, 107, 52), AMBER, (135, 92, 46)))) & ~eq(calm, TEAL)
    art[door] = (15, 13, 17)
    seam = door & (xs == 1494)
    art[seam] = (29, 29, 46)
    unlit[:] |= door
    # with no light on the step,
    step = box(1444, 738, 1534, 792) & (calm[..., 0].astype(int) - calm[..., 2] > 60) & ~isin(calm, (AMBER, TEAL)) & ~door
    art[step] = (40, 32, 32)
    # none on the floor in front of it,
    floor = {(137, 103, 81): (55, 49, 72), (152, 123, 95): (55, 49, 72), (87, 71, 85): (55, 49, 72), (108, 81, 66): (40, 38, 58), (119, 94, 77): (40, 38, 58)}
    for src, dst in floor.items():
        art[box(1436, 736, 1566, 904) & eq(calm, src)] = dst
    rest = box(1436, 792, 1566, 904) & (calm[..., 0].astype(int) >= calm[..., 2]) & (calm.sum(axis=2) > 120) & ~isin(calm, (AMBER, TEAL))
    art[rest] = (55, 49, 72)
    # and the gold strip over its wall is out.
    gold = box(1436, 575, 1614, 706) & (calm[..., 0] > 200) & (calm[..., 1] > 125) & (calm[..., 2] < 170) & ~eq(calm, TEAL) & ~box(1436, 690, 1470, 706)
    art[gold] = (104, 66, 30)
    unlit[:] |= gold
    return door


# ---------------------------------------------------------------- Dock 7's queue

XS = (3.0, 4.65, 6.3, 7.95, 9.6)
YS = (2.27, 3.97, 5.67, 7.37)
POST_PX = 29
TOP, TOP_Y = -1, 0.57
ROPES = [
    *(((c, 3), (c + 1, 3)) for c in range(4)), ((4, 3), (4, 2)), ((4, 2), (4, 1)),
    *(((c, 2), (c + 1, 2)) for c in range(3)), *(((c, 1), (c + 1, 1)) for c in range(1, 4)),
    ((0, 2), (0, 1)), ((0, 1), (0, 0)), *(((c, 0), (c + 1, 0)) for c in range(2)),
    ((3, 1), (3, 0)), ((3, 0), (3, TOP)), *(((c, TOP), (c + 1, TOP)) for c in range(3)),
]
# The posts knocked over, and which way each fell (in world X, Y).
DOWN = {(4, 3): (1.0, 0.25), (2, 3): (-0.2, 1.0), (1, 1): (-0.9, -0.5)}


def find_posts():
    luma = calm.astype(int).sum(axis=2) / 3
    posts = {}
    for r, y in enumerate(YS):
        for c, x in enumerate(XS):
            sx, foot = P(x, y)
            mid = round(foot) - 15
            dark = [i for i in range(round(sx) - 4, round(sx) + 5) if luma[mid, i] < 60]
            if not dark:
                continue  # the one post the redraw took away
            col = dark[0]
            bottom = mid
            while luma[bottom + 1, col] < 60 and bottom < mid + 40:
                bottom += 1
            posts[(c, r)] = (round(sum(dark) / len(dark)), bottom - POST_PX, bottom)
    for c in range(4):
        below, _, bottom = posts[(c, 0)]
        dx, dy = P(XS[c], TOP_Y)[0] - P(XS[c], YS[0])[0], P(XS[c], TOP_Y)[1] - P(XS[c], YS[0])[1]
        posts[(c, TOP)] = (below + round(dx), bottom + round(dy) - POST_PX, bottom + round(dy))
    return posts


def rope_rows(a, b):
    (ax, ay), (bx, by) = a, b
    if ax > bx:
        (ax, ay), (bx, by) = (bx, by), (ax, ay)
    for x in range(ax, bx + 1):
        yield x, round(ay + (by - ay) * (x - ax) / max(1, bx - ax))


def queue():
    posts = find_posts()
    slack = [(a, b) for a, b in ROPES if a in DOWN or b in DOWN]
    # take the slack ropes off the posts: only the belt's two exact colours change, to the floor just above
    for pa, pb in slack:
        (ca, ta, _), (cb, tb, _) = posts[pa], posts[pb]
        for x, y in rope_rows((ca, ta + 3), (cb, tb + 3)):
            for dy in range(-3, 5):
                if tuple(art[y + dy, x]) in (BELT_TOP, BELT_BOTTOM):
                    up = dy - 1
                    while tuple(art[y + up, x]) in (BELT_TOP, BELT_BOTTOM):
                        up -= 1
                    art[y + dy, x] = art[y + up, x]
        line = Image.new("L", (W, H), 0)
        ImageDraw.Draw(line).line([(ca, ta + 3), (cb, tb + 3)], fill=255, width=13)
        glow_kill[:] |= np.array(line) > 0
    tips = {}
    for key, fall in DOWN.items():
        col, top, foot = posts[key]
        # the post itself, back to the floor either side of it
        for y in range(top - 3, foot - 1):
            art[y, col - 4:col + 1] = art[y, col - 5]
            art[y, col + 1:col + 5] = art[y, col + 5]
        # its round base, from the same floor a tile away
        hole = np.zeros((H, W), bool)
        hole[foot - 3:foot + 10, col - 8:col + 9] = True
        ring = ndi.binary_dilation(hole, iterations=5) & ~hole
        ry, rx = np.nonzero(ring)
        cands = [(30 * i, 15 * j) for i in range(-6, 7) for j in range(-6, 7) if (i + j) % 2 == 0 and abs(i) + abs(j) >= 4]
        dx, dy = min(cands, key=lambda d: np.abs(art[ry, rx].astype(int) - art[ry + d[1], rx + d[0]].astype(int)).sum())
        clone(hole, dx, dy)
        n = math.hypot(*fall)
        fx, fy = fall[0] / n * 0.92, fall[1] / n * 0.92
        a = (col, foot + 3)
        b = (a[0] + round((fx - fy) * 30), a[1] + round((fx + fy) * 15))
        tips[key] = b

        def lying(d, a=a, b=b):
            d.line([(a[0], a[1] + 2), (b[0], b[1] + 2)], fill=(72, 68, 104), width=3)  # its shadow
            d.line([a, b], fill=POST_DARK, width=3)
            d.line([(a[0], a[1] - 1), (b[0], b[1] - 1)], fill=POST_LIGHT, width=1)
            d.ellipse([a[0] - 3, a[1] - 5, a[0] + 3, a[1] + 4], fill=(92, 87, 137), outline=POST_DARK)  # the base, on edge
            d.rectangle([b[0] - 1, b[1] - 2, b[0] + 1, b[1] + 1], fill=CAP)
        paint(lying)
    # each belt that lost its far post hangs limp off the one still standing, its end on the floor. It has gone dark.
    for pa, pb in slack:
        stand, fell = (pa, pb) if pb in DOWN else (pb, pa)
        if stand in DOWN:
            continue
        col, top, foot = posts[stand]
        tip = tips[fell]
        n = math.hypot(tip[0] - col, tip[1] - foot)
        ux, uy = (tip[0] - col) / n, (tip[1] - foot) / n
        pts = [(col, top + 3), (col + round(ux * 2), top + 13), (col + round(ux * 3), foot - 4), (col + round(ux * 8), foot + round(uy * 5) + 2),
               (col + round(ux * 14 - uy * 3), foot + round(uy * 10 + ux * 1) + 2), (col + round(ux * 20 + uy * 2), foot + round(uy * 15) + 1)]

        def rope(d, pts=pts):
            d.line(pts, fill=BELT_BOTTOM, width=1)
            d.line([(x, y - 1) for x, y in pts], fill=(92, 78, 170), width=1)
        paint(rope)
    return posts


# ---------------------------------------------------------------- the company's lift

def saw(v, period, amp):
    t = (v % period) / period
    return amp * (1 - abs(2 * t - 1))


def lift():
    # The glass barrier beside the lift, from its corner post (984) to the lift's frame (1046): the near two thirds
    # are smashed out. Jagged glass is left along the floor and at the standing end, and the rail lies on the carpet.
    top = lambda x: 531 - (x - 984) * 0.5
    bot = lambda x: 566 - (x - 984) * 0.5
    stub = lambda x: 2 + saw(x, 9, 7) if x < 1008 else 1 + saw(x + 3, 6, 4)
    edge = lambda y: 1023 + saw(y, 11, 8)
    r = random.Random(11)
    gone = np.zeros((H, W), bool)
    for x in range(986, 1034):
        for y in range(int(top(x)) - 4, int(bot(x)) + 2):
            if x >= edge(y) or bot(x) - y <= stub(x):
                continue
            gone[y, x] = True
    clone(gone, -60, 60)

    def bits(d):
        for x in range(986, 1031):  # the broken edges catch the light
            peak = stub(x) >= stub(x - 1) and stub(x) >= stub(x + 1)
            if x < edge(int(bot(x) - stub(x))):
                d.point((x, int(bot(x) - stub(x))), fill=(178, 226, 243) if peak else (131, 171, 204))
        for y in range(500, 546):
            x = int(edge(y))
            if top(x) < y < bot(x) - stub(x):
                d.point((x, y), fill=(178, 226, 243) if edge(y) <= edge(y - 1) and edge(y) <= edge(y + 1) else (131, 171, 204))
        # the snapped rail on the carpet
        a, b = (1004, 592), (1034, 577)
        d.line([(a[0], a[1] + 2), (b[0], b[1] + 2)], fill=(33, 44, 87), width=2)
        d.line([a, b], fill=(74, 103, 182), width=2)
        d.line([(a[0] + 2, a[1] - 2), (b[0] - 6, b[1] + 2)], fill=(122, 150, 214), width=1)
        d.line([(1026, 510), (1017, 527), (1014, 541)], fill=(33, 44, 87), width=2)  # the rail's other end, hanging
        d.line([(1025, 510), (1016, 527), (1013, 540)], fill=(74, 103, 182), width=1)
        for X, Y, k in ((22.2, 1.2, 0), (22.5, 2.3, 1), (23.5, 0.9, 2), (23.3, 1.9, 3), (22.0, 2.9, 4), (23.9, 2.7, 5), (21.7, 1.9, 6), (23.0, 3.3, 7)):
            x, y = Pi(X, Y)
            w, h = 3 + k % 3, 2 + k % 2
            d.polygon([(x, y), (x + w, y - h + 1), (x + w + 2, y + 1)], fill=(94, 116, 155), outline=(63, 72, 106))
            d.line([(x, y), (x + w, y - h + 1)], fill=(178, 226, 243))
        # shards, both sides of where it stood
        for _ in range(30):
            X, Y = 22.9 + r.gauss(0, 0.6), r.uniform(0.5, 2.9)
            x, y = Pi(X, Y)
            c = r.choice(((131, 171, 204), (94, 116, 155), (94, 116, 155), (178, 226, 243)))
            d.point((x, y), fill=c)
            if r.random() < 0.5:
                d.point((x + 1, y + r.choice((0, 1))), fill=(94, 116, 155))
    paint(bits)


# ---------------------------------------------------------------- the market

def iso_box(d, X, Y, Z, sx, sy, sz, top, left, right, outline=INK):
    t = [Pi(X, Y, Z + sz), Pi(X + sx, Y, Z + sz), Pi(X + sx, Y + sy, Z + sz), Pi(X, Y + sy, Z + sz)]
    lf = [Pi(X, Y + sy, Z + sz), Pi(X + sx, Y + sy, Z + sz), Pi(X + sx, Y + sy, Z), Pi(X, Y + sy, Z)]
    rt = [Pi(X + sx, Y, Z + sz), Pi(X + sx, Y + sy, Z + sz), Pi(X + sx, Y + sy, Z), Pi(X + sx, Y, Z)]
    d.polygon(lf, fill=left)
    d.polygon(rt, fill=right)
    d.polygon(t, fill=top)
    if outline:
        d.line([t[0], t[1], rt[3], rt[2], lf[3], t[3], t[0]], fill=outline)
        d.line([t[3], t[2], t[1]], fill=tuple(max(0, c - 22) for c in top))
        d.line([t[2], rt[2]], fill=outline)


def shadow(X, Y, rx, ry, k=0.72):
    m = ((FX - X) / rx) ** 2 + ((FY - Y) / ry) ** 2 <= 1
    mul(m & nonblack, (k, k, k))


def stool_down(d, x, y, dx, dy):
    """A bar stool on its side: its foot at (x, y), the seat (dx, dy) away."""
    sx, sy = x + dx, y + dy
    n = math.hypot(dx, dy)
    ux, uy = dx / n, dy / n
    d.line([(x, y + 3), (sx, sy + 3)], fill=(40, 32, 32), width=3)  # shadow
    d.line([(x, y), (sx, sy)], fill=(33, 44, 87), width=2)
    d.line([(x, y - 1), (sx, sy - 1)], fill=(94, 116, 155), width=1)
    d.ellipse([x - 2, y - 6, x + 2, y + 5], fill=(40, 38, 58), outline=INK)  # the foot, a thin disc on edge
    bx, by = sx - round(ux * 3), sy - round(uy * 3)
    d.ellipse([bx - 5, by - 8, bx + 5, by + 7], fill=(140, 36, 30), outline=INK)  # the cushion's side
    d.ellipse([sx - 5, sy - 8, sx + 5, sy + 7], fill=(212, 56, 41), outline=INK)  # and its top, facing away
    d.ellipse([sx - 2, sy - 5, sx + 2, sy + 2], fill=(232, 96, 70))


def market():
    # Two of the noodle counter's three stools are over. The middle one still stands.
    gone = np.zeros((H, W), bool)
    for cx, cy, foot in ((1085, 608, 636), (1153, 642, 669)):
        gone |= ((xs - cx) / 11.0) ** 2 + ((ys - cy) / 8.0) ** 2 <= 1
        gone |= (np.abs(xs - cx) <= 3) & (ys > cy) & (ys < foot)
        gone |= ((xs - cx) / 12.5) ** 2 + ((ys - foot) / 7.5) ** 2 <= 1
    lights = ndi.binary_dilation(isin(art, (AMBER, TEAL, DEAD_AMBER, DEAD_TEAL)), iterations=2)
    gone &= ~lights
    heal(gone, lights)
    shadow(27.6, 4.5, 0.9, 0.5)
    shadow(29.3, 5.6, 0.9, 0.5)

    def props(d):
        stool_down(d, 1081, 650, -24, 10)
        stool_down(d, 1120, 688, 25, 9)
        # a noodle bowl off the counter, face down, with what was in it
        x, y = Pi(27.9, 4.1)
        d.ellipse([x - 7, y - 2, x + 7, y + 4], fill=(122, 120, 155), outline=INK)
        d.arc([x - 7, y - 6, x + 7, y + 3], 180, 360, fill=INK)
        d.chord([x - 6, y - 6, x + 6, y + 3], 180, 360, fill=(87, 79, 111))
        for i in range(16):
            px_, py_ = x + 6 + r_.randint(0, 13), y + 2 + r_.randint(-2, 5)
            d.point((px_, py_), fill=(254, 221, 154) if i % 3 else (255, 206, 170))
        d.line([(x + 6, y + 4), (x + 12, y + 6), (x + 15, y + 4)], fill=(254, 221, 154))
        # crates: one burst open on its side by the stack near the alley, its fruit across the floor
        iso_box(d, 31.4, 7.3, 0, 0.7, 0.55, 0.5, (93, 68, 55), (76, 57, 51), (40, 32, 32))
        t = [Pi(31.4, 7.85, 0.5), Pi(32.1, 7.85, 0.5), Pi(32.1, 7.85, 0.0), Pi(31.4, 7.85, 0.0)]
        d.polygon([(t[0][0] + 3, t[0][1] + 3), (t[1][0] - 2, t[1][1] + 2), (t[2][0] - 2, t[2][1] - 3), (t[3][0] + 3, t[3][1] - 2)], fill=(21, 14, 14))
        for _ in range(26):
            X, Y = 31.7 + r_.gauss(0, 0.5), 8.05 + abs(r_.gauss(0, 0.55))
            if Y > 9.6 or not 30.6 < X < 32.6:
                continue
            x, y = Pi(X, Y)
            c = r_.choice(((232, 143, 32), (232, 143, 32), (212, 56, 41), (167, 121, 48)))
            d.rectangle([x, y, x + 1, y + 1], fill=c)
            d.point((x, y), fill=tuple(min(255, v + 40) for v in c))
            d.point((x + 1, y + 2), fill=(40, 32, 32))
        # the second cart's stock: a box off the table, split
        iso_box(d, 33.4, 9.0, 0, 0.6, 0.5, 0.28, (76, 57, 51), (52, 41, 41), (29, 23, 24))
        iso_box(d, 34.3, 9.3, 0, 0.45, 0.35, 0.3, (93, 68, 55), (64, 49, 45), (40, 32, 32))
        for _ in range(18):
            X, Y = 33.9 + r_.gauss(0, 0.55), 9.3 + r_.gauss(0, 0.3)
            if not 8.7 < Y < 9.9:
                continue
            x, y = Pi(X, Y)
            c = r_.choice(((85, 101, 129), (122, 120, 155), (167, 121, 48)))
            d.rectangle([x, y, x + 2, y + 1], fill=c)
            d.point((x, y), fill=(178, 190, 214))
        # the first cart's stock off its table, across the floor in front of it
        for _ in range(22):
            X, Y = 26.3 + r_.gauss(0, 0.55), 9.0 + r_.gauss(0, 0.35)
            if not (8.55 < Y < 9.85 and 24.9 < X < 27.6):
                continue
            x, y = Pi(X, Y)
            c = r_.choice(((167, 121, 48), (85, 101, 129), (85, 101, 129), (115, 81, 33)))
            d.ellipse([x - 1, y - 1, x + 2, y + 1], fill=c)
            d.point((x, y - 1), fill=tuple(min(255, v + 50) for v in c))
        # cans out of the vending machine
        for X, Y, c in ((35.2, 1.7, (89, 224, 212)), (35.9, 2.1, (212, 56, 41)), (36.3, 1.6, (89, 224, 212)), (35.5, 2.5, (165, 153, 233)), (36.6, 2.4, (212, 56, 41))):
            x, y = Pi(X, Y)
            c = tuple(int(v * 0.8) for v in c)
            d.line([(x, y), (x + 3, y + 1)], fill=c, width=2)
            d.point((x + 4, y + 1), fill=(178, 190, 214))
    r_ = random.Random(21)
    paint(props)


# ---------------------------------------------------------------- Dock 7: what the passengers dropped

CASES = [  # X, Y, size, colours (top, left, right)
    (1.9, 6.3, (0.62, 0.36, 0.2), ((150, 62, 58), (118, 44, 46), (84, 31, 48))),
    (2.6, 8.4, (0.34, 0.6, 0.44), ((60, 124, 122), (36, 92, 98), (19, 67, 82))),
    (5.3, 8.75, (0.6, 0.34, 0.42), ((187, 160, 138), (150, 120, 100), (108, 81, 66))),
    (7.0, 6.55, (0.36, 0.56, 0.18), ((74, 103, 182), (45, 66, 128), (33, 44, 87))),
    (8.55, 8.9, (0.6, 0.38, 0.2), ((122, 120, 155), (87, 79, 111), (63, 58, 77))),
    (10.9, 6.9, (0.36, 0.62, 0.44), ((150, 62, 58), (118, 44, 46), (84, 31, 48))),
    (11.6, 1.3, (0.56, 0.34, 0.4), ((63, 72, 106), (45, 52, 84), (31, 24, 61))),
    (4.1, 4.75, (0.5, 0.3, 0.18), ((187, 160, 138), (150, 120, 100), (108, 81, 66))),
    (12.3, 8.6, (0.52, 0.34, 0.2), ((60, 124, 122), (36, 92, 98), (19, 67, 82))),
]
FLOWERS = [(1.5, 5.3), (2.9, 7.2), (3.8, 9.1), (6.2, 8.35), (7.6, 9.3), (9.9, 8.3), (10.6, 5.2), (11.9, 7.7), (8.9, 6.6), (5.6, 5.0), (12.6, 4.6), (13.4, 9.0)]
PETALS = ((239, 234, 255), (250, 82, 169), (255, 214, 234), (212, 56, 41), (254, 221, 154))


def dock():
    r = random.Random(7)
    for X, Y, (sx, sy, sz), _ in CASES:
        shadow(X + sx / 2 + 0.1, Y + sy / 2 + 0.12, sx * 0.85, sy * 0.85, 0.78)

    def props(d):
        for i, (X, Y, (sx, sy, sz), (t, lf, rt)) in enumerate(CASES):
            sx, sy, sz = sx * 0.85, sy * 0.85, sz * 0.85
            iso_box(d, X, Y, 0, sx, sy, sz, t, lf, rt)
            a, b = Pi(X + sx * 0.3, Y + sy * 0.5, sz), Pi(X + sx * 0.7, Y + sy * 0.5, sz)
            d.line([a, b], fill=INK)  # the handle, or the seam of the lid
            if i in (3, 4):  # burst open: clothes out across the floor
                for _ in range(15):
                    x, y = Pi(X + sx / 2 + r.gauss(0.3, 0.42), Y + sy + abs(r.gauss(0.1, 0.4)))
                    c = r.choice(((203, 195, 248), (150, 145, 204), (250, 82, 169), (74, 103, 182), (254, 221, 154)))
                    d.rectangle([x, y, x + r.randint(1, 3), y + r.randint(0, 1)], fill=c)
        for X, Y in FLOWERS:  # a Vigil bunch, dropped: paper, stems, and the heads
            x, y = Pi(X, Y)
            f = r.choice((-1, 1))
            d.polygon([(x, y), (x + 7 * f, y - 2), (x + 6 * f, y + 4)], fill=(203, 195, 248), outline=(122, 120, 155))
            for k in range(4):
                ex, ey = x - (6 + (k % 2) * 3) * f, y - 5 + k * 3
                d.line([(x, y + 1), (ex, ey)], fill=(36, 110, 84))
                c = PETALS[(k + int(X * 3)) % len(PETALS)]
                d.rectangle([ex - 1, ey - 1, ex + 1, ey + 1], fill=c)
                d.point((ex, ey), fill=(254, 221, 154) if c != (254, 221, 154) else (232, 143, 32))
            for _ in range(9):  # petals trodden around it
                px_, py_ = Pi(X + r.gauss(0, 0.5), Y + r.gauss(0, 0.5))
                d.point((px_, py_), fill=r.choice(PETALS))
        for X, Y in ((3.3, 6.0), (9.3, 9.2), (6.8, 5.2), (11.4, 8.9), (2.2, 9.2)):  # Vigil candles, rolled away
            x, y = Pi(X, Y)
            d.line([(x, y), (x + 4, y + 2)], fill=(239, 234, 255))
            d.point((x + 5, y + 2), fill=(254, 221, 154))
    paint(props)


# ---------------------------------------------------------------- gunfire: scorch, holes, cracks, brass

def star(u, v, r, seed, up=False):
    """A burn: a dark heart with rays thrown out of it. u and v are the two axes of the surface it is on."""
    rr = random.Random(seed)
    th, d = np.arctan2(v, u), np.hypot(u, v)
    edge = r * (1 + 0.10 * np.sin(4 * th + rr.uniform(0, 6.3)) + 0.06 * np.sin(9 * th + rr.uniform(0, 6.3)))
    rays = np.zeros((H, W), bool)
    for _ in range(rr.randint(6, 8)):
        a0 = rr.uniform(0.25 * math.pi, 0.75 * math.pi) if up and rr.random() < 0.5 else rr.uniform(0, 6.3)
        ln, wd = r * rr.uniform(1.05, 1.45), rr.uniform(0.12, 0.24)
        da = np.abs(np.angle(np.exp(1j * (th - a0))))
        rays |= (da < wd * (1 - d / ln)) & (d < ln)
    return (rays | (d < edge * 0.8)), d < edge * 0.55, d < edge * 0.28


def scorch_floor(X, Y, r, seed):
    outer, mid, core = star(FX - X, FY - Y, r, seed)
    ok = nonblack & ~on_back & ~on_left
    mul(ok & outer, (0.74, 0.72, 0.75))
    mul(ok & mid, (0.74, 0.72, 0.75))
    mul(ok & core, (0.8, 0.78, 0.8))


def scorch_wall(X, Z, r, seed):
    outer, mid, core = star(A - X, WZ - Z, r, seed, up=True)
    ok = nonblack & on_back
    mul(ok & outer, (0.74, 0.72, 0.75))
    mul(ok & mid, (0.74, 0.72, 0.75))


def hole(x, y, big=False):
    """A bullet hole: dark, with a chipped lighter rim up and to the left."""
    if not nonblack[y, x]:
        return
    lit = np.clip(art[y, x].astype(int) * 1.5 + 18, 0, 255).astype(np.uint8)
    art[y - 1, x - 1] = lit
    art[y - 1, x] = lit
    art[y, x - 1] = lit
    art[y, x] = INK
    art[y, x + 1] = INK
    if big:
        art[y + 1, x] = INK
        art[y + 1, x + 1] = INK
        art[y + 1, x - 1] = lit


def burst_wall(X0, Z0, X1, Z1, n, seed, jit=0.12):
    r = random.Random(seed)
    for i in range(n):
        t = (i + r.uniform(-0.3, 0.3)) / max(1, n - 1)
        x, y = W_(X0 + (X1 - X0) * t + r.gauss(0, jit), Z0 + (Z1 - Z0) * t + r.gauss(0, jit))
        hole(x, y, r.random() < 0.3)


def burst_floor(X0, Y0, X1, Y1, n, seed, jit=0.15):
    r = random.Random(seed)
    for i in range(n):
        t = (i + r.uniform(-0.3, 0.3)) / max(1, n - 1)
        x, y = Pi(X0 + (X1 - X0) * t + r.gauss(0, jit), Y0 + (Y1 - Y0) * t + r.gauss(0, jit))
        if nonblack[y, x]:
            art[y, x] = INK
            art[y, x + 1] = (art[y, x + 1] * 0.55).astype(np.uint8)
            art[y - 1, x] = np.clip(art[y - 1, x].astype(int) * 1.35 + 10, 0, 255).astype(np.uint8)


def brass(X, Y, n, seed, spread=0.5):
    r = random.Random(seed)
    for _ in range(n):
        x, y = Pi(X + r.gauss(0, spread), Y + r.gauss(0, spread))
        if nonblack[y, x]:
            art[y, x] = (232, 190, 110)
            art[y, x + 1] = (150, 110, 50)


def crack(x, y, n, length, seed, col=(178, 226, 243)):
    """A shot through glass on the back wall: a dark hole and cracks running out from it."""
    r = random.Random(seed)

    def draw(d):
        for i in range(n):
            a = i * 6.283 / n + r.uniform(-0.3, 0.3)
            px_, py_ = float(x), float(y)
            pts = [(x, y)]
            for _ in range(r.randint(2, 3)):
                a += r.uniform(-0.45, 0.45)
                seg = length * r.uniform(0.3, 0.6)
                px_ += math.cos(a) * seg
                py_ += math.sin(a) * seg + math.cos(a) * seg * 0.5
                pts.append((round(px_), round(py_)))
            d.line(pts, fill=col)
        d.rectangle([x - 1, y - 1, x + 1, y + 1], fill=INK)
        d.point((x - 2, y - 1), fill=(239, 248, 255))
    paint(draw)


def gunfire():
    # scorch: a blast at the lift post, one in the middle of the market, others where the fighting crossed the street
    scorch_floor(25.2, 3.4, 1.25, 1)
    scorch_floor(30.3, 6.6, 1.35, 2)
    scorch_floor(9.2, 9.0, 0.8, 3)
    scorch_floor(16.6, 3.3, 0.85, 4)
    scorch_floor(39.6, 3.6, 1.0, 5)
    scorch_floor(21.5, 7.4, 0.75, 6)
    scorch_wall(26.0, 0.9, 0.85, 7)
    scorch_wall(9.0, 0.7, 0.8, 8)
    scorch_wall(36.9, 0.8, 0.75, 9)
    scorch_wall(15.75, 0.6, 0.55, 10)
    # bursts across the walls
    burst_wall(8.5, 1.3, 10.6, 2.5, 9, 31)
    burst_wall(1.0, 1.9, 2.3, 1.4, 5, 32)
    burst_wall(11.3, 1.0, 12.2, 1.5, 4, 33)  # the corner of the mural
    burst_wall(15.45, 2.6, 16.0, 1.1, 6, 34, 0.07)
    burst_wall(22.3, 1.2, 23.3, 2.6, 7, 35, 0.1)
    burst_wall(23.4, 2.9, 25.5, 3.3, 8, 36, 0.1)  # the lift's frame
    burst_wall(25.45, 0.6, 25.6, 2.6, 6, 37, 0.06)
    burst_wall(26.3, 3.1, 30.4, 3.45, 11, 38, 0.1)  # over the stall
    burst_wall(34.9, 1.2, 37.0, 2.6, 9, 39)
    burst_wall(38.9, 2.0, 40.6, 1.2, 7, 40)
    burst_wall(41.0, 1.7, 41.8, 2.6, 4, 41, 0.08)
    burst_wall(43.5, 2.3, 44.3, 1.2, 5, 42, 0.08)
    # and the floor
    burst_floor(22.6, 4.4, 26.6, 5.6, 11, 51)
    burst_floor(27.2, 6.0, 31.5, 4.9, 12, 52)
    burst_floor(12.0, 5.5, 16.0, 6.4, 9, 53)
    burst_floor(8.4, 9.2, 12.2, 7.6, 9, 54)
    burst_floor(36.5, 5.5, 41.0, 4.2, 10, 55)
    burst_floor(18.0, 8.6, 22.5, 9.1, 8, 56)
    burst_floor(31.5, 8.8, 35.5, 7.4, 8, 57)
    # the vending machine and the Concierge's wall of screens take a few
    for x, y in ((1401, 674), (1409, 690), (1398, 703), (1415, 712), (1422, 681)):
        hole(x, y, True)
    for x, y in ((592, 418), (618, 447), (641, 470), (604, 462)):
        hole(x, y, True)
    cells = isin(art, ((79, 75, 103),)) & box(556, 376, 676, 512)
    lab, n = ndi.label(cells)
    r = random.Random(61)
    for i in r.sample(range(1, n + 1), min(n, 16)):
        art[lab == i] = (40, 38, 58)
    # glass: the chrome clinic's window, twice, and its front panel
    crack(1347, 652, 7, 16, 71)
    crack(1326, 618, 6, 11, 72)
    crack(1366, 694, 5, 9, 73)
    # spent brass where the shooting was done from
    brass(24.9, 2.6, 12, 81, 0.3)
    brass(22.4, 3.4, 8, 82, 0.28)
    brass(29.0, 7.6, 10, 83, 0.35)
    brass(13.2, 8.6, 8, 84, 0.3)
    brass(37.8, 4.6, 9, 85, 0.35)
    brass(20.2, 4.2, 6, 86, 0.3)


# ---------------------------------------------------------------- emergency light

LAMPS = [(1.4, 3.3), (9.4, 3.3), (15.45, 3.25), (22.75, 3.75), (33.9, 3.55), (42.6, 3.3)]  # on the back wall: X, Z


SIDE = ((40, 38, 58), (29, 29, 46), (22, 22, 39), (17, 16, 29))


def lamps_and_strip():
    strip = np.zeros((H, W), bool)
    for x in range(48, 1790):
        col = np.nonzero(nonblack[:, x])[0]
        if not len(col):
            continue
        yb = col[-1]
        if tuple(calm[yb - 19, x]) in SIDE and tuple(calm[yb - 5, x]) in SIDE:
            strip[yb - 20:yb - 17, x] = True
    strip = ndi.binary_opening(strip, structure=np.ones((1, 5), bool))
    art[strip] = STRIP
    glow_src[strip] = STRIP
    for X, Z in LAMPS:
        x, y = W_(X, Z)
        art[y - 2:y + 2, x - 2:x + 3] = (20, 17, 34)
        art[y - 1:y + 1, x - 1:x + 2] = RED_LAMP
        art[y - 1, x] = (255, 190, 160)
        glow_src[y - 2:y + 2, x - 2:x + 3] = RED_LAMP
    return strip


def light():
    """Grade the whole picture: a dark street, red pools under the emergency lamps, and the lights that still work."""
    ambient = np.array((0.46, 0.42, 0.56))
    px_ = np.where(on_back, A, np.where(on_left, 0.0, FX))
    py_ = np.where(on_back, 0.0, np.where(on_left, -A, FY))
    pz_ = np.where(on_back, WZ, np.where(on_left, LZ, 0.0))
    nz = 0.5 * np.sin(xs / 17.0 + ys / 29.0) + 0.3 * np.sin(xs / 41.0 - ys / 13.0 + 1.7) + 0.2 * np.sin(xs / 7.3 + ys / 9.1)
    lights = [((X, 0.25, Z), 4.7, (0.50, 0.03, -0.10)) for X, Z in LAMPS]
    lights += [
        ((5.4, 0.4, 2.6), 5.2, (0.34, 0.34, 0.38)),  # the 11:00 board
        ((6.3, 4.4, 0.4), 4.6, (0.08, 0.06, 0.16)),  # the queue's own ropes
        ((19.1, 0.5, 1.9), 6.2, (0.18, 0.08, 0.26)),  # the window on the black hole
        ((24.4, 0.9, 2.4), 3.8, (0.26, 0.32, 0.50)),  # the company's lift
        ((28.3, 2.0, 1.8), 5.4, (0.62, 0.58, 0.44)),  # the noodle counter
        ((30.0, 5.6, 2.4), 3.8, (0.40, 0.34, 0.24)),  # the two strings still lit
        ((30.0, 8.4, 2.4), 3.2, (0.34, 0.28, 0.20)),
        ((35.6, 4.6, 2.4), 3.6, (0.36, 0.32, 0.26)),
        ((35.6, 8.0, 2.4), 3.2, (0.30, 0.26, 0.20)),
        ((33.0, 1.6, 1.6), 4.8, (0.50, 0.62, 0.60)),  # the chrome clinic
        ((25.8, 7.7, 1.4), 2.2, (0.16, 0.26, 0.26)),  # the first cart's lantern
        ((45.3, 0.8, 2.0), 4.6, (0.56, 0.56, 0.62)),  # the Med Bay and its 99.97%
    ]
    M = np.ones((H, W, 3)) * ambient
    for (lx, ly, lz), r, k in lights:
        d = np.sqrt((px_ - lx) ** 2 + (py_ - ly) ** 2 + (pz_ - lz) ** 2)
        w = np.clip(1 - d / r, 0, 1) + nz * 0.035
        q = np.clip(np.round(w * 5) / 5, 0, 1)
        M += q[..., None] * np.array(k)
    M = np.clip(M, 0, 1.0)
    # anything that is itself a light keeps its colour: bulbs, signs, the board's digits, screens, the ropes
    emissive = isin(art, (AMBER, TEAL, (254, 221, 154), (255, 154, 58), (239, 234, 255), (184, 171, 254), (106, 76, 255), (138, 108, 254), (195, 253, 242), (106, 255, 216), BELT_TOP, (139, 121, 230), CAP, STRIP, RED_LAMP, (255, 190, 160)))
    emissive &= (glow_calm.max(axis=2) >= 34) | isin(art, (STRIP, RED_LAMP, (255, 190, 160), BELT_TOP)) | box(1058, 418, 1118, 452)
    keep = emissive | unlit
    out = art.astype(float) * M
    out[keep] = art[keep]
    return np.clip(out, 0, 255).astype(np.uint8)


def glow():
    g = glow_calm.copy()
    kill = Image.fromarray((glow_kill * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))
    g *= (1 - np.array(kill)[..., None] / 255.0)
    src = Image.fromarray(np.clip(glow_src, 0, 255).astype(np.uint8))
    tight = np.array(src.filter(ImageFilter.GaussianBlur(3.2))).astype(float) * 1.5
    wide = np.array(src.filter(ImageFilter.GaussianBlur(14))).astype(float) * 1.3
    return np.clip(g + tight + wide, 0, 255).astype(np.uint8)


def save(img, rel):
    img.save(Path("assets") / rel, optimize=True)
    data = (Path("assets") / rel).read_bytes()
    manifest = Path("assets/manifest.yaml")
    text = manifest.read_text()
    pattern = re.compile(rf'(  - path: {re.escape(rel)}\n(?:    (?!sha256).*\n)*?    sha256: ")[0-9a-f]+("\n    bytes: )\d+')
    text, n = pattern.subn(lambda m: f"{m.group(1)}{hashlib.sha256(data).hexdigest()}{m.group(2)}{len(data)}", text)
    assert n == 1, rel
    manifest.write_text(text)


def main():
    lanterns()
    signs()
    queue()
    lift()
    market()
    dock()
    gunfire()
    lamps_and_strip()
    base, lit = light(), glow()
    save(Image.fromarray(base), "maps/promenade/base-takeover.png")
    save(Image.fromarray(lit), "maps/promenade/glow-takeover.png")
    if len(sys.argv) > 1:  # as the app shows them: glow screened over base
        look = Path(sys.argv[1])
        look.mkdir(parents=True, exist_ok=True)
        for name, b, g in (("takeover", base, lit), ("calm", calm, glow_calm)):
            comp = 255 - (255 - b.astype(int)) * (255 - g.astype(int)) // 255
            Image.fromarray(comp.astype(np.uint8)).save(look / f"preview-{name}.png")


if __name__ == "__main__":
    main()
