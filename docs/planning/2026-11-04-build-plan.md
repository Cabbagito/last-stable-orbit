# Last Stable Orbit: recommended build plan

## Progress (updated 2026-11-04)

| Milestone | Status |
|---|---|
| M1: Tokens at The Event Horizon | **Done** (commits 05cddc2, 4901ce3, 9a51d7c) |
| M2: The roll | **Next** |
| M3–M9 | Not started |

**How M1 differs from the plan below** (this section wins where they disagree):
- **Login:** players pick their character on a picker screen, and only the GM types a passcode (`LSO_GM_PASSCODE`). This replaces the per-player passcodes in "Auth flow".
- **Port:** the app runs on http://localhost:8070, because 8000 and 8001 belong to other projects on Peter's Mac.
- **GM controls:** the GM's Scene swaps the sheet column for a GM column (crew vitals, mood and switches, tokens, roster, presets). There is no separate dock. M4 still designs a proper GM tab.
- **Critique fixes applied:**
  - every frame is filtered per viewer, including content, and sent only when it changed, with a per-connection counter;
  - map art and portraits are allowlisted per viewer;
  - an `intents` table makes retries safe;
  - the state already has inventories, rolls and per-token maps;
  - no spoiler NPCs at the start;
  - a "load preset" GM action;
  - no `VOLUME` in the Dockerfile, and `FORWARDED_ALLOW_IPS` is set for Railway.
- **Moved to M7:** the login rate limit, TypeScript codegen and the R6 overlay.
- **Added:** trackpad handling (two-finger scroll pans, pinch zooms, swipe-back blocked).
- **Defaults taken:**
  - A player sees the map their own token is on (split party).
  - Skill and chrome rows without art show a SKILL / CHROME box.
- **Still placeholders:** starting inventories in `content/presets/session-1.yaml`, for Peter to set.

**Decided for M2: the roll callout others see.** The design is Round 7 on the UI canvas (`R7Live`, `R7States`).
- **While rolling:** a spinning ring in the stat's colour around the token head and the rail ring, plus a small chip with the stat name and a looping motion per stat:
  - Body: a die thumping.
  - Reflex: a slot reel.
  - Tech: hex characters decrypting.
  - Intel: maths symbols cycling.
  - Cool: a "?" coming into focus.
  - Empathy: a heartbeat.
- **Explodes:** a gold "EXPLODES" label and a flash, while it keeps rolling.
- **When the dice land:** everyone sees the number at once, in the stat's colour, with "×N" when it took more than one die.
- **Natural 1:** red, with a shake and a crack.
- **Push:** an amber "+1", the number ticks up, and one Entropy segment goes dark.
- **Where it sits:** above the token head on the map, and to the left of the ring in the crew rail.
- **When it goes:** it fades about 4 seconds after the roller closes their roll screen.

**Still to decide before M2:**
1. (Decided above.)
2. **Entropy on a failed roll.** Either +1 automatically when the GM has named a difficulty, or only after the GM confirms it.
3. **Roll requests.** Should the GM be able to send "Cool, Hard 7" to open a player's roll picker?

**On ultracode:** writing the keyword in a message does turn it on for that message; that's how this plan was made. The paragraph on ultracode further down is outdated.

## Recommendation

- **Make Milestone 1 (M1) the first turn.** Run it as one focused session, or two, while you watch the screen.
- **Don't turn on ultracode for the whole build.** Turn it on per task: the other 10 maps (M5), content entry, and the final review sweep (M7).
- **Playtest after M2.** Run 20 minutes of the bar scene with 2–3 people before building more.
- The visual reference is the R6 board ("Meridian, ruled"), never the round-4 Meridian. It is in the repo at `design/reference/ui/R6.dc.html`.

---

## Milestones

The order is **usable at the table first, then the roll, then the rest**. The bible says session 1 is exploration with no fight. So fights come after the session-1 gate.

### M1: Tokens at The Event Horizon · M · single session
- **Goal:** usable at a real table with physical dice. Live tokens on every laptop, plus GM control of moods, switches, HP and Entropy.
- **In it:**
  - Repo skeleton, passcode login, and a SQLite event log.
  - The R6 Scene on the bar map, with all 3 moods, Seal's box, hatch and gas 0–3.
  - Live token drag, the R6 character sheet, crew rail and place label.
  - A plain GM dock on the Scene, and stubs for the other tabs.
