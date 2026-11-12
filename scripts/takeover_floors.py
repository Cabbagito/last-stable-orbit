#!/usr/bin/env python3
"""Paint the Takeover mood for decks 6 to 9, the Secure floor and the Bot bays, each over its Alert art.

Act 4: the mercenaries hold the station. Alert already has the dark, the red lamps and the orange edge strip, so this
only adds what they did: gunfire, broken glass, dead screens, and what was dropped or thrown about. Nothing structural
moves, so tokens stay where they were. Peter approved the six pictures on the LSO - Takeover canvas
(https://claude.ai/artifact/Gmv7MPt5H32nqnzCGusGoo) on 2026-11-12. The Promenade's is scripts/promenade_takeover.py.
Run it from the repo root, for all six or for the maps named:

    uv run --no-project --with pillow --with numpy --with scipy python scripts/takeover_floors.py [map ...]

It writes assets/maps/<map>/base-takeover.png and lists each in assets/manifest.yaml, with its sha256 and size.
"""

import hashlib
import math
import random
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ASSETS = Path("assets/maps")
MANIFEST = Path("assets/manifest.yaml")
ON_CANVAS = {  # each picture's asset id in the Takeover canvas's store
    "deck-6": "75a1a3a6d8de6e9ab4664c5b452e0d65",
    "deck-7": "fa0557e4756d6490e36114e338c1db10",
    "deck-8": "85f8b0a18c099fd7dd088dbd5e463fbe",
    "deck-9": "47fb3d7717aa8e045fd2e07aad91bc40",
    "secure": "8846e8db23f2ce161dbca404a13c28f7",
    "bots": "85d1acf043641f4535cb477befc0104a",
}
INK = (11, 8, 17)
GLASS = ((131, 171, 204), (94, 116, 155), (94, 116, 155), (178, 226, 243))
PAPER = ((176, 168, 192), (150, 142, 170), (196, 186, 204))
PETALS = ((214, 208, 232), (226, 84, 150), (232, 190, 210), (200, 60, 46), (232, 200, 140))
BOOKS = ((62, 74, 140), (44, 104, 76), (196, 150, 62), (150, 52, 40), (120, 70, 44))
RED = lambda a: (a[..., 0] > 190) & (a[..., 1] < 150) & (a[..., 2] < 130)
GREEN = lambda a: (a[..., 1] > 150) & (a[..., 0] < 150)


