"""Bot bay racing: bring the kit's sound and the Satisfaction Cup's icon into assets/ and list them in assets/manifest.yaml.

The kit (lso-bot-bay-racing-kit.zip, from Peter) holds what the claude.ai Project's minigames/ scripts made:
mg_music.py's songs as FLAC, each exactly one loop long, mg_sound.py's effects as WAV, and cup_icon.py's icon. Unzip it
somewhere, then from the repo root:

    uv run --no-project --with soundfile --with numpy --with pyyaml python scripts/race_assets.py <the kit folder>

The effects are written as FLAC, which keeps their exact length: lights_go has its GO at 3.3 s, and the race starts on
it. The songs are copied as they are. CSAT-1's horn, his breaking, CSAT-2 arriving, the survey chirp and the bottle
are the soundboard's own (content/soundboard.yaml), so they aren't repeated here.
"""

import hashlib
import shutil
import sys
from pathlib import Path

import soundfile as sf
import yaml

EFFECTS = ["lights_go", "surge", "spin", "crash", "overheat", "flip", "kick_up", "last_lap", "photo_finish", "guard", "win", "champion", "retains"]
SONGS = ["music_grid", "music_race", "music_final"]
CUP_ASSET = "11879c47bf6e6f1495346cffcac642c6"  # the same icon in the racing canvas's asset store

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"


def entry(path: str, note: str, asset_id: str | None = None) -> dict:
    f = ASSETS / path
    e = {"path": path, "store": "RACE", "asset_id": asset_id, "sha256": hashlib.sha256(f.read_bytes()).hexdigest(), "bytes": f.stat().st_size}
    if asset_id is None:
        e["note"] = note
    return e


def main(kit: Path) -> None:
    out = ASSETS / "race" / "sound"
    out.mkdir(parents=True, exist_ok=True)
    entries = []
    for name in EFFECTS:
        data, rate = sf.read(kit / "sound" / "effects" / f"{name}.wav", always_2d=False)
        sf.write(out / f"{name}.flac", data, rate, format="FLAC")
        entries.append(entry(f"race/sound/{name}.flac", "mg_sound.py's WAV from the kit, as FLAC"))
    for name in SONGS:
        shutil.copyfile(kit / "sound" / "music" / f"{name}.flac", out / f"{name}.flac")
        entries.append(entry(f"race/sound/{name}.flac", "mg_music.py's FLAC from the kit, one loop long"))
    shutil.copyfile(kit / "art" / "satisfaction-cup.png", ASSETS / "icons" / "items" / "satisfaction-cup.png")
    entries.append(entry("icons/items/satisfaction-cup.png", "", CUP_ASSET))

    man = ASSETS / "manifest.yaml"
    text = man.read_text()
    known = {a["path"] for a in yaml.safe_load(text)["assets"]}
    fresh = [e for e in entries if e["path"] not in known]
    if fresh:
        lines = []
        for e in fresh:
            lines.append(f"  - path: {e['path']}")
            lines.append("    store: RACE")
            lines.append(f"    asset_id: {('\"' + e['asset_id'] + '\"') if e['asset_id'] else 'null'}" + (f"  # {e['note']}" if e.get("note") else ""))
            lines.append(f"    sha256: \"{e['sha256']}\"")
            lines.append(f"    bytes: {e['bytes']}")
        man.write_text(text.rstrip("\n") + "\n" + "\n".join(lines) + "\n")
    print(f"{len(entries)} files, {len(fresh)} new in the manifest")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
