# Last Stable Orbit: recommended build plan

## Progress (updated 2026-11-10)

| Milestone | Status |
|---|---|
| M1: Tokens at The Event Horizon | **Done** (commits 05cddc2, 4901ce3, 9a51d7c) |
| M2: The roll | **Done** (see "How M2 turned out") |
| Playtest | **Dropped as a gate.** Peter tests alone as we go; the first group test is game day |
| M3: Pockets and items | **Done**, with Round 9's inspector (commits 1ad1e25, bbcea7b). Item and chrome texts are drafts for Peter to edit |
| M4: GM tab | **Done** 2026-11-04, from Round 12 (see "How M4 turned out" in M4). Peter tried it and is happy. NPC dice are drafts for Peter to set |
| Stage: the TV and cutscenes | **Done** 2026-11-04. Peter tried it: "looks good and works well". The TV logs in with one click, no passcode. See "How Stage turned out" |
| M5: The other 10 maps | **Built** 2026-11-04: all 11 maps are in the app. After Patience and the Promenade, Peter said go on to the other eight; those are for him to look over. Texts, NPC cards, dice and positions are drafts. See "How M5 is going" |
| M6: Station and Codex tabs | **Built** 2026-11-04, with the rules change (see "How M6 is going" in M6). The Crew tab is gone. Codex and Station texts, and the Codex's card crops, are drafts for Peter, who hasn't tried either tab yet |
| M7: Ship for session 1 | **Hosting decided** 2026-11-05: parker at http://parker.local instead of Railway, with a join card on the TV (the README's "Hosting it at the table"). Backups and the layout checks are not started |
| M8: Fights | **Built** 2026-11-05 and checked on :8071 with four seats (the GM, Tomo, Ves and the TV); see "How M8 turned out" in M8. Deployed to 8070 the same day. NPC health beyond the bible's enemy cards is drafts |
| Round 17: rolls with pop | **Built** 2026-11-06 and checked on :8071 with three seats (the GM, Tally and the TV); see "How Round 17 turned out" below. Deployed to 8070 the same day; parker still needs `git pull && make up`. The TV's sound is for Peter to judge by ear |
| The TV's turn order | **Built** 2026-11-06 and checked on :8071 with two seats (the GM and the TV); see "Changed 2026-11-06" in M8. Deployed to 8070 the same day, with the NOW marker; parker still needs `git pull && make up`. The sound is for Peter to judge by ear |
| Always the TV | **Built** 2026-11-06 and checked on :8071 with three seats (the GM, Tally and the TV) on a copy of the saved game; see "Changed 2026-11-06: the TV is always there" in Stage. Deployed to 8070 the same day; parker still needs `git pull && make up` |
| Events: the Satisfaction Report | **Built** 2026-11-08 and checked on :8071 with two seats (the GM and Marlo); see "Events" below. Deployed to 8070 the same day; parker still needs `git pull && make up` |
| The slots | **Built** 2026-11-08 and checked on :8071 with six seats (the GM, Tally, three more at the machines and the TV); see "The slots" below. Deployed to 8070 the same day; parker still needs `git pull && make up` |
| Events: mini-golf | **Built** 2026-11-08 and checked on a copy on :8072 with two seats (the GM and Marlo); see "Events" below. Sent from the GM tab until the top executive floor's map brings its object. Deployed to 8070 the same day, with the heist maps; parker still needs `git pull && make up` |
| The heist maps | **Built** 2026-11-08 and checked on a copy of the saved game on :8072 as the GM; see "The heist maps" below. Deployed to 8070 the same day; parker still needs `git pull && make up`. Object texts, pins and camera cones are drafts for Peter |
| The story, against the live bible | **Done** 2026-11-08: the content now matches the live Campaign Bible, and the repo's copy is deleted. See "The story consolidated" below. Includes session 1's four presets and Scene only. Tests pass, and it was checked on a copy of the saved game. Deployed to 8070 the same day; parker still needs `git pull && make up`. New wording is marked DRAFT in the YAML |
| The GM screen, consolidated | **Built** 2026-11-08 from the canvas "GM screen, consolidated" (https://claude.ai/artifact/Pd3ZR19LyxgnLWWypoaXGs) and checked in the sandbox with a Playwright walk of the GM, a player, and the wall of seats; see "The GM screen, consolidated" below. Deployed to 8070 the same day; parker still needs `git pull && make up` |
| Whose turn and who you are, on the board | **Built** 2026-11-09 from the canvas "Turn and You markers" (https://claude.ai/artifact/Uqw6WrtbFK1J83vVRrbCek), rows Lift and Ground ring, and checked in the sandbox as Tally, the GM and the TV. In a fight, whoever's turn it is gets a faint glow and a small lift on every screen and the TV, once the Reflex dice have landed. A player's own chip gets a green ring at its feet, and the GM and the TV never see one |
| The opening | **Built** 2026-11-09 from `lso_opening.zip` and checked on a throwaway copy with three seats (the GM, Tally and the TV), from the login to the film's end; see "The opening" below. Deployed to 8070 the same day; parker still needs `git pull && make up`. The sound is for Peter to judge by ear |
| The soundboard | **Built** 2026-11-10 from `lso_soundboard.zip` and checked in the sandbox with the GM and the TV connected. `content/soundboard.yaml` lists 24 clips under four buttons on the GM's top bar (Fight, Droid, Heist, Bits), left of Live. `gm.sound.play` puts the press in the state, and only the TV gets the files and plays them, overlapping, already decoded. Greyed out with no TV connected. Parker needs `git pull && make up`. |
| M9: Finale screen | Not started |

**The GM's Session and On screen pages** (2026-11-09, from the canvas https://claude.ai/artifact/6pNMrKUZbm3k9d1wy24Rm5):
- **On screen** now has everything but the session picker: the opening as Cutscenes' first row, the TV's status beside its heading, and the link and wifi as one switch. With no TV, the setup line sits inside the preview.
- **Session** is only the picker: one picture card per preset, grouped by `session`, with its art in `assets/presets/` and its line in the preset's `blurb`. Loading one is always the scene only: positions, NPCs, moods. HP, Entropy, pockets and the Codex are never touched, and New session is gone, so the GM sets Entropy by hand. `gm.world.load_preset` without `scene` still exists for the tests.
- **Reset the game** is a button on the opening's row while the players are held (`gm.opening.reset`, to `resets_to` in `content/opening.yaml`). It asks twice. It's a button rather than part of the film, so the intro can be shown without losing the game.
- **The join card** has no QR codes, and `segno` is gone. It's words on the TV, straight on the picture over the opening's stars (variant B on the canvas), and on a black backing over a map, where the art is too bright to read them.

**The opening** (2026-11-09, from `lso_opening.zip`, whose player code is `web/src/stage/opening_player.js`, kept verbatim):
- **The GM's On screen page** has it as the first row of Cutscenes. **Hold players** turns it on: the TV loops the stars and the music, and every player who logs in, or is already in, sees that same loop, silent, and nothing else (moving the mouse shows Change character, for a few seconds). The game sits behind it, inert, and the server refuses a held player's every intent. The GM works normally, so this is when the Patience gets set up.
- **Play** asks twice and waits for the TV. The film starts on the first beat at least 0.75 s after the press (`commands.beat_after`) and can't be stopped. It hides the join card, which otherwise stays over the loop so people can get in. When the film ends the server clears the opening, and everyone fades into the game. It does not move anyone: the GM sets the scene.
- **The state** is `stage.opening`: `loop_at`, `film_at`, `ends`, all server time. On means it exists. Only the TV gets the film and the sound, and only while it's on; a player's feed has only `held`, with the loop and its still (leak tests in `test_stage.py`). The paths and numbers are `content/opening.yaml`.
- **Unlike every other film, its sound is a separate file** (`films/opening-audio.flac`: the 96 s loop, then the film's sound), so the loop repeats seamlessly and the film lands on the beat. The zip's README plays it on the GM's device; here it plays on the TV, because laptops are silent. It goes through the context the TV's start click unlocks, and the video files stay muted. A TV that reloads mid-film jumps back into step after its start click.
- **The cue list** no longer has "Waiting screen" or "Intro": this replaces both, and `films/intro.mp4` is gone. The music credit (CC BY) is a Codex page, Lore's Credits, open to players from the start.
- **Checked:** the film started exactly on a beat, its picture stayed within about 10 ms of the shared clock, and a mid-film reload came back within 9 ms with the sound in the right place. Only in Chromium: decoding the FLAC is untested in Safari, where the README says to fall back to a WAV if `load()` fails. A failed load shows a line on the TV.
- **Not done:** a held player who picked the wrong character can't log out until the GM turns the hold Off.

**The GM screen, consolidated** (2026-11-08, red-teamed and drawn on the canvas above, which Peter approved):
- **The GM's Scene is one column.** The map dropdown, the title, the crew rail and the hover steppers are gone. The crew are pinned at the top with HP and Entropy always there, and a row takes over the rail's jobs (the ring, a roll spinning, a Burn, Failed?). Here and Things scroll between them, and Just a die sits at the bottom, where pressing a die rolls it. Next turn, the round, Who's in and End sit at the top of the column during a fight.
- **NPC HP any time:** every NPC row and card. `views._token_view` sends `hp` and `health` to the GM only; players still get them only in a fight (test in `test_bench.py`).
- **The map picker** opens from the place name, or M: first what's live (the party, anyone split off, any fight, the last map you looked at), then `content/map_groups.yaml`'s three places. Maps the crew hasn't reached are dim. A card's Send to uses it too. When you're on a map the party isn't, a bar says so.
- **The URL keeps your place:** `#scene/deck-8`, `#gm/maps`.
- **The GM tab** has a row of tabs instead of the side column: Pockets (one shelf to hand things out), On screen (cutscenes, the TV and events on one page), Maps (one grouped table, 14 rows instead of 5,832 px), Codex, Session (the start of the night, in order, with the join card).
- **Add an NPC** is grouped by `group` in `npcs.yaml`. The groups and the map groups are drafts for Peter.
- **The sandbox** (`make sandbox`, http://localhost:8072, passcode `test`): a copy of the real save, hot-reloading. `LSO_SANDBOX=1` adds the Bench and Seats to the GM tab: scenarios (`content/scenarios/`, presets plus GM commands to run after), moments and rewinding, forced dice, firing anything, a pretend TV, and every seat in a frame that can act. Without the flag the commands don't exist, no `moments` table is created and `?act=1` is ignored (tests in `test_bench.py`). Code: `server/lso/bench.py`, `web/src/gm/Bench.tsx`.
- **Not done:** two NPCs with the same name read the same in the column, so you can't tell which Hired gun a row is without opening its card.

**The story consolidated** (2026-11-08, against the live bible and the Session planning doc):
- **Changed:** Lucan Merrow and Dr. Irena Vos by name, the old man cut, a private letter per character instead of the invitation, the rest of session 1's items, Ahti, Static Kováč, the Gumshoe and the head of security added, and the three presets refreshed. The pitch is now After hours with Dax gone. Saved games move over once at boot (rules 5).
- **Portraits:** Ahti, Static, the Gumshoe and the head of security (Vera Lind) all have their real ones (2026-11-09), and so do the slot regular (Rudi Fenn, now a gambler) and the passengers (Portraits canvas, round 2). All four new people have flat placeholder dice and health. The generic cleaner bot wears Unit 3's face, so Unit 14 stays the one that's watching.
- **Waiting on Peter:** the clinic upgrades (nothing built; the app can't raise a maximum yet), the date on the victim's card (the victim is Jonah Pell), who's on the admissions record, and the bloodline hint in audio log #1.
- **Session 1's four presets** (built 2026-11-08, listed in beat order in the GM tab): arrival on the Patience, the open day (the crew in the Dock 7 queue, the Gumshoe in the Night Market), after hours (the crew outside the bar's door, Dax and Irena inside, Unit 14 in the corner), and the pitch. Positions are drafts, checked on the art.
- **Scene only** (built 2026-11-08): each preset in the GM tab has Scene only beside Load. It moves everyone and sets each map's mood and switches, and any fight ends. HP, Entropy, pockets, the Codex, what's been inspected, lit Station places and things already shown on a map all stay. Load still replaces everything. Checked in a browser as the GM, on a copy of the saved game on :8073.
- **The Patience's opening** (2026-11-09): the arrival preset stages everyone as the intro film leaves them, in a full lounge laid out by Peter: 12 passengers who came to see the Vigil (`Passengers` in the GM's Add list; renamed from pilgrims on 2026-11-09) 8 faces spread so no two neighbours match, and the open day has the same 12 in the Dock 7 queue. Who they are is a draft.
- **Not in the app yet:** the two new films (their cues show greyed out), and the later-session items. The Patience's vent is drawn as a decal and is an object the GM reveals; Peter hands Ves the burner key from the GM tab.

**The heist maps** (2026-11-08, from the Heist maps canvas, https://claude.ai/artifact/LpMi1WHzziSMdTDEoQ9uYk, with what's where from the Heist playground, https://claude.ai/artifact/62VgjT7Grfw2TK9YMSbgsr):
- **Six separate maps,** each with Day, Night and Alert: decks 6, 7, 8 and 9, the Secure floor and the Bot bays. The Executive tower is gone, along with its deck buttons and deck jump. The art is one flat picture per mood, so Alert doesn't pulse.
- **Marked on each:** things to inspect (hidden until the GM shows them), GM-only pins, arrival spots, and on the five floors with cameras, the cone. Every position was read off the art and checked on it.
- **Moving one person between maps:** the GM's token card has "Send to". It lands them at that map's entrance; the rest of the crew and the party's map stay. Players can no longer jump decks themselves.
- **The Station** has each deck as its own place, cut along the bands the art already draws: its own highlight, click area, label and crew chips, and you pick a deck there. Going to one lights only that deck. The Codex keeps one page.
- **A saved game moves over once at boot** (rules 4): tokens on the tower land on the deck they were on, tokens on the Secure floor and Bot bays land at the entrance, and a mood the new art doesn't have becomes Day.
- **Camera cones:** from the playground's coverage, starting at the pole in the art. Deck 8's pole is by the stairs, so its cone looks back from the stairs instead of towards them; it still keeps the catering lift's route clear. The Secure floor's cone is the playground's, from mid-hall, though the art draws cameras on the walls.
- **Not done:** the putting green is an object on deck 9, but mini-golf is still sent from the GM tab. The people layers (Silence, the Bot bays' Day 1 to Session 4) aren't presets yet. The Bot bays' art shows the mech under its tarp in every mood.

**Rules change, 2026-11-04** (the live bible has the details, under The crew and Rules):
- **In the data now:** each character has three skills in one unlabelled list, with what each covers and a downside that happens every time a roll using it fails. Ves carries a stun pistol and Marlo carries stun rings; both roll Reflex and put people down without killing them. Everyone starts with one signature item: Lale's fob watch, Marlo's rings, Tally's notebook, Ves's pistol, Tomo's sourdough starter. The skill icons come from the Icons canvas, board "Skills".
- **Built 2026-11-04** (fa0d7be):
  - health by character: Tomo 9, Tally 7, Lale 5, Marlo 5, Ves 4, with one ring segment per point. A saved game moves over once at boot: whoever was at the old full 6 is full again;
  - Burns, from the Burn animations canvas (https://claude.ai/artifact/C4xxchodAbqihiwNazLQNg): the Burn row under the name, held for half a second, spends 2 Entropy and plays the character's film on the TV. Ves picks between her two cuts. Tally's Recount also sits on his roll screen beside Push. Tomo's row pulses for 5 s after one of the others is hurt, Tally's after a die lands. A film's last frame holds for 0.75 s. With a TV the laptops stay on the game (no black hole, unlike a cutscene); every laptop marks the burner's token and rail ring (BURN, the icon and the name, in the Burn's colour, with a flare ring) until 4 s after the film. Peter applies what a Burn does by hand;
  - a failed skill's downside on the TV: Peter presses Failed on the crew ring (a natural 1 always fails).;
  - enemy cards: the spider mech has 13 health and cracks at 6, and the fixer has 10.
- **Dropped 2026-11-05:** what happens at the target's token after a Burn's film (+3 for On your feet, the pink mark for Cheap shot, Ves going faint). Peter applies a Burn by hand, for example +3 HP, and M8's change animations show it on the chip.

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
- **Still placeholders:** starting inventories in `content/presets/session-1.yaml` (drafted from the bible in M3), for Peter to set.

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

**Also decided for M2:**
- **No difficulty in the app.** Peter says it out loud. The roll screen keeps R6's Easy-to-Heroic ladder as a reference, so the player can judge whether to push. The app never decides pass or fail.
- **Entropy is earned by hand:** Peter adds it with the GM column's Entropy +/−, and nothing awards it automatically. Players spend it themselves with Push.
- **No roll requests.** Players open their own roll screen.

**How M2 turned out** (this wins over the M2 section below):
- **Dice are rolled on the server** (`server/lso/rules.py`, called from `commands.py`). The event records the values, so a replay never re-rolls.
- **Others learn the dice as they land:** the roller's screen gets every die at once to play the animation. It tells the server as each one lands (`roll.reveal`), and only then do other screens get the value.
- **Natural 1:** everyone sees a red 1, whatever the skill bonus.
- **Insults:** they live in `content/insults.yaml`, keyed by stat. The server picks the line when the dice are rolled.
- **RollFX** is in `web/src/roll/rollfx.js`, generated from R6 with two marked changes: the roller's handle in the terminal prompt, and the insult passed in.
- **The parity test** replays R6's original and the port against a canvas that records every draw call. This replaces a pixel diff: identical calls mean identical pixels.
- **GM rolls** come from the GM column's Roll section.
  - The GM picks an NPC on this map, or "Just a die", which is always hidden.
  - The die is d4–d20. A stat picks the look, and there is a Hidden toggle.
  - NPC rolls can't be pushed.
  - A public roll on a hidden NPC is refused.
  - The column lists the last 6 rolls.
- **One roll open per seat.** Starting a new roll closes your last one.
- **A sweeper covers a roller who vanishes mid-roll:**
  - after 45 s, everyone sees the result;
  - a roll is closed once it is 30 s old and its roller has had no socket for 15 s;
  - nothing stays open past 10 minutes.
- **Reloading mid-roll** reopens the roll screen on its result, so the player can still push or close it.
- **A roll keeps going in a background tab.** The roll's clock (`web/src/roll/clock.ts`) runs on wall-clock time. A background tab gets no animation frames, so a timer drives the clock there instead, and the dice land for everyone on time, at most about a second late. Explosion gates still let go after 4 s.
- **Reroll** on the result screen goes back to the picker with the same stat and skill picked. It's for players only; a natural 1 keeps just "Yeah. Okay.".
- **The callout** stays about 4 s after the roller closes their screen, then fades. A screen that connects after a roll ended never shows it.

**How Round 17 turned out** (2026-11-06, page "Round 17" on the UI canvas; this wins over "Decided for M2: the roll callout others see", M2's GM rolls, and the TV's band from Round 12):
- **A roll on anyone else's screen is one big banner** (`web/src/roll/Banner.tsx`): the face, the name, the stat, the die, the skill, and a number box running each stat's motion. It leaves 4 s after the dice land, whenever the roller closes. A push after that pops it back for 3 s. A laptop's map isn't dimmed. The banner sits in the middle of the map between the sheet and the rail, under the turn strip in a fight, and clear of an open card (cards stay on top). It also shows on the Station, Codex and GM tabs, across the top: the boards only draw the Scene, so that's a default to confirm.
- **The chip stays on the token** with the number, or "?" for a sealed roll. The crew rail's ring only spins while the dice fly; it no longer has a chip. As before, the chip lingers about 4 s after the roll closes; the board takes it away at the close, so that's a small difference to confirm.
- **The GM's roll modes** are on the NPC card: Public, Hidden and Secret, or Someone and Secret for an NPC players can't see, and GOD, which arms one roll. Just a die (pinned to the bottom of the GM column) has Public, Hidden and Secret, which stay picked until changed (Peter, 2026-11-06, replacing the board's God with a one-roll Secret). The GM's own laptop always shows a quiet banner with who and the number, tagged, with no flash or shake.
  - **Public:** face, type and number.
  - **Hidden:** face and type; shutters slam over the number box.
  - **Someone:** a silhouette and the type, and only for players on that map.
  - **Secret:** players and the TV get nothing, not even a frame.
  - **God:** the screen goes grey and dark and a die falls on every screen but the GM's, at one moment by the server's clock. A visible NPC shows its name, type and number. An NPC this viewer can't see (hidden, or on another map) is Someone.
  - **Just a die:** Public is the God roll with the die and the number ("THE GM ROLLS D20"). Hidden is the God roll with neither ("THE GM IS ROLLING", "YOU DON'T GET TO KNOW."). Secret is only the GM's.
- **Sealing happens in `views.py`.** A sealed roll's phase is only `roll` or `seal`: no value, count, chain, insult, dice or real die for just a die, so an explosion or a natural 1 can't show. The GM's screen lands those dice all at once at 2.8 s, so timing tells nothing either. Leak tests are in `test_rolls.py`.
- **The TV sees rolls as a player does:** it no longer gets dice early, because the RollFX band is gone (`TvBand.tsx` removed). The banner takes the whole screen, dimmed behind it, and it's the only screen with sound (`web/src/roll/sound.ts`, unlocked by its start click). With the "whoever rolls" camera, the roller's token sits under the banner.
- **Everyone else now gets** the skill's name and a natural 1's insult, which the banner shows.
- **Saved games** still load: the new roll fields default to off.

**Events** (2026-11-08, from the Satisfaction Report canvas, https://claude.ai/artifact/Vkpa2f7xbG1pnwFuscAbHc; the canvas calls them overviews):
- **The GM tab has an Events section:** pick an event and one or more of the crew, and Send. It lists whose screen one is still open on, with Take it back. Sending again starts it fresh.
- **On the player's screen** the map dims and the service droid rises over it, its face a CRT survey; the sheet stays clear. A player on the Station or Codex tab is moved to the Scene. Closing it leaves a "Last report" line on the map for 9 s.
- **Nothing comes back:** the answers and the verdict stay on the player's screen, and the log only records that it was sent and closed. Other players and the TV never hear of it (leak tests in `test_overviews.py`).
- **The survey is content** (`content/overviews.yaml`): its pages, points and endings, scored on the player's screen (`web/src/overview/survey.ts`, tested against the canvas's examples). The droid art and the screen mask came inlined in the canvas's page, so the manifest lists them with no asset id.
- **Mini-golf** (from the Mini-golf canvas, https://claude.ai/artifact/LdXDGzq7yTFWV4s13G5h3y, its "drag to putt" board) is the second event: the green rises over the map instead of the droid. Everything the canvas's proposal marks as added (the sweeper, the turnstile, the cup's pull) and the curve are switches in `content/overviews.yaml`. It's one shot, as the proposal says, so the canvas's "click to play again" closes it instead; the GM sends it again for another go. The game runs on the player's screen (`web/src/overview/golf.ts`, tested), and nothing about the putt comes back.
- **Not built yet:** sending one from an object's card (mini-golf goes on the top executive floor's object once that map is in), probe, and the canvas's later captcha.

**The slots** (2026-11-08, from the Slots canvas, https://claude.ai/artifact/EPiC8wXsHQy7o5to3Rd8kj):
- **Sitting down:** a map object marked `game: slots` has seat pips and PLAY on its card. Four seats, one each. A player has to be on that map and the GM has to have shown the machines. A fifth sees WAIT FOR A SEAT. Anyone who can see the card sees how many seats are taken, never who.
- **Playing:** the map dims and the machine rises; the sheet stays clear. A pull costs 10 credits and never pays. The server picks the reels (`rules.spin_reels`) and the page animates them. About six in ten are near misses.
- **Standing up:** lost nothing, you just get up. Otherwise the first stand opens one shared 4-second window. Whoever stands in it is counted when it closes; SIT BACK DOWN takes you out of it. Payback is lost x 50%, 110%, 200%, then FREE SPIN? (which also loses) or LEAVE. Lost and comfort reset.
- **The flood:** all four at once is lost x 10 each, and the machines go out of service for good, kept across presets. The TV plays the flood board for 8 seconds, each machine showing what it paid; nobody else gets it. Then the machines read OUT OF SERVICE and the card goes dark.
- **The GM** has Out of service / Back in service on the card, and nothing else: what happens at a machine never reaches the GM's feed, only the seat count and the credits changing (leak tests in `test_slots.py`).
- **Tally** has AUDIT on the machine, with the real rates; only whoever is in the file's `audit` list gets them. Numbers and lines are in `content/slots.yaml`.
- **Defaults taken, not on the canvas:** a player with no socket for 2 minutes loses their machine and what they'd lost. Being sent to another map gives the seat up. Sitting doesn't move the token. The flood is silent, since the canvas gives it no sound.
- The stand window closes on the server's sweep, so the sweep now runs every 0.25 s, up from 2 s.

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
  - **GM column:** public or hidden GM rolls for NPCs. There's no difficulty setting; Peter says it out loud.
- **Done when:**
  - Only the roller's laptop shows the scene.
  - A nat 1 cracks red, shows an insult and offers no push.
  - During a hidden GM roll, players receive zero frames (test).
  - The parity test shows 0 pixel diff between the original and the ported RollFX at fixed seeds.
  - The playtest checkpoint follows.
- **Why second:** rolls matter most for the feel at the table, and only you can judge that.

### M3: Pockets and items · S · single short session
- **Goal:** you control every inventory, and clues are handed out as predefined items.
- **Decided 2026-11-04** (replaces the earlier note reader and live note-writing):
  - **Items are predefined** in `content/items.yaml`. Nobody types notes in the app, neither players nor you.
  - **A note is just an item:** a note icon whose text says what it is. An audio log is an item too, whose text is the transcript or a summary of it, whichever holds what matters.
  - **Text only, in a tooltip.** Hovering an item shows its name and text. Images and charts (the eval plots) wait for their Codex pages (M6).
  - **Only you move items.** You give, take and move them from the GM column. Players can't pass items to each other.
  - **Players see only their own pockets** (decision 6). An item's text never reaches anyone but its holder and you.
- **In it:**
  - A `text` field on items, and a multi-line tooltip in R6's style. R6's own tooltip shows only the name on one line.
  - GM controls in the GM column: give an item from the catalogue to a character, take it away, move it to someone else.
  - A NEW pulse on an item until its holder hovers it. Only the holder sees it.
  - **Credits:** my default is a counted amount on the credits item that you change. Say if you'd rather keep fixed items like "140 credits".
  - **Content:** the session-1 starting kit and the clue items. You write them, or I draft them from the bible for you to edit.
- **Done when:**
  - An item handed to Marlo reaches only Marlo and you (socket test).
  - It survives a restart.
  - You approve how the tooltip looks.
- **How M3 is built** (planned 2026-11-04):
  - **Content:** `Item` gains `text` (the tooltip) and `counted` (one entry holding an amount, for credits). A new kind, `audio`, is for audio logs. Preset inventories take `{item: credits, count: 140}` beside plain ids.
  - **State:** each inventory entry holds `uid`, `item`, `count` and `new`.
  - **Events:**
    - `item.given`: you hand over an entry, marked new.
    - `item.taken`.
    - `item.moved`: it keeps its uid and is new for its new holder.
    - `item.counted`: the amount changes, and it's marked new when it goes up.
    - `item.seen`: the holder looked at it.
  - **Your intents:** `gm.item.give`, `gm.item.take`, `gm.item.move` and `gm.item.count`. Giving or moving credits to someone who already holds credits adds to their amount.
  - **The player's intent:** `item.seen`, sent by hovering their own new item for a moment.
  - **Views:**
    - A player gets their own pockets, with text, count and the NEW flag. You get every character's pockets, plus the catalogue for giving.
    - Players never get the catalogue. Item icons are allowlisted through the projection as before.
  - **Sheet:** the items row draws one R6-style panel above the row, spanning its width, with a caret at the hovered item. It holds the name and then the text, so a tooltip is never clipped by the scrolling column. Each item shows a count badge for credits and a pink NEW tag with a pulsing ring until it is seen.
  - **GM column:** a Pockets section. Pick a character, see their items, change an amount, move an item to someone else, take it, or give one from the catalogue. M4 redesigns this.
  - **Tests:**
    - an item given to Marlo reaches only Marlo and you, and Tally gets zero frames;
    - its text never appears in another player's projection;
    - players can't use the GM intents, and can only mark their own items seen;
    - credits merge;
    - it survives a replay.
  - **Also in this round:** a full-screen button in the header, for players and the GM.
  - **Before the playtest:** load the "Session 1" preset once. A world saved before M3 has credits with no amount, so they show 0.
- **Why here:** it is small and backend-heavy. It also gives the GM tab its last missing control before that tab is designed.
- **Dropped (2026-11-04): the Items tab.** The in-depth view, with images, charts and longer text, is the item's Codex page (M6).
- **Decided after M3 (2026-11-04): one inspector for everything you can look at.**
  - **The style:** Round 8's T3 ("Inspector"): the icon at 2×, a kind label, the name, then the text. It may take room, because it only shows while you look.
  - **Where it applies:**
    - items;
    - skills and chrome, which also get tooltips;
    - crew and NPCs;
    - objects in the world, such as the mural.
  - **Codex buttons:** characters, objects, items and maybe skills will have Codex entries. A card shows a Codex button only when there is an entry.
  - **Later:** clicking an item or a skill opens its Codex page, when it has one (M6).
  - **Built (Round 9, approved 2026-11-04):**
    - **Your sheet:** items, skills and chrome open the inspector on hover, to the right of the sheet and over the map, with a caret at the row.
    - **The map and rail:** hovering a token shows only its name, so passing the mouse over a crowded map pops nothing. Clicking a token or a rail portrait opens its card, docked at the map's top right as now.
    - **World objects:** each gets a diamond marker once you reveal it. The marker is pink and pulsing until that player has looked, then quieter. Clicking it opens a card with a close-up of the art.
    - **How:**
      - Objects are listed per map in `content/maps/<id>.yaml` (`objects`: id, name, `at` in X/Y/Z, text, `closeup`, `codex`).
      - A preset reveals them through `shown`; you toggle them with `gm.object.show`. Each player's "looked at" is `object.seen`, kept per character.
      - Players never receive a hidden object (leak test).
    - **Codex button:** `codex` on NPCs, items and objects. The button shows but is disabled until M6 builds the Codex.

### M4: GM tab · M · design fan-out, then a single build session
- **Goal:** designed GM controls, replacing today's plain GM column.
- **Decided 2026-11-04:**
  - **Scene plus a back office.** The live controls stay beside the map on your Scene, redesigned. The GM tab holds what you do between scenes.
  - **No difficulty anywhere,** and no margin-to-damage helper. You say "Heroic Body check" out loud and everyone watches the roll.
  - **No undo.** You fix mistakes by hand.
  - **No group playtest first.** You test alone as we go.
- **In it:**
  - **Design:** 2–3 R6-style variants on the UI canvas first (Round 11); you pick one.
  - **On your Scene, beside the map:**
    - rolls for NPCs, public or hidden, with recent history;
    - the tokens on this map (show, hide, remove) and the roster to place NPCs;
    - things to inspect (show, hide);
    - quick HP and Entropy.
  - **In the GM tab:**
    - **Crew table:** HP, Entropy and every pocket, with give, take, move and drag between characters.
    - **Every map:** its mood and switches.
    - **Presets.**
    - **Session controls:** "New session" sets everyone's Entropy to 2.
    - **View as player:** see exactly what one seat sees, built from that seat's projection.
- **Done when:**
  - you can run the bar scene from your Scene, and set it up from the GM tab;
  - "view as player" never shows a hidden token, object or someone else's pocket (test).
- **Order (planned 2026-11-04):**
  1. **Round 11 on the UI canvas** (boards `R11SceneA`–`C`, `R11Office1`–`2`): three Scene layouts and two GM tabs. Peter's notes on it led to Round 12, below, which he **approved** on 2026-11-04.
  2. **The server, which doesn't wait on the pick** (**built**, tests in `server/tests/test_gm_tab.py`):
     - `gm.session.new` sets every crew member's Entropy to 2, as ordinary `vitals.set` events.
     - **View as player** is a second, read-only socket: `/ws?as=<character>`, accepted only with the GM's cookie. It gets exactly that seat's projection, every intent on it is refused, it doesn't count as that player being online, and drags reach it as they reach the player.
  3. **The web build, from Round 12** (approved 2026-11-04; **built**, see "How M4 turned out" below):
     1. **NPC stats.** Add `stats:` for every NPC in `content/npcs.yaml`, using Round 12's drafts for Peter to set, validated like the crew's.
        - `gm.roll.start` for an NPC takes a stat and uses that NPC's die.
        - "Just a die" still takes a stat and a die, and is always hidden.
        - Add tests.
     2. **The GM's Scene** (boards `R12Scene`, `R12SceneCrew`):
        - **Left column, "In this scene":**
          - one compact list of things to inspect, NPCs and crew, each with show/hide and with × to remove an NPC; clicking a name opens its card;
          - the roster as faces, to add an NPC hidden;
          - "Just a die".
        - **Gone from the Scene:** last rolls, pockets, presets and the old Roll section.
        - **Mood and switches** sit above the map name.
        - **Crew rail:** hover a ring for HP and Entropy steppers.
        - **Cards:**
          - An NPC's card has its six stats as roll buttons, each showing its die, and a Hidden switch that's locked for a hidden NPC. It also has Hide/Show, Remove and your note.
          - A crew card has HP and Entropy steppers, Hide, their pockets and a Give row. **Every item in the Give row shows its name on hover and focus.** Peter couldn't tell items apart on the canvas, because many share an icon.
          - A thing's card has Show/Hide.
        - **NPC rolls** play the full roll animation on your screen. GM rolls already do this.
     3. **The GM tab** (`#gm`, board `R12TabCrew`): a section nav.
        - **Crew and pockets:**
          - HP, Entropy and every pocket;
          - give, with names shown;
          - take;
          - move, by picking up and handing over, plus drag;
          - edit counts;
          - view as player.
        - **Maps:** every map's mood, switches and things to inspect.
        - **Session:** New session and presets.
        - **Cutscenes and The TV** come with the Stage milestone below, but the nav leaves room for them.
     4. **View as player:** opens that seat's screen read-only from `/ws?as=<character>`, under a pink "Viewing as" banner, with a way back.
  4. **Checks:**
     - tests for NPC stats and NPC rolls;
     - the view-as leak tests (already built);
     - a two-seat walk through the bar scene: give Tally the log from her card, hide and show Unit 14, roll for Dax in public and hidden, and press New session.
- **Defaults taken while planning:**
  - The Scene keeps a quick mood switch for the map you're on, because moods change mid-scene (the lights go out). The GM tab has every map.
  - Clicking a crew member opens their card with HP and Entropy steppers and their pockets, so you can hand over a clue mid-scene. The full pocket table moves to the GM tab.
- **Decided after Round 11 (2026-11-04),** once the cutscene plans arrived (`LSO — Cutscenes and Stage`, see CLAUDE.md):
  - **The Scene holds only what's in the scene:** the mood selector above the map name, the characters on the map, and the things to inspect. Cutscenes, items, the TV and setup are in the GM tab.
  - **You run characters from their chips.** Click a chip to open its card, which holds moving, HP, Entropy, hiding and rolling. Hiding, removing and adding NPCs and things stays, in one compact list.
  - **No "last rolls" list.**
  - **Every character has stats.** An NPC rolls by picking a stat, so its die comes from its sheet. "Just a die" picks a stat and a die. NPC rolls play the full animation on your screen.
  - **Cutscenes are set and forget.** You start one from the GM tab, it goes full screen and plays to the end, with no controls while it plays, not even a stop button. Nothing about the TV or cutscenes sits on the Scene.
  - **The TV shows no crew rail.** For a public roll it shows a bigger animation if that can be done tastefully, or else the roll on the chip. Round 12 shows three ways.
- **Round 12 on the UI canvas** (`R12*` boards) draws all of this:
  - Scene with Dax's card, whose six stats are his rolls (NPC dice are drafts for Peter to set);
  - Scene with Tally's card, which has a Give row (Peter wants it, with item names visible);
  - the GM tab's crew, cutscenes and TV sections;
  - the TV three ways: on the chip, a band along the bottom, or a camera cut to the roller with a card.
- **Peter's picks on Round 12 (2026-11-04):**
  - Everything as drawn.
  - The Give row on the crew card, with item names visible.
  - **TV 2 for public rolls:** a band slides up along the bottom with the roller, the stat and the real dice animation, then slides away. The map stays put.
- **Proposed, and Peter hasn't objected:** Stage and cutscenes become their own milestone straight after M4. That covers the TV login and its feed (with leak tests), films starting in sync, laptops going black, cues that set the map behind the film, and the table setting.
- **Moved to M5:** "send the crew to a map", since there is only one map until then.
- **How M4 turned out** (built 2026-11-04; this wins over M2's "GM rolls" notes):
  - **NPC sheets:** every NPC in `content/npcs.yaml` has `stats:`, validated like the crew's. The dice are Round 12's drafts, for Peter to set.
    - `gm.roll.start` for an NPC takes only a stat and rolls the die on its sheet. Sending `sides` with an NPC is refused.
    - "Just a die" is only a die: it has no stat (`stat` is null), and is always hidden.
    - An NPC's dice go to the GM only, in its token view; a leak test checks players never get them.
  - **The GM's Scene** (`web/src/gm/GmScene.tsx`): the "In this scene" list, the roster faces and "Just a die". The mood bar sits above the map's name (`MoodBar.tsx`). Hidden tokens get an eye badge on the map.
    - The roster faces show the NPC's name and role on hover and focus.
    - "Just a die" picks only the die. Its result lands in a box beside its Roll button, in a plain grey look.
  - **GM rolls play on the map, never in a roll screen** (Peter, after the first build). The NPC's chip shows the roll as everyone else sees it, and a hidden roll shows only on the GM's map. The GM's screen lands the dice on a timer, as a roller's screen does (`playOnMap` in `store/game.ts`):
    - the dice spin for 1.8 s, and each die an explosion adds takes 1.3 s more;
    - the roll closes 2.5 s after the last die lands, and its callout then lingers about 4 s and fades;
    - a GM reload mid-roll picks up where it left off.
  - **Cards** (`web/src/map/InspectCard.tsx`): an NPC's six stat rolls with the Hidden switch, and a crew card with steppers, pockets and the Give row.
  - **Item tooltips for the GM:** every item in a crew card and in the GM tab shows Round 9's inspector on hover and focus, exactly as its holder sees it on their sheet (`web/src/inspect/ItemTip.tsx`, which the sheet now uses too). On a card it opens to the card's left. In the Give row, credits show the +50 they'd add.
  - **Crew rail:** hovering a ring shows HP and Entropy steppers. While you're on the rail it sits above an open card, because Round 12 had the steppers open behind the card. In the walk a click meant for a stepper rolled Dax's Reflex.
  - **The GM tab** (`web/src/pages/GmTab.tsx`):
    - Crew and pockets: pick up and hand over, or drag onto a row; type an amount for credits.
    - Maps.
    - Session: New session, and presets behind a confirm.
    - Cutscenes and The TV are in the nav, marked "Stage", with a line saying they come with that milestone.
  - **View as player** is the player's own app in a frame, loaded from `/?as=<seat>` (`web/src/gm/ViewAs.tsx`).
    - It connects to `/ws?as=<seat>`, so the server feeds it exactly that seat's projection.
    - It's read-only on both ends: the server refuses every intent, and the client sends none and opens no roll screen.
    - It has no log-out or full-screen button.
    - Esc or "Back to the GM tab" closes it.
  - **Defaults taken:**
    - A counted item (credits) from the Give row adds 50, as drawn; you change the amount in the GM tab.
    - Removing an NPC from the scene list or its card doesn't ask first.
  - **Checked:** 87 server tests, 22 web tests, and a two-seat walk.
    - Gave Tally the maintenance log from her card: she got it, marked new.
    - Hid and showed Unit 14: it left and came back on her map.
    - Rolled Dax's Cool in public: the full animation on the GM's screen, "rolled Cool: 3" on Tally's chip.
    - Rolled Dax's Body hidden: Tally saw nothing.
    - Moved an item by hand-over and by a drop.
    - Viewed as Tally.
    - Pressed New session: Entropy went to 2 and HP stayed.
- **Why here:** after M1–M3 every GM function exists, so one design pass can lay them all out.

### Stage: the TV and cutscenes · M · next after M4
- **Goal:** the TV at the table shows the map and the public rolls, and you start cutscenes from the GM tab. Sources: the doc "LSO — Cutscenes and Stage" (see CLAUDE.md), and Round 12's boards `R12TabCutscenes`, `R12TabTV` and `R12StageBand`.
- **Already decided:**
  - Cutscenes are set and forget: full screen, played to the end, with no controls at all, not even stop.
  - Each cutscene is one video file with its sound baked in.
    - The shotgun scene's third cut is on its canvas as a video asset (`f5082d83bac9a099d8907e63d85ecc77`), ready to import.
    - The intro and the waiting loop aren't made yet.
  - The TV is a read-only "Stage" seat. It shows the full-screen map and only what everyone may see, with no crew rail and no meter (the meter is cut).
  - Public rolls show on the TV as TV 2: a band along the bottom with the roller, the stat and the real dice animation.
  - The GM tab gets the Cutscenes section (the cue list, with a two-step Play) and The TV section: where you're playing, and the camera, which fits the crew, follows one player, or cuts to whoever rolls.
  - A cue also sets the map, mood and tokens behind the film. The shotgun ends on the bar after hours, with Dax at the gap in the rail.
- **Proposed build:**
  - the Stage socket and its projection, with leak tests (it's a player-like view with no seat);
  - the TV page;
  - films starting at one shared moment on the screens that play them;
  - the table setting;
  - the TV option on the login screen;
  - what the laptops show during a film;
  - the GM tab's two sections.
- **Peter's answers (2026-11-04):**
  1. **Stage comes first,** then M5.
  2. **The TV logs in from the login screen,** with a TV option beside the crew. Peter drags that browser tab onto the TV as a second screen and goes full screen.
     - Default taken at first: the TV option asked for the GM passcode, because the TV fetches films ahead of their cues. **Peter overruled it after trying it (2026-11-04): no passcode.** The TV is picked like a seat. The cost: a player who picks the TV could find the films in their browser.
  3. **Laptops during a film at the table aren't pure black.** They show something a player glances at, thinks "cool", and looks away from: Peter's idea is the spinning black hole.
     - My proposal: small and dim in the middle of the black, turning slowly, drawn by the app in pixels; a faint "LOOK UP" could fade in once and go.
     - Draw it on the UI canvas first, with a variant or two, before building it.
     - **Round 13 on the UI canvas** (page "Round 13", boards `R13FilmDisc`, `R13FilmRing` and `R13FilmDust`) draws three looks. Each is a 1440×900 laptop, black, with faint twinkling stars, a hole about 55–60 px across in the middle, and "LOOK UP" fading in once after 1.5 s and out by 8.5 s. Each board has two tweaks: LOOK UP on or off, and the pixel size (2–5 px, default 3).
       - **A · Disc:** a lit disc seen almost edge-on. Its far half bends up over the top of the shadow, with a faint image tucked under it. It's pink on the side turning away and cyan on the side turning toward you, the poster's two colours. Inner grains go round in about 16 s, outer ones in about a minute.
       - **B · Ring:** the logo's black hole, larger and in pixels: the shadow's rim, a hairline ring tilted as in the logo, and the pink satellite going round once every 28 s, passing behind the hole.
       - **C · Dust:** faint lilac grains spiral in over about a minute, warming through pink to white, and go out at the edge. It echoes ISCO's public "Swarm" face (particles round a black hole).
       - Drawn the way the app will draw it: a low-resolution canvas scaled up with crisp pixels, at 30 frames a second, and a still frame for anyone who has reduced motion on.
       - **Peter's pick (2026-11-04): C's falling dust, in A's colours (pink on the side turning away, cyan on the side turning toward you, brighter there), at 5 px pixels, with no text on screen at all.** The `R13FilmDust` board is updated to that; A and B stay as drawn.
  4. **Sound:** only the films' own baked-in sound in this milestone. The soundboard, per-map ambience and roll sounds come later.
- **Changed 2026-11-06: the TV is always there** (Peter; this wins over the setups and the "table setting" below):
  - The TV / no TV / Online choice is gone. Cutscenes, Burns, a failed skill's downside and all the sound are on the TV. Laptops are silent. A player's laptop shows the opening's waiting loop during a cutscene (since 2026-11-09; it was Round 13's dust), and stays on the game during a Burn.
  - Only the TV gets film files, Burn films included. Laptops don't load them ahead any more, and a player's fetch of one is a 404.
  - **With no TV connected:** the GM's Play is greyed out with a line saying why, because otherwise a film would run with nobody seeing it. That's a client check on `stage.tv`. It can't tell a TV that hasn't had its start click, where a film plays muted behind the start screen. A Burn is never refused: its Entropy is spent, the mark shows, and no film plays.
  - **If the TV dies:** any spare laptop can pick "This screen is the TV".
  - **Online is gone** too, though the Cutscenes doc still says one session may be online. It was never tested, and http://parker.local only works on the wifi. For an online session, screen-share a window logged in as the TV, with sound, on the call. It would also need hosting people can reach from outside.
  - A saved game drops its old `setup` at boot (`engine.py`), and an old log's `stage.setup_set` does nothing.
- **How Stage turned out** (built 2026-11-04; this wins over the proposals above):
  - **The TV is the Stage seat.** On the login screen, "This screen is the TV" logs in as `stage` with one click, no passcode (Peter's call). Its screen (`web/src/stage/Tv.tsx`) has no header and no rail. It needs one click to start, which goes full screen and lets films play their sound. The mouse is hidden on it.
    - Logging out: the start screen has "Not the TV? Log out". Once started, moving the mouse shows the cursor and "Log out of the TV" in the top right for 3 s (Peter couldn't get out of it at first).
    - Its socket refuses every intent (`read_only`), like view as player.
    - Its feed is a player's with no seat: the party map, its visible tokens and revealed objects, the crew's public sheets, no pockets. It gets each public roll's dice as the roll starts, as the roller's screen does, to play the same animation. It gets every film's file, to have them ready. Never hidden tokens or rolls, NPC dice, notes, the roster or the cue list. Leak tests in `server/tests/test_stage.py`.
    - The GM tab knows when it's connected.
  - **TV 2, the band** (`TvBand.tsx`): a public roll slides up along the bottom with the roller's ring, name, stat and die, and plays the real roll animation in step with the roller's screen. At an explosion it waits until the roller's screen rolls again; if the roller skips, it skips. It stays 3.8 s after the dice settle, then slides away. Rolls under way when the TV connects don't get one.
  - **The camera** (GM tab, The TV): Whole crew frames every crew member on the map; Follow one centres on one of them; Whoever rolls frames the crew and moves to whoever rolls, above the band, until the band leaves. Moves glide over 0.9 s. (2026-11-09: the shot of one person is 480 world px tall on any screen, about 2.25x on a 1080p TV, and the GM's Scene tab has a TV camera bar: the same three shots, a face per crew member, and zoom and pan steps on top of the shot. Picking a new shot centres it; the next person in Follow keeps the zoom; the cut to a roller ignores the zoom and pan.)
  - **Cutscenes** are in `content/cutscenes.yaml`, in the order you'll use them. A cue with no file shows as "NOT MADE YET". Each made cue has its file, its length, the GM's still, and `sets`: what it sets behind the film (the party's map, mood, switches, NPCs placed). The shotgun sets the bar after hours with Dax at [11.6, 1.05, 0], his after-hours spot. That position is a draft for "the gap in the rail".
    - `gm.film.play` starts a film 1.5 s after the press (the TV has the file already). It can't be stopped, and while it plays the setup and camera don't change either. The server ends it on time and marks the cue played.
    - The film itself is `assets/films/shotgun.mp4` (35.8 s, 1920×1080, sound baked in), from the shotgun canvas.
    - **Added 2026-11-08:** the intro (3:32, 960×540), The vault opens (33 s), The ride down (32 s) and Thank you for bringing that (36.7 s), each the approved cut from its canvas, with a storyboard frame as the GM's still. The cue list is in campaign order. A cue leaves the crew where they are, so after a film that changes map the GM presses "Send the crew here" on the Scene; it works while the film plays.
  - **In sync:** every frame and pong carries the server's clock, and each screen keeps its offset from the shortest round trip (`web/src/net/clock.ts`). A screen starts the film at the server moment; one that's late jumps to where everyone is, and one that drifts more than 0.3 s jumps back.
  - **Which screens play it, and who may fetch it:**
    - Only the TV plays it, with all the sound. Players' laptops show the opening's waiting loop, silent, until it ends (Round 13's dust until 2026-11-09); they never get the file or the film's name. The GM's laptop keeps working, and the cue list shows its progress.
    - The GM's still is a spoiler, so only the GM gets it.
  - **The GM tab:** Cutscenes is the cue list, grouped by act (each cue's `act` in `content/cutscenes.yaml`), with a two-step Play and progress while it plays. Which cues have played isn't tracked (dropped 2026-11-09). The TV has the status, the camera with faces for Follow one, and "On the TV now", the TV's own screen small and silent (`/?as=stage`).
  - **Loading a preset keeps the table setting:** where you're playing and the camera.
  - **Not built:** a stop button (Peter's call); and the soundboard, ambience and roll sounds (later).
  - **Checked:** 104 server tests (17 new) and 22 web tests. Walked through on a separate test server with the GM, the TV and Tally:
    - the TV's login and start click;
    - the camera following Ves;
    - Dax's public Cool roll in the band, with the camera cutting to him and back;
    - the shotgun: the film on the TV, the black hole on Tally's laptop, progress in the GM tab, then the bar after hours everywhere and PLAYED;

### M5: The other 10 maps · M · best ultracode fan-out
- **Goal:** every map from the Maps canvas, driven by data.
- **In it:**
  - **Shared features first:**
    - SVG camera cones;
    - Executive deck support, with `oy = 150 + (9 − deck) × 450`, where the deck jump keeps X,Y;
    - point-of-interest pins that only you see;
    - inspectable objects for each new map (built for The Event Horizon after M3: the mural, the slot machines).
    - "send the crew to a map" for you (moved from M4).
  - **Per-map files:** one `content/maps/<id>.yaml` per map, with assets deduplicated by sha256.
  - **Order:** Patience and Promenade CALM (session 1), Executive decks (session 2), then the rest.
- **Done when:** a screenshot of each map in each mood matches its board, and a token placed on a key point lands on it.
- **Why here:** it depends only on M1's map schema. It can run in parallel with M3–M4.
- **Why next, over M6 (2026-11-04):** session 1 can't be played without Patience and the Promenade, the intro film ends on the Patience map, and the map boards are approved. M6's Station still needs its design session, and the Codex needs content Peter writes.
- **Before M5, open questions** (each with the default I'd take):
  1. **Order:** session 1's maps first (Patience, the Promenade in Calm and Hunted), checked by Peter, then the other eight? Default: yes. Should the eight run as a multi-agent workflow (faster, more tokens)? That's Peter's call.
  2. **Camera cones:** do players see them? Default: yes. They're drawn on the walls, avoiding them is the play, and Hunted widens them.
  3. **Things to inspect on each new map:** drafted from the Key boards and the bible, for Peter to edit, like the item texts. Hidden until he reveals each one, as in the bar.
  4. **Pins only the GM sees:** each map's "what's where" from its Key board, as small labels on the GM's map.
  5. **Send the crew to a map:** the crew land in a small cluster at that map's entrance (from its Key board), and it becomes the party's map. The TV shows the party's map; on "Follow one" it follows that player to whatever map they're on.
  - Not a question: once Patience exists, the intro cue sets Patience behind its film. Before building, re-read the live Maps canvas in case it's newer than `design/reference/maps/`.
- **How M5 is going** (2026-11-04; this wins over the bullets above):
  - **Peter's answers:** the defaults, all five. Session 1's maps first, for Peter to check. No multi-agent workflow was asked for, so none ran.
  - **The live Maps canvas** was newer in two boards: the small-map key, and the Terminal room, which now has three moods (empty, ISCO, Seal in). Both are copied into `design/reference/maps/`. Promenade, Patience and their keys were unchanged.
  - **Built, shared by every map:**
    - **Camera cones,** from each board's `cone()`: a map's `cameras` lists each cone per mood, clipped at the walls. They show for everyone (the TV too) while the map's Cameras switch is on. The presets turn it on.
    - **Decals:** small art set into a map, placed by the board's CSS matrix. The first is the black hole moving in the Promenade's window (the board's 360 px GIF; it isn't a second mural).
    - **The glow's flicker** follows each board: the bar's 7 s loop, the street's 9 s loop, none on Patience.
    - **GM-only pins:** every Key board point, as a small numbered disc on the GM's map, with its label on hover. "What's where" in the mood bar hides them (remembered on that browser). Players and the TV never get them (leak test).
    - **Send the crew:** "Send the crew here" in the GM column and in the GM tab's Maps. It asks twice, then the whole crew lands on the map's `arrive` spots (just inside its entrance, checked against the art), and it becomes the party's map. Hidden crew stay hidden.
    - **The TV on "Follow one"** shows whatever map that player is on.
    - **A saved game gains new maps at boot,** as a logged `map.added` event, with the default preset's settings for that map. Peter's live game needs no reset.
    - **Story order:** maps carry `order`, so the GM's lists run Patience, the Promenade, the bar.
    - **One mood:** a map with a single mood shows no mood buttons.
  - **Patience:** one mood (Docked), 7 pins, 2 things to inspect (the portholes, the steward's desk), and the steward.
  - **The Promenade:** Calm and Hunted, six cameras, 20 pins, 6 things to inspect (the 11:00 board, the mural of Ilija, the window, the founder's ring, the side alley, 99.97%). New NPCs: the Dock 7 clerk, the Concierge, a security guard (company blue), a Night Market vendor, a Med Bay nurse and a cleaner bot (Unit 14's portrait).
  - **The bar** got its Key board's 23 pins and its arrive spots inside the street door.
  - **New preset, "Session 1: arrival on the Patience":** the crew aboard, the steward, the Promenade's people in place, the bar waiting as in "the pitch at the bar", and the same pockets. `session-1` stays the default for an empty database. The intro cue now sets Patience behind its film.
  - **Drafts for Peter:** the new things-to-inspect texts, the new NPCs' cards and dice, the pin labels, and every position.
  - **Not done:** Moving a single crew member to another map (only the whole crew moves).
  - **Part 2, the other eight (2026-11-04),** after Peter said "Yes, the other eight":
    - **Built here, one at a time** (no workflow was asked for): the Executive floors, the Secure floor, the Lift station, the founder's vault, the Bot bays, the crawler cab, the Terminal room and the Med Bay. Every board, key and its art came from the live Maps canvas; the art is 31 map layers (two Terminal glows were byte-identical, so they share one file).
    - **The Executive floors are a tower.** The board's `oy = 150 + (9 − deck) × 450` is height here: each deck is 12.5 Z above the one below (450 / 36), so deck 6's floor is Z 0 and deck 9's is Z 37.5, with origin (360, 1500). A test checks this matches the board's formula on every deck. Positions stay world X, Y, Z.
      - **Deck buttons** on the map (Deck 9 to Deck 6, and All) bring one deck into view. A tower opens on the deck your own token is on.
      - **The deck jump** is on a token's card, for whoever may move it (the GM, or that player): it's an ordinary move that changes only Z, and the camera follows.
    - **Cameras:** the company's are steel blue, drawn per deck on the Executive floors, with each cone's own walls on the Secure floor and the Lift station. The presets turn them on.
    - **Alert pulses:** the Executive's and Secure floor's Alert glows pulse, as on their boards. No new map flickers otherwise.
    - **The Terminal room:** Many Faces is a decal over the glow, faint in ISCO and full with the Seal in, fading in over 2.4 s. The station feed is on its wall screen, driven by two level switches in the mood bar: "Minutes down here" (0–30; up top is ×3.2) and "Station feed" (the five events, in the bible's order).
    - **The Lift station's blast door** is the mood (Door shut, Door open), as the board draws it, rather than a switch.
    - **The spider mech** is a double-size token (`size: 2` on the NPC), on the map and on the TV.
    - **New NPCs (drafts):** the scientist, the spider mech (its enemy card in its GM note), and the old man with the steward's portrait as a stand-in (the board's own stand-in; there's no art for him). The security guard's GM note gained its enemy card.
    - **Arrival spots,** checked against the art: deck 6 out of the lift, inside the Secure floor's door from deck 8, the Lift station's old wood passage, the vault's rug inside the bronze door, the foot of the ladder from Dax's hatch in the Bot bays, the cab's seats, the glass by the Terminal room's crawler door, and one to a bed in the Med Bay.
    - **Peter's follow-ups (2026-11-04):**
      - **A clear camera button:** each camera map's Cameras switch is now its own button, "Hide camera cones" / "Show camera cones" with an eye, in the mood bar and in the GM tab. It hides every cone for everyone (Peter picked this over switching off one camera at a time, or hiding them on his screen only).
      - **The GM tab's Maps show the state:** the cards fill the width (two or three across) and each has a live miniature: the current mood, its switches (gas, the hatch, the feed), decals, cones while shown, and everyone on it, hidden ones faint. Click it to open that map on the Scene. Under it: who's there (hidden ones marked), its cameras and whether their cones show, its mood and switches, and its things to inspect.
    - **Not done:** art for the old man, reviewers, managers and executives (the boards used other portraits as stand-ins); presets for sessions 2 to 5; a single crew member sent to another map. The Executive floors' deck buttons sit under a card on a narrow window.

### M6: Station and Codex tabs · M · the Codex is designed; the Station still needs its design session
- **Goal:** the two remaining tabs, with no spoilers.
- **Decided 2026-11-04:**
  - **No Crew tab.** Crew pages live in the Codex. It comes back only if we add crew-to-crew interaction.
  - **No Items tab.** Items get Codex pages (some of them, not all).
  - **No private briefs in the app.** Peter hands them over with the character, so nothing here stores or sends them.
- **Codex design (approved):** UI canvas (https://claude.ai/artifact/6qy97FyBbNdFJafigwiKff), page "Codex, pinned", boards `Cdx3*`. The boards are generated by `ui/codex_cards_build.py` and `ui/codex_cards_data.js` in the claude.ai Project.
  - **Landing:** five full-width rows that fill the screen height: Characters, Items, Places and objects, Lore, How to play. Art on the left 40%, ending in a hard diagonal slash. Title centred in Jost; every other title in the Codex is Michroma. Each row shows its entry count and how many are new.
  - **Section page:** an art strip with links to the other sections, then a plain grid of playing cards (5:7), 3 per row, no groups. The name sits on the art, across the slash, with a hard black pixel shadow (board `Cdx3On`, not `Cdx3Band`).
  - **Content page:** the whole sprite pinned on the left, at the largest whole-number zoom that fits and leaves room for its strip. Crew show their stats in the strip, NPCs their mood. Beside it are a big centred name and two scrolling columns: text, skills and gallery in the main one, "At a glance" and "See also" in the other. Previous and next links run along the top.
  - **Hover:** the art brightens and the slash moves out, with pink corner marks and one pink sweep.
- **Who sees what:**
  - **You unlock entries for the whole crew.** A locked entry stays hidden, with no redacted row and no count.
  - **You can unlock blocks inside a page,** so a page grows (Ilija: the saint, then the man, then the truth; ISCO's name meaning comes late).
  - **"New" is per player:** entries and blocks stay marked until that player has read them, the same way as `object.seen`.
  - **A page never lists what a character is carrying,** because players don't know each other's items. Crew stats and skills are public.
- **Sections and content:**
  - **Glossary:** terms are short Lore entries, not a section of their own.
  - **How to play:** from the Rules board, with Humanity and the meter removed.
  - **Content is YAML in `content/`.** Text on the boards is draft. Ves's intro, history, "how she works" and "Job" are placeholders, not canon.
  - **Links from the Scene:** the Codex button goes to the entry, and only shows when that entry is unlocked. So `views.py` must not send a locked entry's id. Crew get entries too (they send `codex: None` today). The mural gets its own entry linking to the founder, instead of `codex: the-founder`.
  - **Art still needed:** Items cards, starting with a separate icon for each note, since all of them share one today. Most other cards can use existing art.
- **Station:** the Ergo art with place hotspots, after its design session.
- **Done when:** locked entries and blocks never reach a player (test), other players' inventories never appear in a page (test), and you sign off on both tabs.
- **Why here:** you need to have felt the core first. The content comes from the bible.
- **Before M6, open questions** (2026-11-04, each with the default I'd take):
  1. **Order:** the Codex first, built from the approved `Cdx3*` boards, then a design round for the Station on the UI canvas, then the Station. Default: yes.
  2. **The other session.** The session that did the crew rework (2224ab2) owns removing the Crew tab, and has "still to build" rules items (health by character, Burns, the failed skill's downside on the TV, new enemy numbers). Default: this session builds the Codex and removes the Crew tab as part of it, and the rules items stay with that session (or M8). Peter to confirm the other session isn't building the Codex too.
  3. **Codex texts:** drafted from the live Campaign Bible for every entry (crew, NPCs, items, places, lore, How to play), for Peter to edit, like the item texts. Ves's placeholders stay placeholders. Default: yes.
  4. **Unlocked at the start of session 1:** the five crew pages, How to play, and the places the crew start in or reach on day one (Patience, the Promenade, the bar). Everything else locked until Peter unlocks it. Default: yes.
  5. **Item art:** cards for items with no art of their own (each note shares one icon today) use a plain text card for now; separate note icons get drawn later on the Icons canvas. Default: yes.
  6. **Station, decided in its design round:** can players open places they haven't visited? Default: the cross-section shows all 11 places, but only ones the crew have been to (or Peter reveals) open.
  - **Not a question:** the Campaign Bible lives only at https://claude.ai/artifact/M1yC81nP1if8VLKYnviCHp. Read it with the Docs tools before writing Codex text, and never copy it back into the repo (the old local copy was deleted on 2026-11-08). The mech's and fixer's GM notes were corrected to 13 and 10 health on 2026-11-04.
  - **Game day decides M7's place:** if session 1 is soon, or players should read the Codex at home first, move M7 (hosting on Railway, backups, the layout checks) ahead of the Station.
- **How M6 is going** (2026-11-04):
  - **Peter said go** with the defaults above, plus the rules change, and pointed at the new Burn canvas.
  - **The Codex** follows the Cdx3 boards: the landing's five rows, a section's cards with the name on the art, and a page with the sprite pinned beside two columns. Its texts are drafted from the live bible, not the boards, because the boards' crew pages and the Rules canvas predate the crew rework. All 53 entries are in `content/codex.yaml`.
  - **Who sees what:** players get only unlocked entries and blocks (`views.py`, tests in `test_codex.py`). See also and the Scene's Codex buttons skip locked pages. The TV gets no Codex. "New" is per player and clears when they open the page.
  - **Peter's controls:** the GM tab's Codex section (a switch per page and per locked block), and the same switches on each page when he opens it in the Codex tab, where locked pages show dimmed.
  - **Unlocked at the start of session 1:** the crew, How to play, Patience, the Promenade and the bar, plus four things everyone on Ergo knows (Ergo, ISCO, the black hole, the booking queue). The bar-after-hours preset adds who and what they meet at the bar.
  - **Still with Peter:** every Codex text, the card crops of the maps, the old man's stand-in art, and separate note icons (the notes share one icon today).
  - **The Station** follows the UI canvas's page "Station" (boards Station and StationGM): Ergo cut open, with all 11 places. A place is lit once the crew has been sent there (or a cue takes the party there), or Peter shows it; a dark one shows its text with "The crew hasn't been here", sends no art or map preview, and the core keeps its name. Players see where the crew stands, only on lit places and never a hidden token. Clicking a lit place shows a player its map as a picture, and their token stays put. Peter's click picks a place; its panel opens it on the Scene, or shows or hides it. Places and texts are in `content/station.yaml`; tests in `test_station.py`. Presets light where the crew has been (session 1: the Patience, the Promenade and the bar; the arrival: the Patience).

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
- **Why here:** it is the last gate before session 1. Move Railway earlier if players should read the Codex at home first.

### M8: Fights · M · design first (Round 14 done, Round 15 next), then a single session
- **Goal:** Peter runs a fight with the controls he already has, everyone sees whose turn it is, and the table sees every change happen.
- **Decided 2026-11-05 (Peter). This replaces the earlier M8:**
  - **The app never knows the number to beat or who attacks whom.** There is no damage by margin and no attack roll against a target. Peter names the check out loud ("that's a Very hard Reflex check") and the table plays it out. Enemy rolls stay as they are: the GM rolls the NPC's stat.
  - **It does know who's in a fight, and in what order.** Peter picks who's in it (crew and NPC tokens), and the app rolls everyone's Reflex at once for the turn order, highest first. Peter triggers that roll; nobody rolls it themselves. There's no alternating between the crew and enemies: the order is just the rolls. **This changes the bible**, which still says "no initiative" under Rules; Peter to update the live doc.
  - **Peter applies every result by hand** with the HP and Entropy steppers, as he already does. On your feet's +3 is him raising the number; damage landing on Tomo (Not them) is him lowering it.
  - **Players spend Entropy and Burn whenever they want.** Nothing is locked to a fight, so there's no "once per fight". If someone spends by mistake, Peter refunds it.
  - **The other Entropy spends** (I know a guy 2, Last stand 3, and Team-up if it costs any): Peter leans towards the GM taking them off with the Entropy stepper, with no player buttons. Push and the Burn row keep their player buttons.
- **Peter's picks on Round 14 (2026-11-05):**
  - **Changes on the chip:** "all of those are good", leaning towards **C** (`R14ChipReact`: the chip reacts). Default: build C.
  - **Turn order:** the strip along the top (`R14SpotC`), but **no spotlight and no white ring around anyone**, neither the pool nor the rim.
  - **Enemy health:** everyone in a fight shows their HP ring. An NPC's segments are in its own colour, which is its faction's: the company blue, ISCO's bots white, the fixer's people red. Outside a fight NPCs keep their plain ring. This replaces the per-NPC switch on `R14Enemies`.
- **In it** (as Round 16 draws it):
  1. **A fight belongs to a map.** There can be one on each map at once, for a split party.
     - **Start a fight** sits beside the map's moods on your Scene, because a fight is a state of that map like its moods.
     - It opens a dialog listing everyone on that map: the crew standing there, and every NPC token there. Hidden NPCs are marked and get shown when the fight starts. No dice are shown: they get rolled regardless.
     - The crew there start ticked and NPCs unticked. Roll for initiative rolls everyone's Reflex on the server (`rules.py`, from `commands.py`), and the order is the totals, highest first.
     - During the fight that spot reads "Fight · round 2 | End fight". Next turn sits just left of the strip.
     - An NPC's health stepper is on its card; the crew's are on the rail as now. Adding or removing someone mid-fight: tick them in a reopened dialog, and they roll and slot in.
  2. **The turn strip** along the top of the map, the looping kind from `R14SpotC`:
     - whoever's turn it is sits in the middle, larger, with NOW over them and a short bar under them, and NEXT over the next one;
     - the rest fade out to either side: past turns left, coming turns right, with a small R2 mark where the next round starts;
     - each fighter's Reflex number shows as their dice land, then fades once the strip sorts: after that only the order matters;
     - no white ring or glow around anyone, on the strip or the map.
  3. **Who sees which fight.** A player sees the fight on the map they're looking at, which is the map their token is on. Ves alone on the Promenade sees only her fight there. You see the fight on the map open on your Scene, and your map list marks every map with a fight on ("Fight · round 2").
  4. **The TV lists who's in each fight, and nothing about whose turn it is.** There's one row per fight on any map, under the map's name at the top-left: the map's name, then its fighters in turn order with their HP rings. A row goes when its fight ends. There's no strip, NOW or NEXT on the TV.
  5. **HP rings for everyone in the fight**, NPCs in their faction's colour. **One slice per point of health, always filling the whole ring, with the same clean breaks as the crew's segments**: 1 health is the whole ring with one break at the top, 2 are halves, 3 are thirds (`R16Slices`). There's no tapering or faint line, which looked like the old continuous bar. 1 health will be common: the bible's mook and security guard have 1, and guards come in groups of 3 to 5. Enemies need a health in `content/npcs.yaml`: today it's only in the GM notes (guard 1, hired gun 4, spider mech 13 that cracks at 6, the fixer 10). Bots and bystanders have placeholders in Round 16.
  6. **Change animations on the chips** (look C) for every GM change:
     - HP lost or healed;
     - Entropy gained or spent;
     - an item received or taken;
     - credits gained or lost;
     - going down at 0, and an enemy's ring losing or regaining HP.
- **Round 14 on the UI canvas** (page "Round 14", drawn 2026-11-05):
  - **Changes on the chip,** three looks. Each board plays the same ten changes in the crew rail and on the map, on a loop:
    - `R14ChipRing` (A): the ring itself tells it. Lost segments flash and break off, new ones light up, and a number floats away. An item drops into the portrait, or rises out of it struck through;
    - `R14ChipCallout` (B): a callout beside the ring in the roll callout's language (HIT −1, HEALED +3, ENTROPY +1, GOT and the item, CREDITS +50, DOWN), fading after about 3 s;
    - `R14ChipReact` (C, **picked**): the chip reacts. A hit shakes it with a red flash (and a crack for 3), a heal or a spend sends out a wave, Entropy orbits in, and an item lands on it as a badge.
  - **Enemy rings** (`R14Enemies`): the faction ring outside a fight; switched on, one segment per health in the faction colour. Hits take segments off; the guard goes down; the spider mech's notch at 6, which only the GM sees, and its shell cracking at 6.
  - **Whose turn it is:** `R14SpotA` (a pool of light, everyone else dims), `R14SpotB` (plus who has had a go this round) and `R14SpotC` (a turn strip along the top, **picked** without the white rim).
- **Round 15 on the UI canvas** (page "Round 15", drawn 2026-11-05, waiting on Peter):
  - `R15FightGM` works:
    - in your column on the Scene you tick who's in the fight (the crew start ticked) and press Roll for initiative;
    - Reflex dice spin in each slot of the strip, land one by one, and the strip sorts itself;
    - Next sits at the strip's end, and an HP stepper sits beside each fighter in your column, with look C on every hit;
    - ticking someone mid-fight rolls them in; End fight puts the NPCs' plain rings back.
  - `R15FightTable` plays a whole fight on Ves's screen, on a loop: the hired gun hits Tomo, Tomo floors the guard, and Next skips the guard in round 2.
  - NPC rings fill in with HP segments in their faction colour as they join; a 1-health ring has a clear gap at the top, so it doesn't read as the plain ring.
- **Peter's notes on Round 15 (2026-11-05):**
  - He prefers the looping strip, with the current one in the middle and the rest fading.
  - The guard's 1-health ring still read as a continuous bar, not slices.
  - It wasn't clear where the picker lives or who it can list. It should be on the map screen, not the GM tab, so it lists who's actually there, and so there can be fights on several maps at once. The initiative should be a separate popup listing who can fight.
  - Open: what the TV shows, and how it handles several fights.
  - "I do not feel comfortable building yet because a lot is undefined." Designs must be grounded in the real UI.
- **Round 16 on the UI canvas** (page "Round 16", drawn 2026-11-05). Every board's base is a 1440×900 screenshot of the real app, from a test game on :8071 (session 1, with two hired guns at the founder's table, a hidden guard by the door, and Ves alone on the Promenade with a guard). The fight is drawn over the screenshot exactly where it would go, with the HP rings laid over the fighters' real heads:
  - `R16GmFight` (working): your Scene at the Event Horizon. Start a fight beside the moods, then the dialog, the roll, Next turn, and the hired gun's card with Health. A tweak opens it straight on the dialog or the fight;
  - `R16TomoFight` and `R16TvFight`: the same fight on a loop, on Tomo's laptop and on the TV;
  - `R16GmTwoFights` and `R16VesFight`: the Promenade fight, as you see it (your map list marks both fights) and as Ves sees it;
  - `R16Slices`: the health rings, from the guard's 1 to the mech's 13, beside the crew.
- **Peter's notes on Round 16 (2026-11-05), applied to the boards:**
  - No initiative numbers once the order is set.
  - No dice in the Start a fight dialog.
  - The TV shows who's in each fight, a row per fight, not whose turn it is.
  - HP slices always fill the whole ring with clean breaks, even at 1.
- **Defaults to confirm (drawn in Round 16):**
  - **Ties:** the bigger Reflex die goes first, then the crew before NPCs; Peter can drag to fix it.
  - **Down at 0:** the slot greys out and Next skips it, but it stays in the strip (Lale's Burn can get them up).
  - **A hidden NPC** can be ticked, and is shown to everyone when the fight starts, so the strip never shows a slot for something players can't see.
  - **Ves's Burn:** when she's in a fight, her row could pick the In a fight cut by itself.
- **Still open:** Team-up: whether it needs anything in the app, or the players just add their totals out loud.
- **Build plan** (Peter said "plan the build" on 2026-11-05, after Round 16). This is one session in the usual order: content and server with tests first, then the web build, then a check on :8071.
  1. **Content and models.**
     - `Npc.health` (1 to 20) for every NPC in `content/npcs.yaml`. From the bible: guard 1, hired gun 4, spider mech 13, the fixer 10. Drafts for Peter: 2 for the bots and droids, 2 to 3 for bystanders.
     - `TokenState.hp`: an NPC's health left, or None while it's full. It stays after a fight, so a hurt guard stays hurt.
     - `Fight` holds `map`, `order` (token ids, first to last), `ini` (each fighter's Reflex total), `turn`, `round` and `started` (server time, so the dice land at the same moment on every screen).
     - `GameState.fights` maps a map id to its fight, one per map.
     - The new fields have defaults, so old saves load as they are, with no rules bump.
  2. **Server** (`commands.py` → events → `state.apply`, as always):
     - `gm.fight.start {map, tokens}`:
       - every token must be on that map; at least two of them;
       - a hidden one is shown;
       - each fighter's Reflex is rolled with `rules.roll_dice` (explosions included): the crew's die from their sheet, an NPC's from its stats;
       - the order is highest total first, ties to the bigger die, then the crew, then the token id;
       - it emits `fight.started`.
     - `gm.fight.next {map}`: the next fighter who isn't down (crew HP 0, or an NPC's 0), wrapping into the next round.
     - `gm.fight.add {map, token}` rolls them and slots them in, and whoever's turn it is keeps it. `gm.fight.remove {map, token}`. `gm.fight.end {map}`.
     - `gm.npc.hp {token, hp}`, clamped to 0 up to the NPC's health.
     - In `state.apply`: a fighter whose token is removed, or ends up on another map (Send the crew here), drops out of that fight.
     - Not in this build: dragging the order. Ties follow the rule above, and Peter can end the fight and roll again. Add dragging only if the tie rule isn't enough at the table.
  3. **Views** (`views.project()`, the only way out):
     - A new `fights` entry. Each fight has its map and name, `round`, `turn`, `started`, and its fighters in order with `token`, `kind`, name, portrait, colour, `hp` and `health`, and `ini`. An NPC's health is sent only here, only while it's in a fight. Its stats and GM note never are.
     - The GM gets every fight. A player gets only the fight on the map they're looking at. The TV gets every fight, one row each, without `turn` or `ini`.
     - A hidden token never appears in a player's or the TV's fight (if the GM hides a fighter mid-fight, it drops out of their view).
  4. **Server tests** (`server/tests/test_fights.py`, with the scripted dice from `test_burns.py`):
     - the order and the tie rule, table-driven;
     - hidden fighters are shown at the start, and tokens from another map are refused;
     - only the GM can run any of it;
     - Next skips whoever is down and wraps the round;
     - adding mid-fight keeps the turn; removing, ending, and a token leaving the map;
     - two fights on two maps at once;
     - NPC health is clamped, and kept after the fight;
     - an old save loads.
     - **Leak tests:**
       - a player never gets another map's fight;
       - the TV gets no turn or initiative;
       - no NPC stats or GM note in any fight view;
       - no hidden token in a player's or the TV's fight.
  5. **Rings** (`web/src/lib/ring.ts`): an NPC's HP ring in its colour, outside only, one slice per point filling the whole ring with the crew's breaks. `MapView` draws it on an NPC in a fight on that map, and the plain ring otherwise. Web test: 1 health is one arc of 353°; 2 are halves.
  6. **The fight on the Scene** (web):
     - Start a fight beside the moods (`MoodBar`). During a fight that spot reads "Fight · round n | End fight".
     - `fight/StartDialog.tsx`: everyone on the map, with ticks. The crew start ticked, hidden NPCs are marked, there are no dice. It reopens during a fight to add or take out fighters.
     - `fight/Strip.tsx`, the looping strip at the top of the map:
       - the current fighter in the middle, larger, with NOW and a bar under them, and NEXT over the next one;
       - the rest fade to either side, with R2 where the next round starts;
       - while the dice land, each slot spins a Reflex reel and its number lands, timed from `started` on the server clock, then the strip sorts and the numbers fade;
       - no white rings.
     - Next turn, for the GM, just left of the strip.
     - Health on an NPC's card (`InspectCard`) while it's in a fight. The crew keep theirs on the rail.
     - The GM's map list marks each map with a fight ("Fight · round 2").
  7. **The TV** (`Tv.tsx`): under the map's name at the top-left, a "Fights" list with one row per fight, the map's name and its fighters' heads with HP rings. The party map's fight comes first.
  8. **Changes on the chips** (look C, `R14ChipReact`):
     - The store compares each new view with the last one, and for every crew member, NPC in a fight and pocket entry marks a change: hit, heal, Entropy up, Entropy down, item received, item taken, credits up, credits down, down at 0.
     - The rail ring, the map token and the TV's tokens play it.
     - Items and credits only play where that pocket is in the view, which is the holder and the GM, so nobody learns about anyone else's pockets.
     - A Burn's own mark takes the place of its Entropy spend.
     - Everything stays still for anyone with reduced motion on.
     - Web tests: the change detection, table-driven, and the strip's slot positions through a round wrap.
  9. **Small things:**
     - Ves's Burn row picks its "In a fight" cut by itself while she's in a fight.
     - Update the plan's Progress and M8 at the end.
  10. **Check on :8071** before deploying, with the Round 16 test game (`scripts/fight_test_game.py`: two hired guns at the founder's table, a hidden guard, Ves alone on the Promenade with a guard), the GM, two players and the TV:
     - start the Event Horizon fight: everyone's strip lands and sorts at the same moment, Next turn moves NOW on every laptop, and the TV lists the fight;
     - start the Promenade fight: Ves sees only hers, the others only theirs, and the TV lists both;
     - take health off a hired gun and off Tomo, give an item and credits: each plays on the right screens;
     - end both fights: the rings go back to plain.
     Then `make up` to 8070 once Peter says so; he's using it live.
- **Done when:** the check on :8071 above passes, and the server tests (with the leak tests) and the web tests pass.
- **How M8 turned out (2026-11-05):** built as planned. 171 server tests pass (19 in `test_fights.py`, the leak tests among them) and 44 web tests (the ring slices, the landing and the looping strip, and the change detection).
  - **The check on :8071** (a Playwright walk with the Round 16 test game, four seats at once):
    - the dialog listed everyone on the Event Horizon, with the hidden guard marked;
    - every laptop's dice landed and sorted together, and the strip read the same on the GM's and Tomo's screens;
    - Next turn moved NOW, and Tomo's and a hired gun's hits played look C;
    - the GM's map list showed "fight, round 1" for both maps;
    - Ves saw only her fight, and the TV listed both fights;
    - ending both cleared the strips, the TV's list and the NPCs' rings.
  - **Changes from the plan:**
    - the strip keeps four copies of the order, not three, so the slide into the next round never shows an empty end;
    - the dialog renders at the app's root, because the map's name block it's opened from takes no clicks;
    - End fight asks once more ("End it?");
    - Next turn appears once the dice have landed;
    - the reels start out of step, so they look like separate dice.
  - **Where things are:**
    - server: `Fight` and `GameState.fights` (`models.py`), `rules.turn_order`, `_gm_fight` and `gm.npc.hp` (`commands.py`), `_fights_view` (`views.py`);
    - web: `web/src/fight/` (the strip, the dialog and `fights.ts`), `web/src/fx/` (look C), `styles/fight.css`.
  - **For Peter:**
    - NPC health in `content/npcs.yaml`: the guard, the hired gun, the spider mech and the fixer come from the bible, and the rest are drafts;
    - the bible still says "no initiative".
  - **Not done:** dragging the order, and Team-up.
- **Changed 2026-11-06 (Peter):** the TV didn't show the initiative order, the roll had no sound, and the fights should be at the bottom. This replaces step 4 of "In it" and step 7 of the build plan:
  - **The TV shows each fight's turn order along the bottom,** one row per fight (`fight/TvFights.tsx`). The roll plays there at the same moment as on the laptops: the reels spin, the Reflex numbers land, the row sorts, and the numbers give way to 1, 2, 3 for the order.
  - **It says whose turn it is** (Peter, the same day, reversing the rule from his Round 16 notes). Once the dice are down, NOW sits over the current fighter, whose head is larger and whose number is brighter, and the row reads "Round 2". There's no NEXT. `views.py` sends the TV the same `round` and `now` as the laptops; `now` is empty while it's a hidden fighter's turn.
  - **The roll has a sound, on the TV only,** like every other roll (`RollSound.initiative`): the dice go in, Reflex's tick while they spin, a knock as each lands, and two notes when the order is set. Someone joining mid-fight gets the same, shorter. A reload mid-fight doesn't replay it.
  - **The TV's camera** keeps everyone in a fight in the shot, above the rows, so the rows never sit on a fighter.
- **Why here:** session 1 has no fight. It's needed before the first fight, session 2 at the earliest.

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
- **Maps:** only The Event Horizon. (No undo: decided against in M4.)
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
- **Not leaking secrets.** Hidden tokens, GM rolls, note bodies and locked entries must never reach a player. This is the classic bug in apps like this; the single filter and the leak tests prevent it.
- **Collecting the art.** About 89 single downloads for M1 and about 250 in total, deduplicated by hash, because the same image has a different id in each artifact.
- **Undesigned surfaces.** The Station, plus whatever of the GM tab is still open. Each needs a review loop with you.
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
| M4, M6 | Fan out the design variants, then you pick. M6 content (codex entries) can also fan out, with a spoiler reviewer. |
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

6. ~~**Item privacy.**~~ **Decided:** players see only their own items, and only you move them.
7. ~~**Briefs before session 1.**~~ **Decided:** briefs aren't in the app, and Peter hands them over with the character.
8. **Station tab.** Can players open maps of places they haven't visited yet? Decide at the M6 design pass.