class Floor:
    def __init__(self, name, origin):
        self.name = name
        self.src = np.array(Image.open(ASSETS / name / "base-alert.png").convert("RGB"))
        self.art = self.src.copy()
        self.H, self.W = self.art.shape[:2]
        self.ox, self.oy = origin
        ys, xs = np.mgrid[0:self.H, 0:self.W]
        self.xs, self.ys = xs, ys
        self.A, self.B = (xs - self.ox) / 30.0, (ys - self.oy) / 15.0
        self.FX, self.FY = (self.A + self.B) / 2, (self.B - self.A) / 2
        self.WZ = (self.A * 15 + self.oy - ys) / 36.0
        self.LZ = (-self.A * 15 + self.oy - ys) / 36.0
        self.on_back = (self.A >= 0) & (self.WZ > 0)
        self.on_left = (self.A < 0) & (self.LZ > 0)
        self.solid = self.src.max(axis=2) > 0

    def P(self, X, Y, Z=0.0):
        return round((X - Y) * 30 + self.ox), round((X + Y) * 15 - Z * 36 + self.oy)

    def ok(self, x, y):
        return 2 <= x < self.W - 2 and 2 <= y < self.H - 2 and self.solid[y, x]

    def paint(self, fn):
        im = Image.fromarray(self.art)
        fn(ImageDraw.Draw(im))
        self.art = np.array(im)

    def mul(self, mask, k):
        self.art[mask] = np.clip(self.art[mask] * np.array(k, float), 0, 255).astype(np.uint8)

    def box(self, x0, y0, x1, y1):
        m = np.zeros((self.H, self.W), bool)
        m[y0:y1, x0:x1] = True
        return m

    def heal(self, mask):
        idx = ndi.distance_transform_edt(mask, return_distances=False, return_indices=True)
        self.art[mask] = self.art[idx[0][mask], idx[1][mask]]

    # ---- gunfire

    def hole(self, x, y, big=False):
        if not self.ok(x, y):
            return
        a = self.art
        lit = np.clip(a[y, x].astype(int) * 1.6 + 26, 0, 255).astype(np.uint8)
        a[y - 1, x - 1] = lit
        a[y - 1, x] = lit
        a[y, x - 1] = lit
        a[y, x] = INK
        a[y, x + 1] = INK
        if big:
            a[y + 1, x] = INK
            a[y + 1, x + 1] = INK
            a[y + 1, x - 1] = lit

    def burst(self, p0, p1, n, seed, jit=0.1, flat=False):
        """A line of bullet holes from one point of the world to another. flat: on a floor or table top."""
        r = random.Random(seed)
        for i in range(n):
            t = (i + r.uniform(-0.3, 0.3)) / max(1, n - 1)
            q = [p0[k] + (p1[k] - p0[k]) * t for k in range(3)]
            if flat:
                q[0] += r.gauss(0, jit)
                q[1] += r.gauss(0, jit)
            elif p0[1] == p1[1] == 0:
                q[0] += r.gauss(0, jit)
                q[2] += r.gauss(0, jit)
            elif p0[0] == p1[0] == 0:
                q[1] += r.gauss(0, jit)
                q[2] += r.gauss(0, jit)
            x, y = self.P(*q)
            if flat:
                if self.ok(x, y):
                    a = self.art
                    a[y, x] = INK
                    a[y, x + 1] = (a[y, x + 1] * 0.55).astype(np.uint8)
                    a[y - 1, x] = np.clip(a[y - 1, x].astype(int) * 1.5 + 18, 0, 255).astype(np.uint8)
            else:
                self.hole(x, y, r.random() < 0.3)

    def star(self, u, v, r, seed, up=False):
        rr = random.Random(seed)
        th, d = np.arctan2(v, u), np.hypot(u, v)
        edge = r * (1 + 0.10 * np.sin(4 * th + rr.uniform(0, 6.3)) + 0.06 * np.sin(9 * th + rr.uniform(0, 6.3)))
        rays = np.zeros((self.H, self.W), bool)
        for _ in range(rr.randint(6, 8)):
            a0 = rr.uniform(0.25 * math.pi, 0.75 * math.pi) if up and rr.random() < 0.5 else rr.uniform(0, 6.3)
            ln, wd = r * rr.uniform(1.05, 1.45), rr.uniform(0.12, 0.24)
            da = np.abs(np.angle(np.exp(1j * (th - a0))))
            rays |= (da < wd * (1 - d / ln)) & (d < ln)
        return (rays | (d < edge * 0.8)), d < edge * 0.55

    def scorch(self, X, Y, r, seed):
        outer, mid = self.star(self.FX - X, self.FY - Y, r, seed)
        ok = self.solid & ~self.on_back & ~self.on_left
        self.mul(ok & outer, (0.66, 0.64, 0.68))
        self.mul(ok & mid, (0.66, 0.64, 0.68))

    def scorch_wall(self, X, Z, r, seed):
        outer, mid = self.star(self.A - X, self.WZ - Z, r, seed, up=True)
        self.mul(self.solid & self.on_back & outer, (0.66, 0.64, 0.68))
        self.mul(self.solid & self.on_back & mid, (0.66, 0.64, 0.68))

    def scorch_left(self, Y, Z, r, seed):
        outer, mid = self.star(-self.A - Y, self.LZ - Z, r, seed, up=True)
        self.mul(self.solid & self.on_left & outer, (0.66, 0.64, 0.68))
        self.mul(self.solid & self.on_left & mid, (0.66, 0.64, 0.68))

    def crack(self, x, y, n, length, seed, shear=0.5, col=(178, 226, 243)):
        """A shot through glass: a dark hole, and cracks running out from it along the pane."""
        r = random.Random(seed)

        def draw(d):
            for i in range(n):
                a = i * 6.283 / n + r.uniform(-0.3, 0.3)
                px, py = float(x), float(y)
                pts = [(x, y)]
                for _ in range(r.randint(2, 3)):
                    a += r.uniform(-0.45, 0.45)
                    seg = length * r.uniform(0.3, 0.6)
                    px += math.cos(a) * seg
                    py += math.sin(a) * seg + math.cos(a) * seg * shear
                    pts.append((round(px), round(py)))
                d.line(pts, fill=col)
            d.rectangle([x - 1, y - 1, x + 1, y + 1], fill=INK)
            d.point((x - 2, y - 1), fill=(239, 248, 255))
        self.paint(draw)

    def brass(self, X, Y, n, seed, spread=0.3):
        r = random.Random(seed)
        for _ in range(n):
            x, y = self.P(X + r.gauss(0, spread), Y + r.gauss(0, spread))
            if self.ok(x, y):
                self.art[y, x] = (232, 190, 110)
                self.art[y, x + 1] = (150, 110, 50)

    # ---- what's on the floor

    def scatter(self, X, Y, sx, sy, n, seed, cols, size=(2, 1), Z=0.0, k=1.0):
        """Small things thrown about a point of the floor: paper, glass, books, food."""
        r = random.Random(seed)

        def draw(d):
            for _ in range(n):
                x, y = self.P(X + r.gauss(0, sx), Y + r.gauss(0, sy), Z)
                if not self.ok(x, y):
                    continue
                c = tuple(int(v * k) for v in r.choice(cols))
                w, h = r.randint(min(1, size[0]), size[0]), r.randint(0, size[1])
                if w > 1:
                    d.line([(x, y), (x + w, y)], fill=c)
                    d.line([(x + 1, y + 1), (x + w + 1, y + 1)], fill=tuple(int(v * 0.8) for v in c))
                    d.point((x + w + 1, y + 2), fill=tuple(int(v * 0.3) for v in c))
                else:
                    d.rectangle([x, y, x + w, y + h], fill=c)
        self.paint(draw)

    def shards(self, X, Y, sx, sy, n, seed, Z=0.0):
        r = random.Random(seed)

        def draw(d):
            for i in range(n):
                x, y = self.P(X + r.gauss(0, sx), Y + r.gauss(0, sy), Z)
                if not self.ok(x, y):
                    continue
                c = r.choice(GLASS)
                d.point((x, y), fill=c)
                if r.random() < 0.5:
                    d.point((x + 1, y + r.choice((0, 1))), fill=GLASS[1])
                if r.random() < 0.18:
                    d.polygon([(x, y), (x + 3, y - 2), (x + 5, y + 1)], fill=GLASS[1], outline=(63, 72, 106))
                    d.line([(x, y), (x + 3, y - 2)], fill=GLASS[3])
        self.paint(draw)

    def flowers(self, points, seed, petals=8, Z=0.0):
        r = random.Random(seed)

        def draw(d):
            for X, Y in points:
                x, y = self.P(X, Y, Z)
                if not self.ok(x, y):
                    continue
                f = r.choice((-1, 1))
                d.polygon([(x, y), (x + 6 * f, y - 2), (x + 5 * f, y + 3)], fill=(150, 142, 178), outline=(96, 90, 124))
                for k in range(3):
                    ex, ey = x - (5 + (k % 2) * 3) * f, y - 4 + k * 3
                    d.line([(x, y + 1), (ex, ey)], fill=(34, 96, 74))
                    c = PETALS[(k + int(X * 3)) % len(PETALS)]
                    d.rectangle([ex - 1, ey - 1, ex + 1, ey + 1], fill=c)
                    d.point((ex, ey), fill=(240, 214, 150))
                for _ in range(petals):
                    px, py = self.P(X + r.gauss(0, 0.5), Y + r.gauss(0, 0.5), Z)
                    if self.ok(px, py):
                        d.point((px, py), fill=r.choice(PETALS))
        self.paint(draw)

    def puddle(self, X, Y, rx, ry, seed, col, shine):
        rr = random.Random(seed)
        th = np.arctan2((self.FY - Y) / ry, (self.FX - X) / rx)
        d = np.hypot((self.FX - X) / rx, (self.FY - Y) / ry) / (1 + 0.16 * np.sin(3 * th + rr.uniform(0, 6)) + 0.1 * np.sin(5 * th + rr.uniform(0, 6)))
        ok = self.solid & ~self.on_back & ~self.on_left
        m = ok & (d < 1)
        self.art[m] = (self.art[m] * 0.35 + np.array(col) * 0.65).astype(np.uint8)
        edge = ok & (d < 1) & (d > 0.86) & (self.FX + self.FY < X + Y)
        self.art[edge] = shine

    def iso_box(self, d, X, Y, Z, sx, sy, sz, top, left, right):
        P = self.P
        t = [P(X, Y, Z + sz), P(X + sx, Y, Z + sz), P(X + sx, Y + sy, Z + sz), P(X, Y + sy, Z + sz)]
        lf = [P(X, Y + sy, Z + sz), P(X + sx, Y + sy, Z + sz), P(X + sx, Y + sy, Z), P(X, Y + sy, Z)]
        rt = [P(X + sx, Y, Z + sz), P(X + sx, Y + sy, Z + sz), P(X + sx, Y + sy, Z), P(X + sx, Y, Z)]
        d.polygon(lf, fill=left)
        d.polygon(rt, fill=right)
        d.polygon(t, fill=top)
        d.line([t[0], t[1], rt[3], rt[2], lf[3], t[3], t[0]], fill=INK)
        d.line([t[3], t[2], t[1]], fill=tuple(max(0, c - 22) for c in top))
        d.line([t[2], rt[2]], fill=INK)

    # ---- screens and lights

    def kill(self, box, pred, frac, seed, k=0.2, crack=0.5, keep=()):
        """Screens or lit cells inside the box that have gone dark, some of them cracked."""
        r = random.Random(seed)
        lab, n = ndi.label(self.box(*box) & pred(self.art))
        sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
        ids = [i for i in range(1, n + 1) if sizes[i - 1] >= 4 and i not in keep]
        dead = r.sample(ids, round(len(ids) * frac))
        for i in dead:
            m = lab == i
            self.mul(m, (k, k * 0.9, k * 1.1))
            if sizes[i - 1] >= 30 and r.random() < crack:
                yy, xx = np.nonzero(m)
                j = r.randrange(len(xx))
                x, y = int(xx[j]), int(yy[j])
                for dx, dy in ((0, 0), (1, 1), (2, 1), (3, 3), (-1, -1), (-2, -3), (1, -1), (2, -3)):
                    if 0 <= y + dy < self.H and 0 <= x + dx < self.W and m[y + dy, x + dx]:
                        self.art[y + dy, x + dx] = (150, 130, 150)
        return len(ids), len(dead)

    def save(self):
        rel = f"maps/{self.name}/base-takeover.png"
        Image.fromarray(self.art).save(Path("assets") / rel, optimize=True)
        data = (Path("assets") / rel).read_bytes()
        entry = (
            f'  - path: {rel}\n    store: TAKEOVER\n    asset_id: "{ON_CANVAS[self.name]}"\n'
            f'    sha256: "{hashlib.sha256(data).hexdigest()}"\n    bytes: {len(data)}\n    width: {self.W}\n    height: {self.H}\n'
        )
        text = MANIFEST.read_text()
        mine = re.compile(rf"  - path: {re.escape(rel)}.*\n(?:    .*\n)+")
        if mine.search(text):
            text = mine.sub(lambda m: entry, text, count=1)
        else:  # straight after the Alert picture it is painted over
            alert = re.search(rf"  - path: maps/{re.escape(self.name)}/base-alert\.png.*\n(?:    .*\n)+", text)
            text = text[:alert.end()] + entry + text[alert.end():]
        MANIFEST.write_text(text)


