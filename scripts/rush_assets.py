"""Sarge's rush: bring the prototype's art and sound into assets/rush/ and list them in assets/manifest.yaml.

The art and sound are drawn and made by minigames/sarge_art.py, mg_sound.py and mg_music.py in the claude.ai Project,
which Claude Code can't reach, so this takes the same files from the canvas's asset store (LSO — Sarge's rush,
https://claude.ai/artifact/5aYBgU1YhVv3cr1m1CQvHN). Download each asset first (the Artifact tool's read action, the
asset id as the path) into one folder, then:

    uv run --no-project --with av --with soundfile --with numpy python scripts/rush_assets.py <that folder>

The art is copied as it is. The sound came up to the canvas as Opus in WebM; it's decoded and written as FLAC, which
keeps a file's exact length, so the music loops without a gap. Each song is cut to its exact loop: 32 bars at 126 bpm
and 22 bars at 176 bpm (see content/rush.yaml; test_rush.py checks it).
"""

import hashlib
import shutil
import sys
from pathlib import Path

import av
import numpy as np
import soundfile as sf

ART = {
    "bowl": "4264fae8bfe544c5b2b2a7009a5e4882", "b-miso": "35e6e79ac6bd11d6790e3ddec0f862ce",
    "b-spicy": "d3eeb7c4d4f770ff81f8b88707bf222c", "b-clear": "b38cc595cd6db531b08cb101d993ee37",
    "n-ramen": "8cb6d597f6db5c968b69240712fa00f6", "n-udon": "dbd475e28b5bae171bc8a76ec2460c86",
    "n-glass": "25371220126812c808af7901889578b5", "t-egg": "f1dd7f3e4caa29b1ad3b3da8b151cf96",
    "t-scallion": "beb31079d4bc05bcbe9ad8790c6cf822", "t-chili": "0d5dea8511912b48c995518d180e8e6a",
    "t-tofu": "2a22621ffeb354124d3df9b695d6a407", "t-mushroom": "ee18ec786e47dac69060ede800e465e2",
    "bin-ramen": "fb8907aad5f5aece33b62a742b7fca10", "bin-udon": "70103cc90a621e4bad375ef47d86c0cd",
    "bin-glass": "de0efb0e5cef95612dd6d1dcc27e75fb", "bin-miso": "4306f6fff280cfaf0f2e566ab22830f1",
    "bin-spicy": "27153c79863c4cc58c3ce6a87f4a5df6", "bin-clear": "f6c4fc320f992ae2486ecad2c61030d8",
    "bin-egg": "0d9c20d44219201803ea42fe5acf16c6", "bin-scallion": "4a240f6a630419da2240baa3ca34446f",
    "bin-chili": "2ab4b68b1851ce4955dfcfd7e8156ed7", "bin-tofu": "b745750c04d4a16d32bb6a8dd71bba6a",
    "bin-mushroom": "24f5df0bb46e54ef0d5d913909e72553", "sarge": "0594fd9bb8c18960399d3670c482d497",
    "sarge-red": "8ca271e83dce851716184ada96d59dd4",
}
SOUND = {
    "music_shift": "f42b2bbe5e7386d60e94e914ea379d61", "music_rush": "e700c87d295217eaca3ffb73569057c6",
    "ticket_in": "da9d640b04a19e06cfb1432f6282158d", "serve_ok": "7f01a9057ba389e799e24f4c4a37c53a",
    "wrong": "285680342f939de299d9b1a78edb0ff6", "lost": "02ced3b20ef5ee086d1c2cd7a9d4a583",
    "rush_klaxon": "c6acee888dbd5c331c7e66d166453be0", "whistle_start": "8852cecbfec237d0d84fad176f685b55",
    "whistle_end": "9c64faf6e23c212bcabda337644c8bd5", "bark_1": "efbb026bf6b6ee4eaced7107b44ef40b",
    "bark_2": "5cf8f65308527ad5dd8f48bfccf7b6aa", "bark_3": "97f230c6951305d06862a717906832e1",
    "bark_4": "3c7176abc15bbdfb1cf248f49bd21d71", "rank_private": "71f7d716a82da0c21f48d7d80ac6aac1",
    "rank_corporal": "c5a99aa5b1197a2cdc38b35f0428ccaf", "rank_sergeant": "459c642b7a895050d13ba24eb234d151",
}
LOOP = {"music_shift": (32, 126), "music_rush": (22, 176)}  # bars of 4/4, bpm: the song is exactly this long
OUT = Path("assets/rush")


def decode(path: Path) -> tuple[np.ndarray, int]:
    c = av.open(str(path))
    frames, rate = [], 48000
    for f in c.decode(c.streams.audio[0]):
        rate = f.sample_rate
        a = f.to_ndarray()  # planar float: channels x samples
        frames.append(a if a.ndim == 2 else a[None, :])
    return np.concatenate(frames, axis=1).T, rate


def entry(rel: str, asset: str, extra: str = "") -> str:
    data = (Path("assets") / rel).read_bytes()
    out = f'  - path: {rel}\n    store: RUSH\n    asset_id: "{asset}"{extra}\n    sha256: "{hashlib.sha256(data).hexdigest()}"\n    bytes: {len(data)}\n'
    if rel.endswith((".png", ".gif")):
        from PIL import Image
        w, h = Image.open(Path("assets") / rel).size
        out += f"    width: {w}\n    height: {h}\n"
    return out


def main(src: Path) -> None:
    (OUT / "art").mkdir(parents=True, exist_ok=True)
    (OUT / "sound").mkdir(parents=True, exist_ok=True)
    rows = []
    for name, aid in ART.items():
        f = next(src.glob(aid + ".*"))
        rel = f"rush/art/{name}{f.suffix}"
        shutil.copyfile(f, Path("assets") / rel)
        rows.append(entry(rel, aid))
    for name, aid in SOUND.items():
        pcm, rate = decode(next(src.glob(aid + ".*")))
        if name in LOOP:
            bars, bpm = LOOP[name]
            pcm = pcm[: round(bars * 4 * 60 / bpm * rate)]  # the Opus decode can run a sample or so long
        rel = f"rush/sound/{name}.flac"
        sf.write(Path("assets") / rel, pcm, rate, format="FLAC", subtype="PCM_16")
        rows.append(entry(rel, aid, "  # decoded from the canvas's Opus WebM"))
    m = Path("assets/manifest.yaml")
    text = m.read_text()
    if "store: RUSH" not in text:
        text = text.replace("assets:\n", "  RUSH: https://claude.ai/artifact/5aYBgU1YhVv3cr1m1CQvHN  # drawn by minigames/sarge_art.py, sound by mg_sound.py and mg_music.py\nassets:\n", 1)
        m.write_text(text.rstrip("\n") + "\n" + "".join(rows))
    print(f"{len(rows)} files in {OUT}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