- **Done when:** the two-browser checks below pass, and you sign off on it next to the R6 board.
- **Why first:** it fixes the protocol, state shape, content schema and CSS. Everything else builds on these.

### M2: The roll · M · single session (one subagent for the rules tests)
- **Goal:** the R6 roll dialog with dice rolled on the server. The full animation shows only on the roller's screen. Everyone else sees "rolling", then the result on that token and in the crew rail.
- **In it:**
  - **Rules (`rules.py`):** skill or chrome steps the die up one size (a d20 gets +2), the explosion chain stops at 6 dice, and a nat 1 counts only on the first die.
  - **Entropy:** Push +1 (+2 if the die exploded), at most 2 per roll, no push on a nat 1. Entropy stays within 0–6.
  - **RollFX:** ported verbatim from R6. Three changes only:
    - the `Math.random` dice block (around line 968) takes the server's values;
    - the `ves@ergo` prompt uses the roller's handle;
    - the insults (around lines 351–359, including "YOU BRICKED IT, GENIUS.") move to `content/insults.yaml`.
  - **Dialog:** Pick → Rolling (the "Roll again" gate releases itself after 4 s; Skip) → Done (difficulty ladder, Push, and "Yeah. Okay." on a nat 1).
  - **Result callout** on the token and the rail. This needs a small design step: the restyled Round 2 `.t2-evt` logic.
  - **GM dock:** set the difficulty, and make public or hidden GM rolls for NPCs.
- **Done when:**
  - Only the roller's laptop shows the scene.
  - A nat 1 cracks red, shows an insult and offers no push.
  - During a hidden GM roll, players receive zero frames (test).
  - The parity test shows 0 pixel diff between the original and the ported RollFX at fixed seeds.
  - The playtest checkpoint follows.
- **Why second:** rolls matter most for the feel at the table, and only you can judge that.

### M3: Pockets and notes · S · single short session
- **Goal:** you control every inventory, and clues are handed out as readable note items.
- **In it:**
  - Item YAML with kinds gear, note, credits and key; notes carry a Markdown body or an image.
  - You give, take and move items, and write notes on the fly mid-session.
  - A note reader, and a NEW pulse that only the receiver sees.
- **Done when:**
  - A note handed to Marlo reaches only Marlo and you (socket test).
  - It survives a restart.
  - You approve how the reader looks.
- **Why here:** it is small and backend-heavy. It also gives the GM tab its last missing control before that tab is designed.

### M4: GM tab · M · design fan-out, then a single build session
- **Goal:** one designed GM tab that replaces the plain dock.
- **In it:**
  - **Design:** 2–3 R6-style variants first; you pick one.
  - **Crew table:** HP, Entropy and inventory, with give, take and drag between characters.
  - **Map control:** mood and switches for every map, and send the crew to a map.
  - **Token roster:** spawn, hide and reveal, remove.
  - **Roll board:** public or hidden rolls, difficulty, history, and a margin-to-damage helper.
  - **Session controls:** "New session" sets Entropy to 2, plus awarding Entropy.
  - Undo last, as a compensating event, and a "view as player" preview.
- **Done when:** you can run the bar scene without touching the dock, undo works on every screen, and no player snapshot ever contains a hidden token (test).
- **Why here:** after M1–M3 every GM function exists, so one design pass can lay them all out.

### M5: The other 10 maps · M · best ultracode fan-out
- **Goal:** every map from the Maps canvas, driven by data.
- **In it:**
  - **Shared features first:**
    - SVG camera cones;
    - Executive deck support, with `oy = 150 + (9 − deck) × 450`, where the deck jump keeps X,Y;
    - point-of-interest pins that only you see.
  - **Per-map files:** one `content/maps/<id>.yaml` per map, with assets deduplicated by sha256.
  - **Order:** Patience and Promenade CALM (session 1), Executive decks (session 2), then the rest.
- **Done when:** a screenshot of each map in each mood matches its board, and a token placed on a key point lands on it.
- **Why here:** it depends only on M1's map schema. It can run in parallel with M3–M4.

### M6: Station, Crew and Codex tabs · M · design session, then fan-out
- **Goal:** the three undesigned tabs, with no spoilers.
- **In it:**
  - **Crew:** dossiers. Each player sees only their own private brief.
  - **Codex:** "How to play" from the Rules board (with Humanity and the meter removed), world entries and a glossary. You unlock entries; the NPC card's Codex button links to them.
  - **Station:** the Ergo art with place hotspots.
