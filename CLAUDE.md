# Last Stable Orbit

Companion web app for Peter's sci-fi tabletop campaign. The plan, with what's done and what's next, is `docs/planning/2026-11-04-build-plan.md`; read its Progress section first.

## Sources of truth

- **Story, world and rules:** `design/reference/campaign-bible.md`, a copy of the claude.ai Campaign Bible (https://claude.ai/artifact/M1yC81nP1if8VLKYnviCHp). The live doc may be newer.
- **UI:** `design/reference/ui/R6.dc.html`, the latest round ("Meridian, ruled", modified from round 4's Meridian). Always build from the latest round.
- **Roll banners, God and the GM's roll modes:** the UI canvas, page "Round 17" (`R17Stage` holds them all).
- **Codex and Station:** the UI canvas (https://claude.ai/artifact/6qy97FyBbNdFJafigwiKff), pages "Codex, pinned" and "Station". The decisions are in the plan's M6.
- **Maps:** `design/reference/maps/*.dc.html` (Main = The Event Horizon). Every board shares one isometric formula; see `web/src/lib/proj.ts`.
- **Cutscenes and the TV ("Stage"):** the claude.ai doc LSO — Cutscenes and Stage (https://claude.ai/artifact/8Bh5PsiSBjLaJaHyJfNUz8, read it with the Claude Docs connector), plus one canvas per cutscene (the first is The shotgun, https://claude.ai/artifact/ExqP99kRwpzUP9Funyg7Sv).
- **Burns:** the Burn animations canvas (https://claude.ai/artifact/C4xxchodAbqihiwNazLQNg): the five films, their icons, and the Burn row on the sheet.
- **Slots:** the Slots canvas (https://claude.ai/artifact/EPiC8wXsHQy7o5to3Rd8kj); its numbers are in `content/slots.yaml`.
- **Art:** imported from the claude.ai artifacts. `assets/manifest.yaml` lists each file's store and asset id. Fetch more with the Artifact tool's read action, using the asset id as the path, one call per asset.

## Scope decisions (override the artifacts)

- No Humanity, no ISCO compute meter, no Comms, no AI features for now.
- Tabs: Scene / Station / Codex, plus a GM-only tab. There is no Crew tab (crew pages are in the Codex) and no Items tab. Private briefs aren't in the app.
- **Rolls:** the full animation shows only on the roller's screen. Everyone else sees a big banner, then the number on the token (Round 17). The GM picks what players see for each NPC roll: Public, Hidden, Someone, Secret or God.
- **The TV is always there:** cutscenes, Burn films, a failed skill's downside and all the sound play only on the TV, and laptops are silent. The TV / no TV / Online choice is gone. The GM's Play waits until a TV is connected. See the plan's Stage section.
- **The GM controls:** map moods and switches, HP and Entropy, rolls (including hidden ones), NPCs, and every inventory. Clues are handed out as items, such as a note.
- **Login:** players pick their character; only the GM has a passcode.
- **Fights:** the app never knows the number to beat or who attacks whom. The GM names the check out loud and sets HP and Entropy by hand. It does know who's in a fight: the GM picks them, and the app rolls their Reflex for the turn order. Players spend Entropy and Burn whenever they want. See the plan's M8.

## Architecture rules

- **Every change follows one path:** `commands.py` (permission check) → events → `state.apply`, logged by `store.py`.
- **Only `views.project()` sends state out.** Anything players must not see is filtered there, and gets a leak test in `server/tests/`.
- **Positions are world coordinates** (X, Y, Z) per map, never pixels.
- **Content** (characters, NPCs, items, maps and the objects on them, presets, the natural-1 insults, the cutscene cues) is YAML in `content/`, not code.
- **Dice are rolled only on the server** (`rules.py`, from `commands.py`). The roller's screen gets the dice to animate. Everyone else gets each die only once it has landed there. `web/src/roll/rollfx.js` is generated from R6, and `rollfx.test.ts` checks it still draws exactly what R6 draws.

## Working here

- `make up` runs the app on http://localhost:8070. `make dev` hot-reloads on :5173. `make test` runs all tests. `make passcode` shows the GM passcode. `make reset-world` wipes the saved game.
- Node isn't installed on this Mac. npm runs in Docker (see `make test-web`). The server tests use uv: `cd server && uv run pytest`.
- **Hosting:** the table's copy runs on parker at http://parker.local (port 80; the README's "Hosting it at the table"). `git pull && make up` there updates it. Peter's Mac can still run its own on 8070.
- To test two seats on one machine, use http://localhost:8070 for one and http://127.0.0.1:8070 for the other.
- **Git:** commit straight to `main` and push. No branches, no pull requests.