# ---------------------------------------------------------------- the six floors

def deck_6():
    f = Floor("deck-6", (460, 150))
    # They came up in the lift. Its guard desk took the first of it.
    f.scorch(11.4, 3.7, 1.1, 1)
    f.scorch_wall(12.0, 0.8, 0.8, 2)
    f.burst((10.2, 0, 1.0), (12.6, 0, 2.9), 10, 3, 0.12)
    f.burst((10.4, 2.75, 0.25), (12.2, 2.75, 0.75), 6, 4, 0.05)
    f.kill((736, 292, 768, 326), RED, 1.0, 5, crack=1.0)
    f.brass(12.4, 3.0, 12, 6)
    f.brass(10.0, 4.4, 8, 7)
    # The reviewers' rows: a third of the screens are dead, and the day's paper is on the floor.
    f.kill((430, 284, 840, 506), RED, 0.36, 8)
    f.scatter(10.6, 6.2, 2.4, 1.6, 70, 9, PAPER, (2, 1))
    f.scatter(8.2, 4.6, 1.2, 0.8, 18, 10, PAPER, (2, 1))
    f.burst((8.2, 4.2, 0), (13.6, 5.4, 0), 11, 11, 0.15, flat=True)
    f.burst((12.6, 8.2, 0), (16.8, 6.6, 0), 9, 12, 0.15, flat=True)
    f.scorch(14.6, 5.6, 0.8, 13)
    # The Throughput board has lost its right half.
    bars = f.box(650, 170, 730, 226) & (f.art[..., 0] > 170) & (f.xs > 688)
    f.mul(bars, (0.24, 0.22, 0.26))
    f.burst((7.6, 0, 1.7), (8.6, 0, 2.5), 4, 14, 0.08)
    # Ahti's closet is open, and the Vigil's flowers are trodden out of it into the hall.
    f.flowers([(15.0, 2.4), (14.3, 3.1), (15.6, 3.4), (13.6, 4.0), (14.8, 4.5)], 15, petals=10)
    # The canteen: what was on the tables is on the floor, and the cooler is leaking.
    f.scatter(11.2, 10.9, 1.6, 0.9, 34, 16, ((200, 150, 80), (150, 142, 170), (176, 96, 60), (120, 116, 150)), (2, 1))
    f.scatter(16.3, 11.9, 0.8, 0.6, 16, 17, ((176, 168, 192), (120, 116, 150)), (2, 1))
    f.puddle(6.9, 12.5, 0.95, 0.6, 18, (44, 74, 120), (110, 150, 200))
    f.burst((0, 5.0, 0.7), (0, 6.8, 1.9), 6, 19, 0.1)  # the lockers
    f.burst((2.0, 0, 1.0), (4.6, 0, 2.6), 6, 20, 0.12)  # the archive
    f.scatter(3.2, 0.9, 1.0, 0.3, 14, 21, PAPER + ((150, 70, 40),), (2, 1))
    f.save()