- **Done when:** locked entries and other players' briefs never reach a player (test), and you sign off on all three tabs.
- **Why here:** you need to have felt the core first. The content comes from the bible.

### M7: Ship for session 1 · S · review fan-out plus your dry run
- **Goal:** hosted, hardened and rehearsed.
- **In it:**
  - **Railway:** a deploy with a `/data` volume, env-var passcodes, Secure cookies and a single replica.
  - **Backups:** export/import, and a backup before each session.
  - **Checks:** layout at 1280×800, 1366×768 and 1440×900; a 6-seat Playwright soak test; a low-power-mode check on the weakest laptop.
  - **Session-1 content:** start positions, starting inventories and unlocked entries.
- **Done when:**
  - A scripted walk works on the hosted URL: Patience → Promenade CALM → Event Horizon OPEN.
  - A restore from backup reproduces the exact state.
- **Why here:** it is the last gate before session 1. Move Railway earlier if players read briefs at home first (open decision 7).

### M8: Fights and big moments · M · single session (one subagent for the rules tests)
- **Goal:** the rest of the Entropy economy, and fights.
- **In it:**
  - Enemy cards (health, attack die, check to hit), and GM attack rolls.
  - Damage by margin (0–4 = 1, 5–9 = 2, 10+ = 3), applied when you confirm it.
  - Team-up: each person rolls on their own screen and the totals add on a shared full-screen roll.
  - "I know a guy" (2 Entropy), Last stand (3, once per fight), and an "out" state at 0 HP.
- **Done when:** the damage tiers pass a table-driven test, and Last stand is refused the second time in a fight.
- **Why here:** session 1 has no fight. It is needed before the first fight, session 2 at the earliest.

### M9: Finale screen · S · single session after a design review
- **Goal:** Terminal SEAL IN, with a station feed you type or queue and two clocks (the station runs about 3.2× faster).
- **In it:** clocks stored as a start time plus a rate, so a reconnect can't knock them out of sync.
- **Why last:** it is needed only in the final session.

---

## Milestone 1 in detail

### Repo layout
```
Dockerfile  docker-compose.yml  .env.example  Makefile   (dev, up, test, types, assets, reset-world)
server/pyproject.toml                (uv; fastapi, uvicorn[standard], pydantic, pydantic-settings, itsdangerous, pyyaml)
server/lso/
  main.py      app: /api, /ws, /healthz, /assets (auth required), SPA fallback
  config.py    settings from env
  auth.py      passcode login, signed cookie, viewer dependency
  content.py   load + validate content/ at boot; fail loudly
  models.py    Pydantic content, state and message models (discriminated on "t")
  store.py     SQLite WAL: append event + rewrite snapshot in one transaction
  state.py     GameState + apply(event), a pure reducer
  commands.py  intent -> authorize -> validate -> event(s)
  views.py     project(state, viewer): the ONLY outbound filter
  hub.py       connections, heartbeat, per-viewer fan-out
  schema.py    JSON Schema dump for TypeScript codegen
server/tests/  test_auth, test_ws, test_view_leaks, test_replay, test_content
content/
  characters/{lale,marlo,tally,ves,tomo}.yaml   stats, skills + chrome (kind, downside, icon), portrait, items
  npcs/*.yaml                                   name, role, ring colour, portrait, mood, note, gm_note
  maps/event-horizon.yaml
  items/*.yaml                                  name + icon only in M1
  start.yaml                                    token start coords, hp 6, entropy 2
assets/manifest.yaml                            semantic path, source artifact, asset id, sha256, size
assets/{maps/event-horizon,portraits,icons/stats,icons/dice,icons/list,icons/items}/
scripts/import_assets.py                        run with python -I; checks magic bytes, size, sha256; dedupes
design/reference/                               R6.dc.html, Maps Main.dc.html + Key.dc.html, optional r6-scene.png
web/
  vite.config.ts                                proxies /api, /assets, /ws (ws: true) to :8000
  public/fonts/                                 self-hosted OFL: Michroma, Hanken Grotesk, Jost, VT323, Doto, Silkscreen, Archivo
  src/styles/meridian.css                       the R6 <style> block, copied as is (cascade order kept)
  src/net/{socket.ts, protocol.gen.ts}          reconnecting WS, backoff 0.5 s -> 8 s; generated types
  src/store/game.ts                             Zustand
  src/lib/{proj.ts, ring.ts}                    copied from R6 / Main, with unit tests
  src/shell/{Header,Tabs,CrewRail,PlaceLabel}.tsx
  src/sheet/{Sheet,RingPortrait,StatTable,RuledList,ItemRow}.tsx
  src/map/{MapView,MapLayers,Token,NpcCard,usePanZoom}.tsx
  src/gm/GmDock.tsx
  src/pages/{Login,Station,Crew,Codex,Gm}.tsx   last four are R6-styled stubs
  src/dev/RefOverlay.tsx                        ?ref=scene: R6 screenshot overlay with opacity slider
```

