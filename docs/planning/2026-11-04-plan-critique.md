1. **High: the welcome frame leaks content.**
   - Problem: `welcome {viewer, content, state, seq}` sends `content`. The M1 filter only removes hidden tokens and `gm_note`, so a player still receives the full catalogue of NPCs, items and maps. That includes a hidden token's name, portrait and note, so manual check 8 ("no frame contains cleaner-14") fails as designed. Once M5 lands, the map list also names Vault, Terminal and SEAL IN to every player. The `SECRET-*` leak test only covers GM-only fields, so it can't catch this. Every character's items also go to everyone while open decision 6 is undecided.
   - Fix: `views.project()` must filter content as well as state. Send only the NPCs, items, maps and codex entries that the viewer's projected state references or that the GM has revealed. Until decision 6 is made, a player gets only their own inventory. Extend the leak test so that a hidden token's ref, name and portrait path never appear in any player frame, including `welcome` and `drag`.

2. **Medium: hidden actions still send frames to players.**
   - Problem: the plan sends `state {seq, state}` to every viewer after every committed event. A hidden GM roll, or a GM move of a hidden token, therefore still sends each player a frame with a new `seq`. That breaks M2's own done-when ("players receive zero frames"), and the gaps in `seq` show that hidden activity is happening.
   - Fix: send `state` only to viewers whose projection actually changed (compare hashes). Give each viewer their own counter in place of the global `seq`.

3. **Medium: `/assets/*` behind a cookie doesn't stop guessing.**
   - Problem: every player has a valid cookie, and the manifest uses readable paths (`assets/maps/<id>/…`). Anyone can type the URL of a spoiler map.
   - Fix: name served files by their sha256. Allow a file only if the viewer's projected content references it; the GM gets everything.

4. **Medium: a UNIQUE `intent_id` on `events` breaks intents that create several events.**
   - Problem: `commands.py` turns one intent into "event(s)". "New session" writes 5 Entropy values, and a roll plus its Entropy change is 2 events, so the UNIQUE column fails. Rejected intents and `token.drag` are never logged, so "a retried id gets back the original ack" can't hold for them either.
   - Fix: add an `intents(id PK, seat, ack JSON, first_seq, last_seq)` table, written in the same transaction as the events. Make `events.intent_id` non-unique.

5. **Medium: GameState v1 doesn't fix the state shape, though the plan says M1 does.**
   - Problem: it has no inventories. Items sit in the read-only character YAML, but M3 needs them as GM-controlled state. It has no field for the map each viewer sees, although open decision 1 is said to "shape the M1 state". It has no deck: the Executive board's `proj` takes a 4th argument `k`, and its tokens are `[X,Y,Z,deck]`. It has no roll records.
   - Fix:
     - add `inventory: {holder: [{id, item, …}]}`, seeded from `start.yaml` (shown as static icons in M1);
     - add `scene: {party_map, overrides}`;
     - allow an optional `deck` in `at`;
     - add an empty `rolls` list;
     - move starting items out of `characters/*.yaml`.

6. **Medium: the GM's own screen is undefined.**
   - Problem: R6 is a player layout built around a 340px sheet for "me", and Peter has no character. M1 doesn't say what fills that column for the GM. M4's done-when ("run the bar scene without touching the dock") is impossible if the GM tab has no map, because moving NPCs needs the map. M1 builds a dock that M4 then throws away.
   - Fix: in M1, define the GM Scene as the R6 Scene with the sheet column replaced by a GM panel: crew vitals, mood and switch controls, and the token roster. In M4, redesign that same map-based layout as the GM tab. Add a second, non-map page for inventory, notes and roll history.