def deck_7():
    f = Floor("deck-7", (460, 150))
    # The glass offices: the wall along the corridor (Y 8.55) is shot through in the first two, and so is the
    # partition between them. The third office, with the sofa, keeps its glass.
    for i, (X, Z, n, ln) in enumerate(((1.3, 1.2, 7, 17), (3.4, 0.8, 6, 12), (4.2, 1.5, 5, 9), (6.3, 1.1, 8, 18), (8.4, 0.7, 6, 13), (9.0, 1.5, 5, 10), (7.4, 1.6, 5, 8))):
        x, y = f.P(X, 8.55, Z)
        f.crack(x, y, n, ln, 30 + i, 0.5)
    for i, (Y, Z, n, ln) in enumerate(((9.9, 1.1, 6, 14), (11.6, 0.9, 6, 12), (12.6, 1.5, 4, 8))):
        x, y = f.P(5.0, Y, Z)
        f.crack(x, y, n, ln, 40 + i, -0.5)
    f.shards(2.6, 8.4, 1.4, 0.55, 60, 44)
    f.shards(7.4, 8.4, 1.5, 0.55, 70, 45)
    f.shards(5.0, 10.8, 0.45, 1.2, 40, 46)
    f.burst((1.0, 8.0, 0), (9.6, 7.4, 0), 14, 47, 0.14, flat=True)
    f.scatter(2.6, 10.6, 1.0, 0.9, 22, 48, PAPER)
    f.scatter(7.6, 10.8, 1.0, 0.9, 20, 49, PAPER)
    f.brass(11.4, 7.2, 12, 50)
    f.scorch(10.6, 6.6, 0.85, 51)
    # The security office: half the wall of monitors is dead, some of it cracked.
    f.kill((824, 232, 946, 366), RED, 0.5, 52, crack=0.7)
    f.burst((13.2, 0, 1.2), (16.6, 0, 2.6), 7, 53, 0.14)
    f.scatter(14.6, 3.0, 0.8, 0.6, 12, 54, PAPER)
    # Irena's room, turned over: half her plots off the wall, the paper across the floor.
    lit = f.on_back & (f.art[..., 0] > 110) & (f.art[..., 0].astype(int) - f.art[..., 2] > 50)
    for a0, a1, z0, z1 in ((1.0, 2.55, 0.8, 2.1), (2.55, 4.1, 2.1, 3.7), (4.1, 5.7, 0.8, 2.1)):
        f.mul(lit & (f.A > a0) & (f.A < a1) & (f.WZ > z0) & (f.WZ < z1), (0.28, 0.3, 0.36))
    f.scatter(3.3, 2.4, 1.5, 1.0, 46, 56, PAPER + ((200, 110, 80),), (2, 1))
    f.scatter(4.4, 0.7, 1.2, 0.3, 14, 57, PAPER + ((200, 110, 80),), (2, 1))
    # The power closet's door, forced.
    f.scorch_wall(7.4, 0.6, 0.35, 58)
    f.burst((7.0, 0, 0.8), (8.2, 0, 2.2), 6, 59, 0.08)
    f.scorch(7.6, 1.6, 0.6, 60)
    f.save()