### Data model

**SQLite (WAL), three tables:**
- `events(seq PK autoincrement, ts, actor, intent_id UNIQUE, type, data JSON, prev JSON, v INT)`: append-only. `prev` holds the old value, so undo later is a compensating event.
- `snapshot(id = 1, seq, state JSON)`: rewritten in the same transaction as each event.
- `meta(key, value)`: `schema_version` and `auth_epoch`.

On boot the server loads the snapshot. An empty database gets one `world.seeded` event from `start.yaml`. A test checks that replaying every event reproduces the snapshot.

**GameState v1** (in memory, behind one `asyncio.Lock`, with uvicorn `--workers 1`):
```
seq
maps:   { "event-horizon": { mood: "open", switches: { seals_box: false, hatch: false, gas: 0 } } }
tokens: { id: { kind: crew|npc, ref, map, at: [X,Y,Z], hidden: false } }   # world coords, never pixels
vitals: { char_id: { hp: 0..6, entropy: 0..6 } }
```

**Content** is read-only YAML, loaded into Pydantic models (Character, Npc, MapDef, Item) and referenced by stable slugs. The map file is pure data:
```yaml
id: event-horizon
display: [2560, 1440]          # 1280x720 art drawn at 2x, image-rendering: pixelated
origin: [536, 201]             # proj(X,Y,Z) = [((X-Y)*30+ox)*2, ((X+Y)*15 - Z*36 + oy)*2]
moods: [open, after, stand]    # each: base PNG + glow PNG (mix-blend-mode: screen, 7 s flicker)
switches:
  - {id: seals_box, type: bool,  moods: [after]}
  - {id: hatch,     type: bool,  moods: [stand]}
  - {id: gas,       type: level, max: 3, moods: [stand]}
# layer order from the Maps board: bases -> patches -> glows -> gas
```

**Merging the two boards:**
- R6 draws only bases and glows; the patches and gas layers come from the Maps board.
- The default seating uses the Maps board's 16 tokens at the founder's table, which matches session 1.

**M1 events:** `world.seeded`, `token.moved`, `token.hidden_set`, `map.mood_set`, `map.switch_set`, `vitals.set`.

### WebSocket protocol (`/ws`, JSON)

Every client intent has the shape `{t: "intent", id: <uuid>, type, args}`. A retried intent id gets back the original ack, so nothing applies twice.

| Client → server | Who may send it | Result |
|---|---|---|
| `token.drag {token, at}` | Player: own crew token. GM: any token. | Not logged; relayed at ≤20 Hz |
| `token.move {token, at}` | Same as drag | Logs `token.moved` |
| `gm.map.mood {map, mood}` | GM | Logs `map.mood_set` |
| `gm.map.switch {map, switch, value}` | GM; checked against the map file | Logs `map.switch_set` |
| `gm.vitals.adjust {char, hp_delta?, entropy_delta?}` | GM; clamped to 0–6 | Logs `vitals.set` |
| `gm.token.hide {token, hidden}` | GM | Logs `token.hidden_set` |
| `ping` / `resync` | Anyone | Server replies `pong` / `welcome` |

| Server → client | When | Who receives it |
|---|---|---|
| `welcome {viewer, content, state, seq}` | Connect, reconnect, resync | Each viewer gets their own projection |
| `state {seq, state}` | After every committed event (a few KB) | Each viewer gets their own projection |
| `drag {token, at, by}` | During a drag | Viewers who can see that token, except the sender |
| `ack {id, ok, code?: forbidden\|invalid}` | After each intent | Sender only |
| `pong` | After a ping | Sender only |

