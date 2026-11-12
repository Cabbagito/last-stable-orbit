"""Djuro's portrait, a first version: the Promenade shopkeeper's render (assets/portraits/resident-shopkeeper.gif) with a
blue tracksuit top, a tweed flat cap and his bucket of coins painted over every frame. To be replaced by a sculpt of his
own from the Project's portrait kit. Run from the repo root: python3 scripts/djuro_portrait.py"""
from PIL import Image
import numpy as np
SRC = 'assets/portraits/resident-shopkeeper.gif'
def hx(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
CLOTH = {'#16100a': '#070b18', '#2c2114': '#0c1630', '#2e2214': '#0c1630', '#3a2d1d': '#10204a', '#4c3b23': '#152c66', '#4c3a22': '#152c66', '#6d533a': '#1e3f8c', '#6e5634': '#1e3f8c', '#92764a': '#2f5cb8'}
APRON = {'#1a0e0c': '#090e20', '#311c19': '#0e1838', '#3a1e18': '#0e1838', '#472a23': '#132454', '#61372d': '#193274', '#62342a': '#193274', '#8c5040': '#2248a0', '#b87460': '#e8ecf4'}
CAP = {'K': '#0a0707', 'd': '#2a2622', 'm': '#4a443c', 'l': '#6e665a', 'h': '#948a7a', 'b': '#1a1614'}
BK = {'K': '#0a0707', 's': '#30323f', 'S': '#555868', 'T': '#868a9c', 'W': '#c4c8d6', 'g': '#a87a14', 'G': '#f6cc44', 'Y': '#fff0a0', 'k': '#15151d'}
BUCKET = ['......KKKKKKKKKKKKKKKKKK......', '....KK..................KK....', '..KK......gGg...gGG.......KK..', '.K.....gGgGGYGggGGYGGg......K.', 'K....gGGYGGgGGGGYGgGGGGg.....K', 'KKKKgGGgGGGYGGgGGGGGgGGYGgKKKK', 'KWWTKKKKKKKKKKKKKKKKKKKKKKSssK', 'KWWTTSSSSSSSSSSSSSSSSSSSSSSssK', '.KWWTTSSSSSSSSSSSSSSSSSSSSssK.', '.KWWTTSSSSSSSSSSSSSSSSSSSSssK.', '.KWWTTSSSSSSSSSSSSSSSSSSSSssK.', '..KWWTSSSSSSSSSSSSSSSSSSSssK..', '..KWWTSSSSSSSSSSSSSSSSSSSssK..', '..KWWTSSSSSSSSSSSSSSSSSSSssK..', '...KWTSSSSSSSSSSSSSSSSSSssK...', '...KWTSSSSSSSSSSSSSSSSSSssK...', '...KWTSSSSSSSSSSSSSSSSSSssK...', '....KTSSSSSSSSSSSSSSSSSssK....']
def cap_px():
    out = {}
    for y in range(2, 26):
        for x in range(20, 86):
            dome = ((x - 49) / 21.5) ** 2 + ((y - 21) / 15.) ** 2
            brim = ((x - 62) / 20.) ** 2 + ((y - 21.5) / 3.2) ** 2
            if dome <= 1 and y <= 21:
                t = (x - 28) / 42 - (y - 6) / 34
                c = 'h' if t > .60 else 'l' if t > .38 else 'm' if t > .12 else 'd'
                if (x + 2 * y) % 7 == 0 and c in 'lm': c = 'd' if c == 'm' else 'm'      # tweed
                if dome > .88: c = 'K'
                if y == 21 and dome <= .88: c = 'b'
                out[(x, y)] = c
            elif brim <= 1 and y >= 20:
                out[(x, y)] = 'K' if brim > .70 else ('l' if y <= 20 else 'm' if y == 21 else 'd')
    return out
CAPPX = cap_px()
im = Image.open(SRC); frames = []
for k in range(im.n_frames):
    im.seek(k); a = np.array(im.convert('RGB'))
    low = a[60:]
    for table in (CLOTH, APRON):
        for src, dst in table.items():
            m = (low == hx(src)).all(-1); low[m] = hx(dst)
    for (x, y), c in CAPPX.items(): a[y, x] = hx(CAP[c])
    x0, y0 = 2, 78
    rows = BUCKET[:]
    if k % 12 < 3: rows[3] = '.K.....gGgGGWGggGGYGGg......K.'
    if 6 <= k % 12 < 9: rows[4] = 'K....gGGYGGgGGGGWGgGGGGg.....K'
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch != '.' and y0 + j < 96: a[y0 + j, x0 + i] = hx(BK[ch])
    frames.append(Image.fromarray(a))
allf = Image.new('RGB', (96 * len(frames), 96))
for k, f in enumerate(frames): allf.paste(f, (96 * k, 0))
q = allf.quantize(colors=128, dither=Image.Dither.NONE)
out = [q.crop((96 * k, 0, 96 * k + 96, 96)) for k in range(len(frames))]
out[0].save('assets/portraits/djuro.gif', save_all=True, append_images=out[1:], duration=im.info.get('duration', 80), loop=0, optimize=False)