7. **Medium: the default seating doesn't match session 1, and it spoils.**
   - Problem: on the Maps board, only 6 of the 16 tokens sit at the founder's table (`seat()`, Z 0.24): the fixer and the 5 crew. The other 10 are a portrait showcase: Hired gun, Patience steward, Med Bay nurse, Dock 7 clerk, Night Market vendor and so on. A visible Hired gun in the bar during session 1 gives away the fixer's muscle from the finale.
   - Fix: `start.yaml` seats the crew and the fixer as on the board, plus Dax and the bar regulars (as in R6). Cleaner 14 starts visible or hidden, the GM's choice. Every other NPC goes in the GM roster, unplaced.

8. **Medium: edits to `start.yaml` are silently ignored after the first boot.**
   - Problem: the seed applies only to an empty database. M7's "session-1 content" means editing start positions and inventories after weeks of testing, and Railway has no shell for `make reset-world`. Renaming a content slug also breaks replay.
   - Fix:
     - add a `gm.world.load_preset {preset}` event (positions, inventories, vitals, moods) that the GM can run from the UI;
     - at boot, check that every ref in state exists in content, and fail loudly with the list;
     - make `reset-world` work against `/data` inside the container.

9. **Medium: `VOLUME /data` in the Dockerfile breaks the Railway build.**
   - Problem: Railway rejects the instruction with "The `VOLUME` keyword is banned in Dockerfiles" ([Railway station](https://station.railway.com/questions/build-from-dockerfile-error-the-volume-8a90b885), [cusdis#215](https://github.com/djyde/cusdis/issues/215)). That contradicts "the same image goes to Railway".
   - Fix: remove it from the Dockerfile, declare the volume only in compose, and attach a Railway volume at `/data`.

10. **Medium: `--proxy-headers` without `--forwarded-allow-ips` breaks things behind Railway's proxy.**
    - Problem: by default uvicorn trusts forwarded headers only from 127.0.0.1. On Railway, every client's IP becomes the proxy's IP and the scheme reads as http. The per-IP limit then becomes one shared bucket of 5 tries a minute for the whole table. Secure-cookie detection fails, and an Origin check that compares scheme and host fails too.
    - Fix:
      - set `--forwarded-allow-ips='*'` (or `FORWARDED_ALLOW_IPS`) on Railway;
      - check that the Origin host equals the Host header, or is on an allowlist that includes `localhost:5173` for vite and LAN IPs;
      - key the rate limit per IP, with a global ceiling high enough for 6 people.

11. **Medium: the RollFX "three changes only" and the 0-pixel parity test contradict each other.**
    - Problem:
      - `INSULT` is inside the RollFX closure, and `plan()` picks from it with the seeded RNG (lines 653–654). Moving the insults to YAML changes the `plan()` signature.
      - `ves@ergo` appears in 6 `TERM` lines (340–344) and again at line 410, not once.
      - Both changes alter the pixels of the nat-1 and Tech scenes, so 0 diff is impossible.
      - Canvas text depends on webfont loading, and Safari ignores `ctx.fontStretch`, so the condensed Archivo insult renders differently there.
    - Fix:
      - give `plan()` `insults` and `handle` options;
      - make the parity test a deep-equal of `plan()` output at a fixed seed with the original values injected, plus a few frame snapshots in Chrome with a tolerance;
      - self-host Archivo with its wdth axis, and register a separate condensed `@font-face` family for the canvas.

12. **Medium: the ultracode advice is probably wrong.**
    - Problem: the sources describe ultracode as a session setting (`/effort ultracode` or the effort slider): xhigh effort plus permission to launch workflows. None describes a prompt keyword like "ultrathink". "Put 'ultracode' in that milestone's prompt" likely does nothing ([Pilot Shell](https://pilot-shell.com/blog/ultracode), [claudefa.st](https://claudefa.st/blog/guide/development/ultracode), [dev.to](https://dev.to/stacknotice/claude-code-ultrathink-vs-ultracode-every-effort-level-explained-2026-22g7)).
    - Fix: tell the user to run `/effort ultracode` at the start of the M5 and M7 sessions, and to switch back to their normal effort afterwards.

13. **Medium: the reference files sit in a temporary scratchpad and could be lost.**
    - Problem: R6, the map boards, `bible.md` and the already-downloaded assets live under `/private/tmp/...scratchpad`. That folder belongs to this session, and macOS cleans `/tmp`. M1 copies only R6 plus the Maps Main and Key boards, but:
      - M2 needs `Round2.dc.html` (`.t2-evt`), `R2Events`, `R6Pick` and `R6Result`;
      - M5 needs all 17 map boards;
      - M6 needs the bible and the Rules board.
    - Fix: make step 0 of M1 copy every saved board, each `canvas.json` and the bible into `design/reference/` (the repo is private). Reuse the saved image files, checked by sha256, and fall back to an Artifact read when one is missing.

14. **Medium: M1 is too big for "M · single session", and its order is off.**
    - Problem: M1 is about 40 files and 89 separate Artifact reads, plus auth hardening, codegen, prod and dev Docker profiles, the RefOverlay, and speed tests on the user's own hardware in two browsers. Importing all 89 assets comes before the speed test, which needs only about 11 bar layers and the bar's portraits.
    - Fix: import the bar layers and portraits first, test speed, then import the rest (only what the bar scene uses). These can move to M7 without hurting the slice:
      - the login rate limit;
      - `auth_epoch` and logout-all;
      - `/api/dev/login`;
      - Secure-cookie handling;
      - JSON Schema → TypeScript codegen: hand-write the 6 message types now and add codegen in M2;
      - the RefOverlay: compare side by side with the board screenshot.

15. **Low–medium: map switching sits in the wrong milestone.**
    - Problem: M5 "can run in parallel with M3–M4", but the only way to change maps ("send the crew to a map") is in M4. Without it, the new maps can't be reached or tested in play.
    - Fix: put `gm.scene.set_map` and a per-token map change in M5, or put the state for it in M1 with a dock button. It follows decision 1.

16. **Low–medium: the M8 team-up "shared full-screen roll" could break the roller-only rule.**
    - Problem: if it shows on every screen, people who aren't in the team-up see the full roll UI, which contradicts the user's decision.
    - Fix: show the full-screen roll only to the people taking part. Everyone else sees the result on the tokens and the crew rail.

17. **Low: seat and connection edge cases.**
    - Problem:
      - With one seat open on two devices, both get the roll scene.
      - A reload mid-roll can't resume, because the client picks the animation seed with `Math.random` (line 970).
      - GM rolls cover NPCs only, so an absent player's character can't be rolled for.
    - Fix:
      - the server stores each roll as `{rolls, sides, bonus, seed}`;
      - send the full scene only to the connection that started the roll;
      - a reconnect resumes at Done;
      - the GM can roll with any crew member's stat line.

18. **Low: drag edge cases and the screen-to-world conversion.**
    - Problem:
      - An incoming full `state` during your own drag snaps your token back.
      - If the dragger disconnects, the token stays stuck at its drag position on other screens.
      - R6 and Main drag in pixel space and have no inverse of `proj`, yet the plan stores world coordinates and the table tokens sit at Z 0.24.
    - Fix:
      - keep a local drag overlay on top of incoming state;
      - send `drag_end`, or expire relayed drags after about 1 s;
      - add `unproj(px, py, Z)` with Z held at the token's own value to `proj.ts`, with a round-trip test.

19. **Low: NPC mood and note can't change during play.**
    - Problem: the R6 NPC card shows mood and note, but they are static YAML, and no milestone lets the GM change them live or reveal a name or role.
    - Fix: add `gm.npc.set {mood, note, revealed}` public overrides in M4.

20. **Low: Team-up and "I know a guy" can come up before the first fight.**
    - Problem: both can happen in session 1's social scenes, but they are bundled into M8.
    - Fix: say that in session 1 they run by hand (separate M2 rolls, with the GM adjusting Entropy), or add a one-click "I know a guy (−2)" to M2.