**Visibility rule:** every outbound frame passes through `views.project()`. In M1 that strips hidden tokens and NPC `gm_note` fields for players. Positions, moods, switches and everyone's HP and Entropy are public, because the rail rings show them.

**Leak test:** it puts `SECRET-*` markers into GM-only fields and checks that no frame bound for a player contains one.

**Why full state on every change:** sending each viewer their whole filtered state means no gap logic. A new event type also can't leak by accident.

### Auth flow
1. You set `LSO_SECRET` and `LSO_PASSCODES="gm=…,lale=…,marlo=…,tally=…,ves=…,tomo=…"` in `.env`. They are never committed.
2. `POST /api/login {passcode}` compares in constant time, with at most 5 tries per minute per IP.
3. On success it sets the cookie `lso_session`: itsdangerous-signed `{seat, role, char, ep}`, HttpOnly, SameSite=Lax, Secure when enabled, valid for 180 days.
4. `GET /api/me` and `POST /api/logout` complete the API. Bumping `auth_epoch` logs everyone out.
5. `/ws` checks the cookie and the Origin at the handshake. If either fails it closes with code 4401, and the client shows the login page.
6. `/assets/*` requires a valid cookie, so spoiler maps can't be guessed by URL.
7. `LSO_DEV_LOGIN=1` enables `/api/dev/login/{seat}` for tests. It is refused whenever Secure cookies are on.

### Docker and compose
- **Dockerfile, stage 1:** `node:22-alpine` builds `web/dist`.
- **Dockerfile, stage 2:** `python:3.12-slim` runs `uv sync --frozen --no-dev`, then copies `server/`, `content/`, `assets/` and `dist`. `VOLUME /data`. The start command:
  `uvicorn lso.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --ws-ping-interval 20 --proxy-headers`
- **compose `app` service:** builds the production image on port 8000 with the `lso-data:/data` volume and reads `.env`.
- **compose `dev` profile:**
  - `api`: `uvicorn --reload`, with `server/`, `content/`, `assets/` and `./data` bind-mounted;
  - `web`: `vite --host` on port 5173, proxying to `api`.
- The same image goes to Railway in M7.

### Order inside M1
1. **Import the assets.** That is about 89 files, roughly 1.9 MB. Each needs its own Artifact read, because batch reads by asset id fail.
2. **Test speed and sharpness first.** Put the map and tokens up on the weakest laptop, in Chrome and Safari.
3. **Server core and tests.**
4. **WebSocket and store.**
5. **Sheet, rail and header.**
6. **GM dock, then Docker polish.**

### Deliberately stubbed in M1
- **Rolls:** stat tiles wiggle on hover but open nothing. Use physical dice.
- **Tabs:** Station, Crew, Codex and the GM tab are empty R6-styled panels. GM powers live in the plain dock.
- **Items:** icons with tooltips only. No notes, no give or take.
- **NPC card:** the Codex button is disabled.
- **Maps:** only The Event Horizon. Undo values are stored, but there is no button.
- **Icons:** Lale, Marlo, Tally and Tomo get placeholder skill and chrome icons until decision 2 below.
- **Not built at all:** Railway, Comms, AI features, the ISCO compute meter, Humanity.

### Checks you can run by hand
1. `cp .env.example .env`, set the passcodes, then `docker compose up --build` and open http://localhost:8000.
2. Log in as GM in Chrome and as Ves in Safari. Two browsers keep the cookies apart.
3. Ves's sheet shows the ring at HP 6 and Entropy 2, dice d4/d20/d10/d8/d12/d6, her skills and chrome, and her items. Ves is pink in the rail.
4. Drag Ves in Safari. Within about 200 ms she glides to the same spot in Chrome. Then drag her from the GM side.
5. As Ves, try to drag Dax. He doesn't move. A forged `token.move` in DevTools returns `forbidden`.
6. Click AFTER HOURS as GM: both screens crossfade in about 0.7 s.
   - Seal's box opens the lid.
   - LAST STAND with the hatch and gas 1–3 shows each layer.