def deck_8():
    f = Floor("deck-8", (460, 150))
    # The checkpoint took the fight: the heavy door's frame and the wall around it, the desk, the floor in front.
    f.burst((8.9, 0, 0.7), (10.0, 0, 3.0), 8, 1, 0.1)
    f.burst((11.6, 0, 3.0), (12.2, 0, 0.7), 8, 2, 0.1)
    f.burst((9.6, 0, 3.15), (11.9, 0, 3.3), 6, 3, 0.07)
    f.scorch_wall(11.3, 0.8, 0.8, 4)
    f.scorch(10.6, 1.4, 0.7, 5)
    f.scorch(10.2, 5.2, 1.15, 6)
    f.kill((690, 262, 830, 300), RED, 1.0, 7, crack=1.0)
    f.burst((9.2, 2.9, 0.3), (11.0, 2.9, 0.8), 6, 8, 0.05)
    f.brass(11.6, 4.4, 14, 9)
    f.brass(9.0, 5.6, 9, 10)
    f.shards(10.6, 2.0, 0.7, 0.5, 26, 11)
    f.burst((6.0, 4.6, 0), (12.6, 6.2, 0), 13, 12, 0.16, flat=True)
    # The boardroom: a burst down the length of the table, and what was on it on the floor.
    f.burst((2.7, 10.4, 0.8), (9.2, 10.4, 0.8), 11, 13, 0.1, flat=True)
    f.scatter(6.0, 10.5, 2.6, 1.2, 60, 14, PAPER, (2, 1))
    f.shards(5.4, 11.5, 2.0, 0.4, 26, 15)
    f.burst((0, 8.6, 0.9), (0, 12.6, 1.9), 8, 16, 0.12)
    # The lounge: the drinks cabinet smashed, bottles on the floor, the sofas slashed.
    f.shards(6.0, 1.5, 0.55, 0.35, 40, 17)
    f.scatter(6.0, 1.5, 0.55, 0.35, 16, 18, ((208, 153, 79), (201, 108, 24), (150, 90, 40)), (2, 1))
    f.burst((5.8, 0, 0.9), (7.4, 0, 1.9), 5, 20, 0.08)

    def slashes(d):
        for x0, y0, x1, y1 in ((452, 152, 470, 176), (478, 166, 492, 187), (500, 178, 508, 196), (548, 198, 566, 222), (574, 212, 588, 233), (596, 226, 604, 240)):
            d.line([(x0, y0), (x1, y1)], fill=(86, 14, 18))
            d.line([(x0 + 1, y0), (x1 + 1, y1)], fill=(196, 104, 96))
    f.paint(slashes)
    f.scatter(4.6, 1.6, 1.4, 0.7, 14, 21, ((214, 190, 170), (176, 168, 192)), (2, 1))
    # The dashboard: every eval still green, bar the cells that took a round.
    f.kill((338, 56, 436, 176), GREEN, 0.14, 22, k=0.16, crack=0)
    f.burst((0, 1.4, 1.6), (0, 3.4, 2.9), 5, 23, 0.1)
    # The offices by the stairs.
    f.scatter(12.6, 11.4, 0.9, 0.7, 18, 24, PAPER)
    f.scatter(17.0, 11.2, 0.9, 0.7, 14, 25, PAPER)
    f.save()


