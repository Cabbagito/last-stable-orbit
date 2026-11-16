#!/usr/bin/env python3
"""Paint the Hurt and Down portraits (the LSO — Hurt portraits canvas) over the approved GIFs: the five crew, Lucan
(fixer) and Dax. The head never moves in these loops, so wounds sit at fixed pixels, placed from the generator's own
camera; anything that flickers keys off the loop's 80 ms steps. Hurt shows at two thirds of max health or less, Down at
0 (server/lso/views.py, `_face`). Run it from the repo root:

    uv run --no-project --with pillow --with numpy python scripts/hurt_portraits.py

It writes assets/portraits/<name>-hurt.gif and <name>-down.gif and lists them in assets/manifest.yaml.
"""

import hashlib
from pathlib import Path
import numpy as np
from PIL import Image

SRC = 'assets/portraits/'

def hx(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)

BLOOD = dict(o='#240306', d='#560a0c', b='#941410', r='#c8241a', g='#ff6a48')

def load(name):
    im = Image.open(SRC + name + '.gif'); out = []; t = 0
    for k in range(im.n_frames):
        im.seek(k); d = im.info.get('duration', 80)
        out.append(dict(rgb=np.array(im.convert('RGB')), ms=d, step=t // 80)); t += d
    return out

def frame_at(frames, step):
    """The frame showing at loop step `step` (80 ms units)."""
    best = frames[0]
    for f in frames:
        if f['step'] <= step: best = f
    return best

def px(img, x, y, c):
    if 0 <= x < img.shape[1] and 0 <= y < img.shape[0]: img[y, x] = hx(c) if isinstance(c, str) else c

def stamp(img, x, y, rows, leg):
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in '. ': continue
            px(img, x + i, y + j, leg[ch])

def tint(img, cx, cy, rx, ry, mul, add=(0, 0, 0), soft=True):
    H, W = img.shape[:2]; j, i = np.mgrid[0:H, 0:W]
    r = ((i - cx) / rx) ** 2 + ((j - cy) / ry) ** 2
    m = r <= 1.0
    k = np.where(r <= .45, 1.0, .6 if soft else 1.0)[m][:, None]
    v = img[m].astype(float)
    v = v * (1 - k + k * np.asarray(mul)) + k * np.asarray(add)
    img[m] = np.clip(v, 0, 255).astype(np.uint8)

def drip(img, x, y, n, sway=(), wide=False, drop=True):
    """A run of blood from (x, y) down n pixels; sway lists the steps where it shifts a pixel (+1 right, -1 left)."""
    sw = dict(sway)
    for k in range(n):
        x += sw.get(k, 0)
        px(img, x, y + k, BLOOD['b'])
        px(img, x - 1, y + k, BLOOD['d']) if wide else None
        if k == 0: px(img, x, y, BLOOD['r'])
    if drop:
        px(img, x, y + n, BLOOD['b']); px(img, x - 1, y + n, BLOOD['d']); px(img, x, y + n + 1, BLOOD['d'])
        px(img, x, y + n - 1, BLOOD['r'])

def gash(img, pts, glint=True):
    """A cut: dark under-edge, red core, a lit top edge."""
    for x, y in pts: px(img, x, y + 1, BLOOD['o'])
    for x, y in pts: px(img, x, y, BLOOD['b'])
    for k, (x, y) in enumerate(pts):
        if k % 2 == 0: px(img, x, y, BLOOD['r'])
    if glint: px(img, pts[0][0], pts[0][1], BLOOD['g'])

def spatter(img, pts):
    for k, (x, y) in enumerate(pts): px(img, x, y, BLOOD['b'] if k % 3 else BLOOD['d'])

def copy_box(dst, src, x0, y0, x1, y1):
    dst[y0:y1, x0:x1] = src[y0:y1, x0:x1]

def dim(img, k=.62, sat=.45, cool=(1.0, 1.0, 1.06)):
    v = img.astype(float); g = v.mean(-1, keepdims=True)
    v = (g + (v - g) * sat) * k * np.asarray(cool)
    return np.clip(v, 0, 255).astype(np.uint8)

def save(frames, path):
    """Exact palette when it fits; otherwise one shared adaptive palette so nothing flickers."""
    allpx = np.concatenate([f['rgb'].reshape(-1, 3) for f in frames])
    uniq = np.unique(allpx, axis=0)
    if len(uniq) <= 256:
        pal = uniq
    else:
        big = Image.fromarray(allpx.reshape(-1, 96, 3)).quantize(255, method=Image.Quantize.MEDIANCUT)
        pal = np.array(big.getpalette()[:255 * 3], np.uint8).reshape(-1, 3)
    flat = pal.reshape(-1).tolist() + [0] * (768 - pal.size)
    pal_i = pal.astype(int)
    ims = []
    for f in frames:
        u, inv = np.unique(f['rgb'].reshape(-1, 3), axis=0, return_inverse=True)
        d = ((u[:, None, :].astype(int) - pal_i[None]) ** 2).sum(-1).argmin(1)
        im = Image.fromarray(d[inv.ravel()].reshape(96, 96).astype(np.uint8), 'P'); im.putpalette(flat); ims.append(im)
    ims[0].save(path, save_all=True, append_images=ims[1:], duration=[f['ms'] for f in frames], loop=0, disposal=1, optimize=False)
    return len(pal)

def run(img, x, y, n, sway=(), w=2, drop=True):
    """A bold run of blood, w pixels wide, tapering to one pixel over its last third, ending in a drop."""
    sw = dict(sway)
    for k in range(n):
        x += sw.get(k, 0)
        ww = w if k < n * .66 else 1
        if ww >= 2:
            px(img, x - 1, y + k, BLOOD['d']); px(img, x, y + k, BLOOD['b'])
            if ww >= 3: px(img, x + 1, y + k, BLOOD['d'])
        else:
            px(img, x, y + k, BLOOD['b'])
        if k < 2: px(img, x, y + k, BLOOD['r'])
    if drop:
        px(img, x, y + n, BLOOD['r']); px(img, x - 1, y + n, BLOOD['d']); px(img, x + 1, y + n, BLOOD['d'])
        px(img, x, y + n + 1, BLOOD['b']); px(img, x - 1, y + n + 1, BLOOD['o']); px(img, x, y + n + 2, BLOOD['o'])

def smear(img, cx, cy, rx, ry, k=1.0):
    """Blood wiped across skin: the skin goes dark red, keeping its shading."""
    tint(img, cx, cy, rx, ry, (.62 * k + (1 - k), .16 * k + (1 - k), .16 * k + (1 - k)), (34 * k, 0, 2 * k))

def cut(img, pts):
    """A thick cut: two pixels tall, dark below, bright core, glint at one end."""
    for x, y in pts: px(img, x, y + 1, BLOOD['o']); px(img, x, y + 2, BLOOD['d'])
    for x, y in pts: px(img, x, y, BLOOD['r']); px(img, x, y + 1, BLOOD['b'])
    px(img, pts[0][0], pts[0][1], BLOOD['g'])

def bruise(img, cx, cy, rx=4, ry=2.2):
    tint(img, cx, cy, rx, ry, (.62, .44, .70), (8, 0, 16))

def erase(img, x0, y0, rows):
    """Take an old stamp off the face: each stamped pixel becomes the skin just left or right of it on the same row."""
    src = img.copy()
    for j, row in enumerate(rows):
        y = y0 + j; cols = [i for i, ch in enumerate(row) if ch not in '. ']
        if not cols: continue
        l, r = x0 + min(cols) - 1, x0 + max(cols) + 1
        for i in cols:
            x = x0 + i
            img[y, x] = src[y, l] if (x - l) <= (r - x) else src[y, r]


# loop step where each portrait's blink is fully shut (blink start + 2), from the generator scripts
SHUT = dict(lale=32, marlo=14, tally=42, ves=22, tomo=26, dax=30, fixer=40)
# eye boxes (x0, y0, x1, y1) to lift from the shut frame
EYEBOX = dict(lale=[(30, 31, 40, 39), (46, 32, 56, 40)], marlo=[(25, 30, 34, 38), (40, 29, 49, 37)],
              ves=[(43, 32, 52, 40)], tomo=[(40, 26, 49, 33), (55, 25, 64, 32)], dax=[(58, 35, 67, 43)])
OIL = dict(o='#020405', d='#0a1216', b='#16242a', r='#2c4650', g='#6a8c96')

def shut_eyes(name, img, frames):
    src = frame_at(frames, SHUT[name])['rgb']
    for b in EYEBOX.get(name, []): copy_box(img, src, *b)

def oil(img, x, y, n, sway=()):
    sw = dict(sway)
    for k in range(n):
        x += sw.get(k, 0); px(img, x, y + k, OIL['b']); px(img, x - 1, y + k, OIL['d'])
    px(img, x, y + n, OIL['b']); px(img, x, y + n + 1, OIL['d']); px(img, x, y, OIL['g'])

def spark(img, x, y, step, every=9, at=(0, 1)):
    k = step % every
    if k == at[0]:
        for dx, dy, c in ((0, 0, '#ffffff'), (1, -1, '#fff2a0'), (-1, 1, '#ffd040'), (2, -2, '#ffb020'), (-1, -1, '#fff2a0')): px(img, x + dx, y + dy, c)
    elif k == at[1]:
        for dx, dy, c in ((1, -2, '#ffd040'), (3, -3, '#ff9020'), (-2, 1, '#ffb020')): px(img, x + dx, y + dy, c)

# ------------------------------------------------------------------ humans
def tomo(img, step, lvl, frames):
    bruise(img, 44, 32, 4.5, 2.4)
    smear(img, 63, 30, 2.5, 6 if lvl == 1 else 9)
    cut(img, [(59, 23), (60, 23), (61, 24), (62, 24), (63, 25), (64, 25)])
    run(img, 64, 27, 11 if lvl == 1 else 16, sway=((5, 1),))            # down the temple into the beard
    run(img, 54, 40, 4 if lvl == 1 else 7, drop=lvl == 1)                # the nose, broken again
    if lvl == 2:
        run(img, 57, 40, 6, sway=((3, 1),), drop=False)
        smear(img, 55, 50, 6, 4, .8)                                         # beard soaked under the mouth
        cut(img, [(45, 19), (46, 20), (47, 20), (48, 21)]); run(img, 47, 22, 5)

def lale(img, step, lvl, frames):
    bruise(img, 51, 39, 4.5, 2.4)
    smear(img, 29, 35, 2.5, 6 if lvl == 1 else 9)
    cut(img, [(27, 28), (28, 28), (29, 29), (30, 29), (31, 30), (32, 30)])
    run(img, 29, 31, 11 if lvl == 1 else 15, sway=((6, -1),))
    run(img, 40, 47, 3 if lvl == 1 else 6, drop=lvl == 1)
    if lvl == 2:
        run(img, 46, 52, 5); smear(img, 42, 55, 5, 3, .7)
        smear(img, 44, 76, 6, 3, .55)                                         # the collar

def marlo(img, step, lvl, frames):
    bruise(img, 29, 36, 5, 2.6)
    smear(img, 47, 43, 3, 4 if lvl == 1 else 7)
    cut(img, [(44, 38), (45, 38), (46, 39), (47, 39), (48, 40)])          # cheekbone
    run(img, 47, 41, 7 if lvl == 1 else 12, sway=((4, 1),))
    cut(img, [(38, 50), (39, 50)])                                          # split lip
    run(img, 39, 52, 3 if lvl == 1 else 6)
    if lvl == 2:
        run(img, 34, 44, 6, drop=False); smear(img, 37, 54, 5, 3, .7)
        smear(img, 40, 72, 5, 3, .55)

def ves(img, step, lvl, frames):
    bruise(img, 47, 39, 4, 2.2)
    smear(img, 44, 33, 2.5, 6 if lvl == 1 else 9)
    cut(img, [(42, 27), (43, 27), (44, 28), (45, 28), (46, 29), (47, 29)])
    run(img, 44, 30, 12 if lvl == 1 else 17, sway=((7, -1),))
    run(img, 57, 47, 3 if lvl == 1 else 6, drop=lvl == 1)
    ox, oy = 60, 33
    if lvl == 1 and step % 6 in (2, 3):                                     # the optic stutters
        stamp(img, ox, oy, ['.mmmmm.', 'mdddddm', 'mrrrrrm', 'mdddddm', '.mmmmm.'], dict(m='#2a0a08', d='#5a0c06', r='#ff3a1c'))
    if lvl == 2:                                                            # and goes out
        stamp(img, ox, oy, ['.mmmmm.', 'mdddddm', 'mdddddm', 'mdddddm', '.mmmmm.'], dict(m='#1a0606', d='#200808'))
        smear(img, 54, 68, 5, 3, .55)

def dax(img, step, lvl, frames):
    bruise(img, 63, 42, 4, 2.2)
    smear(img, 60, 34, 2.5, 5 if lvl == 1 else 8)
    cut(img, [(57, 28), (58, 28), (59, 29), (60, 29), (61, 30), (62, 30)])
    run(img, 59, 31, 8 if lvl == 1 else 12, sway=((3, -1),))
    run(img, 55, 51, 3 if lvl == 1 else 5, drop=False)                   # into the moustache
    smear(img, 55, 54, 3 if lvl == 1 else 6, 2 if lvl == 1 else 3, .8)
    if lvl == 2:
        run(img, 51, 58, 4); smear(img, 58, 72, 6, 3, .55)

# ------------------------------------------------------------------ machines
AMBER = dict(d='#5a3404', b='#b07812', r='#e8a828', g='#fff0a0')
def hydraulic(img, x, y, n, sway=()):
    sw = dict(sway)
    for k in range(n):
        x += sw.get(k, 0); w = 2 if k < n * .66 else 1
        if w == 2: px(img, x - 1, y + k, AMBER['d'])
        px(img, x, y + k, AMBER['b'] if k > 1 else AMBER['r'])
    px(img, x, y + n, AMBER['r']); px(img, x - 1, y + n, AMBER['d']); px(img, x + 1, y + n, AMBER['d']); px(img, x, y + n + 1, AMBER['b']); px(img, x, y, AMBER['g'])

LENS_DIM = ['..EEEEEE..', '.EDDDDDDE.', 'EDDrrrrDDE', 'EDrRRRRrDE', 'EDrRRRRrDE', 'EDrRRRRrDE', 'EDrRRRRrDE', 'EDDrrrrDDE', '.EDDDDDDE.', '..EEEEEE..']
def tally(img, step, lvl, frames):
    if lvl == 1 and step % 10 in (4, 5, 7):                                   # the cracked lens flickers
        stamp(img, 48, 24, LENS_DIM, dict(E='#04202a', D='#0b4a5a', r='#0e5060', R='#1a6878'))
    crack = dict(w='#eaffff', k='#02060a')
    stamp(img, 48, 23, ['w........', '.wk......', '..ww.....', '...kww...', '.....wk..', '......w.w', '.......w.', '........w'], crack)
    # a split in the brass rim with fluid running out, and a dent in the shell's cheek
    stamp(img, 55, 32, ['kk', '.k'], dict(k='#02060a'))
    hydraulic(img, 56, 34, 9 if lvl == 1 else 15, sway=((4, 1), (9, -1)))
    for x, y in [(32, 33), (33, 33), (34, 34), (35, 34), (36, 35)]:
        px(img, x, y + 1, '#02060a'); px(img, x, y, '#16222e'); px(img, x, y - 1, '#d4ece4' if x % 2 else '#8cb4b8')
    spark(img, 56, 33, step, every=7)
    spark(img, 34, 33, step, every=11, at=(3, 4))
    if lvl == 1:
        stamp(img, 39, 37, ['.........', '.........', 'ss.sss.ss'], dict(s='#7fe8f0'))    # the smile glitches flat
        stamp(img, 39, 37, ['s.......s', 'ss.....ss', '.........'], dict(s='#0a1118'))
    if lvl == 2:
        for ex, ey in ((31, 21), (48, 24)):                                   # lenses out
            stamp(img, ex, ey, ['..EEEEEE..', '.EDDDDDDE.', 'EDDDDDDDDE', 'EDDqqqqDDE', 'EDDqQQqDDE', 'EDDqQQqDDE', 'EDDqqqqDDE', 'EDDDDDDDDE', '.EDDDDDDE.', '..EEEEEE..'],
                  dict(E='#04202a', D='#061a22', q='#0a2a34', Q='#123a46'))
        stamp(img, 48, 23, ['w........', '.wk......', '..ww.....', '...kww...', '.....wk..', '......w.w', '.......w.', '........w'], dict(w='#6a8c96', k='#02060a'))
        stamp(img, 38, 37, ['ggggggggggg', 'ggggggggggg', 'ggggggggggg', 'ggggggggggg'], dict(g='#0a1118'))    # smile gone
        stamp(img, 40, 39, ['QQQQQQQ'], dict(Q='#1a3a48'))
        for r in range(3):                                                    # reels dead
            stamp(img, 45 + r * 7, 82, ['kkkkkk'] * 7, dict(k='#3a4a50'))
            stamp(img, 46 + r * 7, 84, ['x..x', '.xx.', 'x..x'], dict(x='#b02a20'))
        hydraulic(img, 40, 45, 7)

def fixer(img, step, lvl, frames):
    # a gash across the grey cheek with red light inside it; he leaks oil, not blood
    inner = dict(o='#050306', r='#d41e14', R='#ff5a30', b='#c8cad6', a='#5a0a08')
    stamp(img, 35, 39, ['b.........', 'oRo.......', 'aorRo.....', '.aaoRRo...', '...aaoRRo.', '.....aaoro', '.......aoo'], inner)
    oil(img, 42, 46, 5 if lvl == 1 else 10, sway=((2, 1),))
    stamp(img, 41, 22, ['b...', '.o..', '..oR', '.o..'], inner)                   # a crack in the cast quiff
    spark(img, 38, 40, step, every=8 if lvl == 1 else 5, at=(5, 6) if lvl == 1 else (1, 2))
    if lvl == 1:
        if step % 8 == 3:                                                          # one slot stutters out
            stamp(img, 54, 30, ['kkkkkkkkkk'] * 7, dict(k='#050306'))
    else:
        for x0, y0 in ((38, 31), (54, 30)):                                        # slots dark
            stamp(img, x0, y0, ['..........', '..........', 'kkkkkkkkkk', 'kkkkkkkkkk', 'kkkkkkkkkk', 'kkkkkkkkkk', '..........'], dict(k='#050306'))
        stamp(img, 41, 34, ['aaa'], dict(a='#2a0604')); stamp(img, 57, 33, ['aaa'], dict(a='#2a0604'))
        oil(img, 50, 51, 7)

# the approved mouths (portraits/<name>.py), where they sit, and the replacements
MOUTHS = dict(
    lale=dict(at=(35, 49), old=['c...........c', '.m.........m.', '..mUUU.UUUm..', '...mmmmmmm...', '....DGGDD....', '.....qqq.....'],
              leg=dict(m='#4a1a18', U='#8e4638', D='#b4644e', G='#d88a70', c='#7c4c2e', q='#54301e', k='#1a0808', W='#d8ccb8'),
              hurt=['.............', '.............', '...mmmmmmm...', '..m.DDDDD.m..', '.c.........c.', '.............'],
              down=['.............', '.............', '....mmmmm....', '...mkkkkkm...', '....mDDDm....', '.............']),
    marlo=dict(at=(30, 47), old=['...........c', '.........mm.', '.UUUU.UUUm..', 'mmmmmmmmm...', '..DYYDD.....', '...qqq......'],
               leg=dict(m='#340e18', U='#8e3f3c', D='#b85c50', Y='#dc8c74', c='#6e3a30', q='#4a2022', k='#12040a', W='#e0d0c8'),
               hurt=['............', '............', '..mmmmmmm...', '.m.DDDDD.m..', 'c.........c.', '............'],
               down=['............', '............', '...mmmmm....', '..mkkkkkm...', '...mDDDm....', '............']),
    ves=dict(at=(52, 48), old=['.........c', '.UUU.UUUm.', 'mmmmmmmmm.', '.DDYYYDD..', '...qqq....'],
             leg=dict(m='#2c0a08', U='#82302a', D='#b44c38', Y='#de8060', c='#5e2218', q='#3e1410', k='#0e0204', W='#d8b8a8'),
             hurt=['..........', '..mmmmmm..', '.m.DDDD.m.', 'c........c', '..........'],
             down=['..........', '..mmmmm...', '.mkkkkkm..', '..mDDDm...', '..........']),
    tomo=dict(at=(49, 43), old=['m.........m', '.mmmmmmmmm.', '..DDYYYDD..', '...qqqqq...'],
              leg=dict(m='#241008', D='#a85c44', Y='#d08c6c', q='#2a201c', k='#0e0604', W='#e0d4c0'),
              hurt=['...........', '..mmmmmmm..', '.m.DDDDD.m.', 'm.........m'],
              down=['...........', '...mmmmm...', '..mkkkkkm..', '...mDDDm...']),
)

def mouth(name, img, rows):
    M = MOUTHS[name]; x, y = M['at']
    erase(img, x, y, M['old']); stamp(img, x, y, rows, M['leg'])

WHO = dict(lale=lale, marlo=marlo, tally=tally, ves=ves, tomo=tomo, dax=dax, fixer=fixer)

def build(name, lvl):
    frames = load(name); out = []
    for f in frames:
        img = f['rgb'].copy()
        if name in MOUTHS: mouth(name, img, MOUTHS[name]['hurt' if lvl == 1 else 'down'])
        if lvl == 2:
            shut_eyes(name, img, frames); img = dim(img)
        WHO[name](img, f['step'], lvl, frames)
        out.append(dict(f, rgb=img))
    return out



def manifest(rel: str, src: str) -> None:
    m = Path("assets/manifest.yaml"); text = m.read_text(); data = (Path("assets") / rel).read_bytes()
    entry = (f"  - path: {rel}  # generated from portraits/{src}.gif by scripts/hurt_portraits.py\n"
             f'    store: PORTRAITS\n    asset_id: ""\n    sha256: "{hashlib.sha256(data).hexdigest()}"\n'
             f"    bytes: {len(data)}\n    width: 96\n    height: 96\n")
    start = text.find(f"  - path: {rel}")
    if start >= 0:
        end = text.find("  - path:", start + 10)
        text = text[:start] + entry + (text[end:] if end >= 0 else "")
    else:
        text = text.rstrip("\n") + "\n" + entry
    m.write_text(text)


if __name__ == "__main__":
    for n in WHO:
        for lvl, tag in ((1, "hurt"), (2, "down")):
            rel = f"portraits/{n}-{tag}.gif"
            save(build(n, lvl), "assets/" + rel)
            manifest(rel, n)
