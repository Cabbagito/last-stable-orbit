#!/usr/bin/env python3
"""Make the dead faces for Act 4: an existing portrait, stilled, drained of colour, with an X over each eye.

They're tokens of their own (`dead-…` in content/npcs.yaml), so the GM places a body like anyone else and the players
can see at a glance who isn't getting up. Run it from the repo root:

    uv run --no-project --with pillow python scripts/dead_portraits.py

It writes assets/portraits/dead-*.gif and lists them in assets/manifest.yaml.
"""

import hashlib
from pathlib import Path

from PIL import Image, ImageDraw

# out: (the portrait it's made from, the centre of each eye in its 96 px art)
FACES = {
    "dead-passenger": ("passenger", ((36, 34), (53, 34))),
    "dead-tourist": ("passenger-tourist", ((45, 35), (62, 35))),
    "dead-traveller": ("passenger-traveller", ((34, 36), (51, 36))),
    "dead-guard": ("guard", ((45, 33), (61, 33))),
    "dead-courier": ("resident-courier", ((36, 36), (53, 36))),
}
INK = (22, 16, 24)
PALE = (226, 220, 232)
R = 4  # the X reaches this far from the eye's centre, so it still reads on a small chip


def dead(src: str, eyes) -> Image.Image:
    im = Image.open(f"assets/portraits/{src}.gif")
    im.seek(0)
    im = im.convert("RGB")
    grey = im.convert("L").convert("RGB")
    im = Image.blend(im, grey, 0.6).point(lambda v: int(v * 0.8))  # drained and dimmed
    px = im.load()
    d = ImageDraw.Draw(im)
    for cx, cy in eyes:
        skin = px[cx, cy + 6]  # the cheek under the eye
        d.rectangle([cx - R - 1, cy - 3, cx + R + 1, cy + 3], fill=skin)
        ink = PALE if sum(skin) < 270 else INK  # a dark X is lost on a dark face
        for k in range(-R, R + 1):
            for t in (0, 1):  # two pixels thick
                d.point([(cx + k, cy + k + t), (cx + k, cy - k + t)], fill=ink)
    return im


def main() -> None:
    manifest = Path("assets/manifest.yaml")
    text = manifest.read_text()
    for out, (src, eyes) in FACES.items():
        rel = f"portraits/{out}.gif"
        dead(src, eyes).quantize(255).save(Path("assets") / rel)
        data = (Path("assets") / rel).read_bytes()
        entry = (
            f"  - path: {rel}  # generated from portraits/{src}.gif by scripts/dead_portraits.py\n"
            f'    store: PORTRAITS\n    asset_id: ""\n    sha256: "{hashlib.sha256(data).hexdigest()}"\n'
            f"    bytes: {len(data)}\n    width: 96\n    height: 96\n"
        )
        start = text.find(f"  - path: {rel}")
        if start >= 0:
            end = text.find("  - path:", start + 10)
            text = text[:start] + entry + (text[end:] if end >= 0 else "")
        else:
            text = text.rstrip("\n") + "\n" + entry
    manifest.write_text(text)


if __name__ == "__main__":
    main()
