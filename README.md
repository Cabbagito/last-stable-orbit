# Last Stable Orbit

Companion app for *Last Stable Orbit*, a sci-fi tabletop campaign: a crew hired to break into a dead man's vault on Ergo, a station hanging above a black hole.

One server holds the game state. Every player's laptop shows a live view of it through a WebSocket, and the GM gets a view with extra controls. Players pick their character on the login screen and stay logged in; only the GM types a passcode.

## Run it

You need Docker. The server tests also need [uv](https://docs.astral.sh/uv/).

```bash
make env       # once: writes .env with a random secret and the GM passcode
make up        # builds and starts the app on http://localhost:8070
make passcode  # shows the GM passcode
```

Open http://localhost:8070 and click a character, or choose "I'm the GM" and type the passcode. To try two seats on one machine, use http://localhost:8070 for one and http://127.0.0.1:8070 for the other (they keep separate logins), or a private window. Laptops on your network can use `http://<your-mac's-ip>:8070`. "Change character" in the header goes back to the picker.

| Command | What it does |
|---|---|
| `make up` / `make down` | start / stop the app (the game is saved in a Docker volume) |
| `make logs` | follow the server log |
| `make dev` | hot-reloading setup: web on http://localhost:5173, API on :8071 |
| `make test` | server tests (uv) and web tests (in Docker) |
| `make reset-world` | wipe the saved game; it reloads the default preset |

The GM can also load a preset from the GM column (Session 1 at the bar, or the bar after hours), which resets positions, moods, vitals and inventories without wiping anything.

## How it fits together

```
server/lso/   FastAPI app
  commands.py   intent -> permission check -> events (players move only their own token)
  state.py      apply(event): the only thing that changes the game state
  store.py      SQLite: append-only event log + snapshot, one transaction per intent
  views.py      project(state, viewer): the ONLY way state leaves the server
  hub.py        live sockets; each gets its own projection, only when it changed
content/      characters, NPCs, items, maps and presets as YAML (edit these, not code)
assets/       art imported from the claude.ai design artifacts (see assets/manifest.yaml)
web/          React + TypeScript + Vite; styles copied from the R6 "Meridian, ruled" board
design/       reference copies of the design boards and the campaign bible
docs/         the build plan
```

- **Positions** are world coordinates (X, Y, Z) on each map, using the isometric formula every Maps board shares (`web/src/lib/proj.ts`).
- **What players can't see never leaves the server:** hidden tokens, NPC GM notes, other players' inventories, other maps, the roster and presets. Map art and portraits are only served to someone whose current view uses them.
- **Split party:** a player sees the map their own token is on.

## Not built yet

Rolls are physical dice for now (Milestone 2). Inventories, notes, the designed GM tab, the other 10 maps, and the Station and Codex tabs follow. See `docs/planning/2026-11-04-build-plan.md`.