def deck_9():
    f = Floor("deck-9", (460, 150))
    # Looted, not fought over. The gallery: three of the four cases smashed, the model and the helmet gone. The
    # blueprints are still under their broken glass, and the first terminal is still on.
    for i, (X, Y, Z, ex, ey, rx, ry) in enumerate(((12.22, 1.92, 1.39, 769, 313, 15, 9), (15.0, 2.0, 1.47, 850, 350, 11, 11))):
        gone = ((f.xs - ex) / rx) ** 2 + ((f.ys - ey) / ry) ** 2 <= 1
        top = ndi.binary_dilation(gone, iterations=5) & ~gone & (f.art[..., 0] > 170) & (f.art[..., 1] > 90) & (f.art[..., 2] < 120)
        cols, counts = np.unique(f.art[top], axis=0, return_counts=True)
        f.art[gone] = cols[counts.argmax()]
    for i, (X, Y, Z) in enumerate(((12.22, 1.92, 1.55), (15.0, 2.0, 1.65), (12.37, 5.1, 1.4))):
        x, y = f.P(X, Y, Z)
        f.crack(x - 6, y + 2, 6, 13, 30 + i, 0.25)
        f.crack(x + 9, y - 4, 5, 9, 33 + i, -0.25)
        f.shards(X + 0.5, Y + 0.6, 0.75, 0.75, 46, 36 + i)
    f.burst((11.0, 3.2, 0), (16.4, 4.2, 0), 7, 39, 0.2, flat=True)
    # The office: the door kicked in, books off the shelves, the desk gone through.
    f.scorch(10.5, 6.2, 0.6, 40)
    for x, y in ((566, 322), (574, 344), (585, 331), (592, 362), (570, 366)):
        f.hole(x, y, True)
    f.scatter(10.3, 6.5, 0.5, 0.4, 16, 41, ((150, 70, 40), (110, 50, 30), (176, 96, 60)), (2, 1))
    r = random.Random(42)

    def gaps(d):
        for _ in range(26):  # where books came off the long shelf
            X, Z = r.uniform(0.7, 9.0), r.choice((1.15, 1.75, 2.35, 2.95))
            x, y = f.P(X, 0, Z)
            w = r.randint(4, 9)
            d.polygon([(x, y), (x + w, y + w // 2), (x + w, y + w // 2 + 12), (x, y + 12)], fill=(34, 18, 20))
        for _ in range(9):  # and the short one
            Y, Z = r.uniform(0.6, 4.4), r.choice((1.3, 2.0, 2.7))
            x, y = f.P(0, Y, Z)
            w = r.randint(4, 8)
            d.polygon([(x, y), (x - w, y + w // 2), (x - w, y + w // 2 + 12), (x, y + 12)], fill=(34, 18, 20))
    f.paint(gaps)
    f.scatter(4.8, 1.0, 2.6, 0.35, 60, 43, BOOKS, (3, 1), Z=0.2)
    f.scatter(0.9, 2.6, 0.3, 1.2, 22, 44, BOOKS, (3, 1), Z=0.2)
    f.scatter(5.6, 4.0, 1.3, 1.0, 44, 45, PAPER + ((214, 190, 170),), (2, 1), Z=0.2)

    def slashes(d):
        for x0, y0, x1, y1 in ((398, 262, 410, 282), (414, 270, 424, 286), (486, 326, 500, 346), (506, 322, 516, 340)):
            d.line([(x0, y0), (x1, y1)], fill=(70, 10, 16))
            d.line([(x0 + 1, y0), (x1 + 1, y1)], fill=(176, 92, 88))
    f.paint(slashes)
    # The putting green, walked over, and the clubs out of the caddy.
    r2 = random.Random(46)
    for _ in range(16):
        X, Y = r2.uniform(1.0, 11.0), r2.uniform(11.4, 12.9)
        m = (((f.FX - X) / 0.2) ** 2 + ((f.FY - Y) / 0.09) ** 2 <= 1) & (f.art[..., 1] > f.art[..., 0]) & (f.art[..., 1] > f.art[..., 2])
        f.mul(m, (0.78, 0.74, 0.7))

    def clubs(d):
        for (X0, Y0), (X1, Y1) in (((10.9, 12.3), (11.6, 12.6)), ((10.4, 13.3), (11.1, 13.2)), ((11.5, 13.0), (12.0, 13.5))):
            a, b = f.P(X0, Y0), f.P(X1, Y1)
            d.line([a, b], fill=(104, 100, 126))
            d.rectangle([b[0] - 1, b[1] - 1, b[0] + 1, b[1]], fill=(176, 168, 192))
    f.paint(clubs)
    f.scatter(13.6, 10.6, 0.9, 0.7, 12, 47, PAPER)
    f.save()


def secure():
    f = Floor("secure", (700, 150))
    # What's left of the Vigil: flowers and candles trampled from the vault door down the runner.
    r = random.Random(1)
    f.flowers([(14.67 + r.uniform(-1.3, 1.3), y + r.uniform(-0.5, 0.5)) for y in (6.4, 7.6, 9.0, 10.2, 12.8, 14.2, 15.6, 17.0, 18.6, 20.0)], 2, petals=12)
    f.flowers([(12.2, 3.6), (13.6, 4.6), (15.9, 3.4), (17.2, 4.4), (16.4, 2.2), (12.9, 2.0)], 3, petals=14)
    f.scatter(14.67, 4.2, 2.0, 0.9, 30, 4, ((236, 226, 240), (232, 200, 140)), (3, 0))  # candles, on their sides
    f.scatter(14.67, 12.0, 1.2, 4.5, 50, 5, PETALS, (0, 0))
    # The vault door held. The wall around it and its plate took the rounds.
    f.burst((12.2, 0, 0.8), (12.6, 0, 3.4), 7, 6, 0.08)
    f.burst((17.0, 0, 3.2), (17.5, 0, 0.8), 7, 7, 0.08)
    f.burst((13.2, 0, 1.0), (16.0, 0, 2.9), 9, 8, 0.2)
    f.scorch_wall(18.0, 0.8, 0.8, 9)
    f.scorch(18.3, 6.4, 1.2, 10)
    f.brass(13.0, 6.8, 14, 11)
    f.brass(16.6, 7.4, 10, 12)
    f.burst((10.5, 8.5, 0), (18.5, 9.6, 0), 14, 13, 0.2, flat=True)
    # The pews, splintered.
    for x, y in ((402, 594), (436, 608), (470, 562), (524, 588), (560, 546), (592, 562), (448, 628), (500, 612), (414, 574)):
        f.hole(x, y, True)
    f.scatter(11.2, 18.6, 1.8, 1.0, 46, 14, ((176, 110, 60), (120, 70, 40), (208, 153, 79)), (2, 0))
    # The lockup's door forced, and the guard room gone through.
    f.scorch(9.6, 9.3, 0.8, 15)
    f.burst((8.2, 8.9, 0.4), (9.4, 8.9, 1.9), 7, 16, 0.05)
    f.scatter(4.2, 17.4, 1.4, 1.0, 34, 17, PAPER)
    f.scatter(2.6, 14.6, 0.8, 0.8, 14, 18, ((120, 116, 170), (150, 142, 170)), (3, 1))
    # A crate of the Vigil's stores burst open on the hall floor.

    def crate(d):
        f.iso_box(d, 22.6, 11.6, 0, 0.9, 0.7, 0.55, (132, 84, 44), (104, 62, 34), (64, 38, 28))
        t = [f.P(22.6, 12.3, 0.55), f.P(23.5, 12.3, 0.55), f.P(23.5, 12.3, 0), f.P(22.6, 12.3, 0)]
        d.polygon([(t[0][0] + 3, t[0][1] + 3), (t[1][0] - 2, t[1][1] + 2), (t[2][0] - 2, t[2][1] - 3), (t[3][0] + 3, t[3][1] - 2)], fill=(24, 14, 14))
    f.paint(crate)
    f.scatter(22.9, 13.2, 0.7, 0.6, 22, 19, ((236, 226, 240), (232, 200, 140)), (3, 0))
    f.flowers([(22.4, 13.6), (23.6, 13.3)], 20)
    f.flowers([(24.0, 15.6), (25.6, 15.2), (23.2, 16.6)], 21, petals=10)
    # The old scanner booth and its barrier arms: shot up, its screen out.
    f.kill((1468, 490, 1518, 540), lambda a: (a[..., 0] > 180) & (a[..., 1] > 70) & (a[..., 2] < 140), 1.0, 22, k=0.3, crack=1.0)
    f.burst((26.4, 0, 0.7), (28.6, 0, 2.4), 7, 23, 0.12)
    f.shards(27.2, 1.8, 0.9, 0.6, 30, 24)
    f.burst((24.5, 3.2, 0), (29.5, 2.4, 0), 8, 25, 0.15, flat=True)
    f.save()


def bots():
    f = Floor("bots", (460, 150))
    # They came in by the service door. The crates beside it took it, and one is over and split.
    f.burst((9.2, 0, 0.8), (9.6, 0, 3.0), 6, 1, 0.07)
    f.burst((11.4, 0, 3.0), (11.9, 0, 0.9), 6, 2, 0.07)
    f.scorch_wall(11.8, 0.7, 0.7, 3)
    f.scorch(10.6, 1.7, 0.9, 4)
    for x, y in ((578, 262), (592, 282), (604, 300), (636, 246), (662, 262), (648, 284), (622, 268), (668, 296), (566, 286)):
        f.hole(x, y, True)

    def crate(d):
        f.iso_box(d, 6.9, 4.5, 0, 0.8, 0.6, 0.5, (150, 78, 42), (120, 58, 34), (78, 40, 30))
        t = [f.P(6.9, 5.1, 0.5), f.P(7.7, 5.1, 0.5), f.P(7.7, 5.1, 0), f.P(6.9, 5.1, 0)]
        d.polygon([(t[0][0] + 3, t[0][1] + 3), (t[1][0] - 2, t[1][1] + 2), (t[2][0] - 2, t[2][1] - 3), (t[3][0] + 3, t[3][1] - 2)], fill=(24, 14, 14))
    f.paint(crate)
    f.scatter(7.3, 5.8, 0.6, 0.5, 26, 5, ((150, 142, 170), (120, 116, 150), (176, 110, 60)), (2, 1))
    f.scatter(8.6, 3.6, 0.9, 0.6, 22, 6, ((176, 110, 60), (120, 70, 40)), (2, 0))
    f.brass(9.4, 2.6, 12, 7)
    f.brass(12.2, 2.4, 9, 8)
    f.burst((8.6, 2.6, 0), (13.4, 2.0, 0), 10, 9, 0.15, flat=True)
    # The tool wall, half pulled down: tools across the bench and the floor.
    r = random.Random(10)

    def tools(d):
        for _ in range(16):
            x, y = f.P(15.4 + r.gauss(0, 1.1), 1.5 + abs(r.gauss(0, 0.5)))
            if not f.ok(x, y):
                continue
            dx, dy = r.choice(((4, 2), (-4, 2), (5, 0), (3, 3)))
            d.line([(x, y), (x + dx, y + dy)], fill=r.choice(((150, 142, 170), (120, 116, 150), (208, 120, 50))))
            d.point((x + dx, y + dy), fill=(196, 186, 204))
    f.paint(tools)
    f.burst((13.8, 0, 1.0), (16.6, 0, 2.2), 6, 11, 0.12)
    # A drum on its side, and its coolant across the floor: teal, so it can't be taken for blood.
    f.puddle(18.5, 11.8, 0.95, 0.55, 12, (22, 96, 104), (70, 190, 190))

    def drum(d):
        a, b = f.P(16.9, 11.1), f.P(18.0, 11.1)
        d.polygon([(a[0], a[1] - 15), (b[0], b[1] - 15), (b[0], b[1] + 1), (a[0], a[1] + 1)], fill=(46, 40, 58))
        d.polygon([(a[0], a[1] - 15), (b[0], b[1] - 15), (b[0], b[1] - 11), (a[0], a[1] - 11)], fill=(70, 62, 86))
        d.ellipse([a[0] - 5, a[1] - 16, a[0] + 5, a[1] + 2], fill=(34, 30, 44), outline=INK)
        d.ellipse([b[0] - 5, b[1] - 16, b[0] + 5, b[1] + 2], fill=(58, 50, 72), outline=INK)
        d.line([(a[0], a[1] - 16), (b[0], b[1] - 16)], fill=INK)
        d.line([(a[0], a[1] + 2), (b[0], b[1] + 2)], fill=INK)
        m = ((a[0] + b[0]) // 2, (a[1] + b[1]) // 2)
        d.line([(m[0] - 3, m[1] - 15), (m[0] - 3, m[1] + 1)], fill=(232, 143, 32), width=2)
        d.ellipse([b[0] - 2, b[1] - 9, b[0] + 2, b[1] - 3], fill=(22, 96, 104))
    f.paint(drum)
    # Two of the charging cradles smashed.
    for i, (X, Y) in enumerate(((9.0, 13.0), (13.9, 13.0))):
        x, y = f.P(X, Y, 0.3)
        m = f.box(x - 22, y - 16, x + 22, y + 16) & (f.art[..., 0] > 150) & (f.art[..., 2] > 150)
        f.mul(m, (0.42, 0.4, 0.46))
        f.crack(x, y, 6, 12, 13 + i, 0.3, col=(196, 180, 214))
        f.shards(X + 0.2, Y - 0.7, 0.6, 0.4, 22, 15 + i)
    # The dispatch terminal, cracked and still on.
    x, y = f.P(9.67, 9.67, 1.35)
    f.crack(x - 2, y, 6, 11, 17, 0.5, col=(200, 206, 240))
    f.burst((12.0, 8.4, 0), (16.6, 9.6, 0), 9, 18, 0.15, flat=True)
    f.save()


MAPS = {"deck-6": deck_6, "deck-7": deck_7, "deck-8": deck_8, "deck-9": deck_9, "secure": secure, "bots": bots}
if __name__ == "__main__":
    for name in sys.argv[1:] or MAPS:
        MAPS[name]()