7. Set Ves to HP 3 and Entropy 4: her sheet and both rails update. The values stop at 0 and 6.
8. Hide Cleaner Unit 14: it disappears for Ves and shows dimmed for you. In DevTools → Network → WS, no frame contains `cleaner-14`.
9. Run `docker compose restart`. Both browsers reconnect without a reload, and positions, moods and vitals are unchanged.
10. Turn Ves's Wi-Fi off for 60 s, or sleep the laptop. It comes back showing the current state.
11. A second laptop on your LAN works at `http://<your-ip>:8000`.
12. Compare at 1440×900 against R6 using `?ref=scene`, and check 1280×800 too. You sign off.
13. `make test` passes.

---

## How hard is this

**The result:** moderate overall. It's about 10–16 focused sessions until session 1 is ready, and about 3 more for fights and the finale.

**Easy, well-trodden work:**
- FastAPI, one WebSocket and SQLite for 6 clients.
- Passcode cookies and Docker.
- The dice rules, about 30 lines.
- Map files written as data.
- You can read and review the Python server directly.

**Real effort:**
- **R6 → React without visual drift.** The board uses its own template runtime, heavy inline styles and cascade overrides. `support.js` wasn't saved, so the board can't be rendered offline, and reference screenshots must come from the live canvas.
- **Roll timing around server dice.** Cases to handle: the gate, Skip, a push after the reveal, and the roller's laptop sleeping mid-roll.
- **Map speed and sharpness.** Layers up to 3600×2160, with blend modes, flicker and about 16 animated GIF tokens, run under a CSS transform. Sharpness differs between Chrome and Safari.
- **Not leaking secrets.** Hidden tokens, GM rolls, note bodies, briefs and locked entries must never reach a player. This is the classic bug in apps like this; the single filter and the leak tests prevent it.
- **Collecting the art.** About 89 single downloads for M1 and about 250 in total, deduplicated by hash, because the same image has a different id in each artifact.
- **Five undesigned surfaces.** The GM tab, Station, Crew, Codex, and the roll callout for non-rollers. Each needs a review loop with you.
- **Missing art.** 18 skill and chrome icons, and only one generic CLUE icon for notes.

---

## Where ultracode fits

Ultracode is a Claude Code session setting (`/effort ultracode`). It uses extra-high reasoning effort and lets Claude launch multi-agent workflows on its own. It costs noticeably more. These details come from third-party write-ups, not Anthropic's docs:
- [MindStudio](https://www.mindstudio.ai/blog/what-is-ultra-code-mode-claude-code)
- [claudefa.st](https://claudefa.st/blog/guide/development/ultracode)
- [Pilot Shell](https://pilot-shell.com/blog/ultracode)

**Building the whole thing in one go would hurt here:**
- In an empty repo, parallel agents would each invent their own protocol, ids and styles.
- Five of the screens are undesigned, so agents would choose designs for you.
- Whether the rolls feel right needs your eyes.

| Milestone | Fit |
|---|---|
| M1, M2, M3, M8 | Single focused session. One subagent can write the rules tests, and one reviewer can check auth and leaks. |
| M4, M6 | Fan out the design variants, then you pick. M6 content (codex entries, briefs) can also fan out, with a spoiler reviewer. |
| M5 maps | Best fit: one agent per map, plus a verifier that compares screenshots with the boards. |
| M7 | Parallel reviewers for leaks, reconnects and browsers, plus Playwright tests. The dry run is yours. |

To use it per task, put "ultracode" in that milestone's prompt rather than leaving it on for the whole session.

---

## Decisions still open

**Before M1:**
1. **Split party.** When the crew is on different maps, should each player see the map their own token is on? My suggestion: yes, and you can view any map. This shapes the M1 state.
2. **Missing skill and chrome icons** for Lale, Marlo, Tally and Tomo (18 in total). Should we draw new ones on the Icons canvas, reuse close Implant icons, or use text-only rows for now?

**Before M2:**

3. **When others see a roll's result.** At the roller's Done screen (keeps the suspense; needs a 30 s automatic reveal), or as soon as the dice land?
4. **Entropy on a failed roll.** When you've named a difficulty, is the +1 Entropy added automatically or only after you OK it?
5. **Roll requests.** Should you be able to send a request like "Cool, Hard 7" that opens that player's picker?

**Later:**

6. **Item privacy.** Can players see each other's items, or only their own? Note bodies stay visible only to the holder and you either way. This sets the M3 filter.
7. **Briefs before session 1.** Will players read their briefs at home through the app? If yes, Railway and the Crew tab must land earlier.
8. **Station tab.** Can players open maps of places they haven't visited yet? Decide at the M6 design pass.