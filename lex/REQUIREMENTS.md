# LEX — Requirements (v1)

The complete feature list. Every requirement is v1 unless tagged `(post-v1)`;
each maps to the DESIGN.md section that specifies it. This doc says **what** the
product does; DESIGN.md says how and why; IMPLEMENTATION.md says in what order.
The feature set descends from shipped hive (DESIGN §4) plus lex-specific play.

Actors: **Player** (signed-in user), **Guest** (invited friend, pre-sign-in),
**Hot-seat players** (two people, one device, no accounts), **System** (Cloud
Functions: validation, notifications, forfeits).

---

## 1. Functional requirements

### Accounts & identity (DESIGN §6.1)

- **FR-1** Sign in with Google; no passwords. Emulator-only email/password
  sign-in exists for dev/e2e and is absent from production UI.
- **FR-2** Profile: display name + photo from the provider, shown to opponents.
- **FR-3** Same account and games from any device (phone/tablet/desktop).
- **FR-4** Sign out from Settings.

### Game creation & options (DESIGN §2.2, §6.3, §7.1)

- **FR-5** Create a game and get an invite link + short code, or address it to a
  past opponent as a direct challenge.
- **FR-6** **Choose the board layout** at creation: v1 ships `classic` (the
  traditional premium arrangement) and `modern` (a WWF-style arrangement), with
  a mini board preview in the picker. Registry-driven — adding a layout is data.
- **FR-7** **Choose the dictionary** at creation: v1 ships `enable1`
  ("Tournament-style", ~173k words) and `2of12inf` ("Everyday words", ~82k),
  labeled with word counts. Registry-driven, same as layouts.
- **FR-8** Choose an async time control: none, or 1 / 3 / 7 days per move.
- **FR-9** Choose turn order: me / them / random (default random).
- **FR-9b** **Choose what invalid words do** at creation — a named setting with
  two values, picked like the dictionary and the clock: *Can't be played*
  (default) or *Cost your turn*. Under the latter the app withholds every
  dictionary verdict until the play is committed (FR-24b) and a play whose words
  aren't all in the dictionary costs the turn (FR-33b).
- **FR-10** All chosen options are visible to the invitee **before accepting**
  (join screen + challenge card) and to both players in-game (game menu) — the
  invalid-words rule is highlighted when set away from its default, since it is
  the only option that changes what a turn can cost.
- **FR-11** Options are immutable once the game is created.

### Invites, challenges & rematches (DESIGN §6.3)

- **FR-12** Invite by shareable link or by typing the short code in the lobby.
- **FR-13** The invite (link + code) stays visible and re-shareable on the game
  screen while the game is open; the board is withheld until the opponent joins.
- **FR-14** The creator can cancel an open game; stale invites expire and are
  culled automatically.
- **FR-15** Direct challenges: challenge anyone you've played before (no code);
  they accept or decline from the lobby or a push tap; decline removes the game.
- **FR-16** Rematch from a finished game: one tap creates the return game with
  starting player swapped, links the two games, and notifies the opponent;
  repeated taps reuse the same rematch game (idempotent).

### Lobby (DESIGN §7.1)

- **FR-17** Any number of concurrent games per account.
- **FR-18** Games grouped: incoming challenges, **your turn** (badged), waiting
  on opponent (outgoing challenges chipped), finished (result chips).
- **FR-19** Each card: opponent name/avatar, both scores, last play
  ("Sam played QUIZ +68"), time since last move, deadline countdown if timed.
- **FR-20** Entry points: new game, join-by-code, Settings.

### Gameplay — turn UX (DESIGN §7.2, §7.4)

- **FR-21** Rack of 7 tiles, refilled automatically after each play; drag to
  reorder; shuffle button.
- **FR-22** Place tiles by dragging rack → board, with a tap-tap fallback
  (tap tile, tap cell); identical behavior from one controller state machine.
- **FR-23** Staged (pending) tiles are visually distinct, freely movable,
  individually returnable, and bulk-returnable via **Recall**.
- **FR-24** Live preview while staging: every formed word gets a chip with its
  points and a ✓/✗ dictionary verdict; a total-score badge (including bingo)
  anchors to the main word; Play is enabled only when the play is fully legal.
- **FR-24b** When invalid words **cost the turn**, the preview shows the same
  words, scores and total and **no dictionary verdict at all** — no ✓/✗ and
  nothing standing in for one. No rejected word is flagged on the card or the
  board, and Play stays enabled for any legally-placed play. Committing a phoney
  raises a dismissible beat naming the refused word(s) — the only surface that
  ever shows them.
- **FR-25** Playing a blank prompts for its letter; the designation is permanent
  and visually distinct (no point index) thereafter.
- **FR-26** Exchange tiles: multi-select on the rack + confirm ("costs your
  turn"); offered only when the bag holds ≥ 7; publicly reveals only the count.
- **FR-27** Pass (with confirm) and Resign (with confirm) always available on
  your turn (resign any time).
- **FR-28** Board: auto-fit view, pan, pinch/wheel zoom, double-tap zoom,
  recenter — gestures contained to the board (no page scroll fights).
- **FR-29** Opponent's play animates in tile-by-tile; the last play stays
  highlighted with its score shown briefly.
- **FR-30** Score sheet drawer: every turn's word(s), score, and running totals.
- **FR-31** Bag count and opponent rack count always visible; player bars show
  names, "(you)", scores, turn chip, and deadline/clock when timed.

### Rules & scoring (engine — DESIGN §2.1, §5)

- **FR-32** Placement legality: single line; contiguity through existing tiles;
  first play covers the start square with ≥ 2 tiles; later plays connect;
  tiles must come from the player's rack.
- **FR-33** Every word formed (main + cross-words) must be in the game's chosen
  dictionary or the play is rejected naming the offending word(s) — strict
  dictionary, no challenge mechanic in v1.
- **FR-33b** When the game's invalid-words rule is **Cost your turn**, the same
  verdict has a different consequence: the play is a **phoney** — it places
  nothing, scores nothing, and costs the turn (counting toward the scoreless
  run, FR-35). Geometry and rack legality are unaffected; those plays are still
  rejected outright. The public move log records that a turn was spent, never on
  which letters (FR-38).
- **FR-34** Scoring: letter premiums on newly placed tiles only; word premiums
  stack multiplicatively; premiums never re-count; cross-words score; placing
  all 7 tiles is a bingo (+50).
- **FR-35** Endings: played-out (finisher gains opponent's rack points,
  opponent deducts own); six consecutive scoreless turns (both deduct);
  resignation; timeout. Higher adjusted score wins; equal is a draw.
- **FR-36** Every game is exactly reproducible from its logs (public move log +
  server-private draw log); finished games replay identically forever
  (immutable ruleset/dictionary registries).

### Fairness & hidden information (DESIGN §3.3, §6)

- **FR-37** Every game mutation goes through server-validated callables running
  the same engine; clients cannot write game state directly.
- **FR-38** A player can never obtain the opponent's rack or the bag contents —
  including by reading the database directly (three-tier document security).
- **FR-39** Exchanged letters never leave the server; turn order and move-count
  concurrency are server-enforced.

### Async play & notifications (DESIGN §6.4, §8)

- **FR-40** Realtime sync: both online feels live; otherwise state persists and
  resumes on any device.
- **FR-41** Push notifications: opponent played (word + score in the copy),
  game joined, challenge received/accepted/declined, rematch offered, game
  over, deadline warning. Tap deep-links to the game.
- **FR-42** Timed games stamp a per-move deadline; expiry forfeits the game
  (hourly sweep) with a warning push beforehand.
- **FR-43** In-app awareness with push denied: your-turn lobby section +
  badges, document title count, app icon badge where supported.
- **FR-44** iOS: detect and coach-mark the home-screen install that Web Push
  requires.

### PWA & offline (DESIGN §8)

- **FR-45** Installable PWA (manifest + service worker) on iOS/Android/desktop.
- **FR-46** Offline: lobby and finished games readable from cache; moves
  require connectivity (queueing is post-v1).
- **FR-47** Open clients resync on push receipt and on tab visibility — a
  silently dead stream never shows a stale board.

### Hot-seat mode (DESIGN §7.3)

- **FR-47b** Hot-seat games are created from their own setup screen: board,
  dictionary and invalid-words (FR-6/FR-7/FR-9b) — the settings one device can
  honour. Turn order and time controls are not offered (p0 always starts; there
  is no clock). Opening the hot-seat game with nothing stored shows this screen;
  a stored game resumes straight onto the board. A rematch re-deals under the
  finished game's own settings.
- **FR-48** Two players, one device, no accounts, no network: full game with
  the same UI, backed by a local transport.
- **FR-49** Pass-device interstitial hides both racks between turns.
- **FR-50** Hot-seat games persist locally; refresh/reopen resumes.
- **FR-51** The hot-seat build deploys as a public static PWA with no Firebase
  in the bundle.

### Settings & personalization (DESIGN §7.5)

- **FR-52** Theme: light / dark / system.
- **FR-53** Tile skins (classic / walnut / high-contrast), switchable mid-game;
  never affects rules.
- **FR-54** Notification opt-in state and management.

### End of game & history (DESIGN §7.4)

- **FR-55** Ending lands as a sequence: board beat on the final position, then
  a result overlay — outcome, reason, score story with adjustment line items,
  stats (moves, biggest word, duration), Rematch / View board / Back to lobby.
- **FR-56** Finished games stay openable: final board, score sheet, and
  re-openable result overlay.

### Word definitions (DESIGN §5.5)

- **FR-57** Any word a play forms can be looked up from where it already
  appears: a row of the live preview card while the play is staged, or the word
  in a score-sheet row once it is locked in. Invalid staged words included —
  that is when a player most wants to know. **Except when invalid words cost the
  turn (FR-9b): there the staged lookup is withdrawn entirely**, since a
  definition would answer the very question that setting withholds. Words
  already on the board stay lookup-able — playing one made it public.
- **FR-58** Definitions come from a bundled glossary, sharded and fetched on
  demand, so a lookup is fast and works offline once that shard is cached.
  Every two-letter word playable in any registry dictionary has one.
- **FR-59** A word with no bundled definition offers a Wiktionary link-out and
  says the word is still legal — a missing definition never reads as an
  invalid word, and never gates a play.

## 2. Non-functional requirements

- **NFR-1 No cheating.** All legality server-enforced; hidden info per FR-37–39;
  security rules covered by negative tests.
- **NFR-2 Pure engine.** `@lex/engine` and `@lex/dict` are zero-dependency,
  deterministic TypeScript (randomness and time enter as inputs); the same
  engine runs in client, server, and tests.
- **NFR-3 Everything rule-shaped is data.** Board dimensions, premiums, tile
  distribution/points, rack size, bonuses, end thresholds live in the immutable
  `Ruleset` registry; dictionaries in the dictionary registry. No game constant
  is hard-coded outside registry data (DESIGN §2.2) — this is the
  IP-swappability requirement.
- **NFR-4 Client/server dictionary identity.** Same package, id + content hash
  asserted on both sides; per-game dictionary loaded lazily and SW-cached.
- **NFR-5 Agent-verifiable quality.** Per-milestone `validate:*` gates, the
  `/dev/gallery` fixture registry, screenshot capture with mandatory review
  against `e2e/visual-checklist.md` (DESIGN §10).
- **NFR-6 Performance.** Compiled dictionary ≤ 800 KB; board interactions
  smooth on a mid-range phone; Lighthouse PWA pass before ship.
- **NFR-7 Responsive & accessible.** 390 px width up; touch targets ≥ 44 px;
  text contrast ≥ 4.5:1; premium squares labeled, never color-only.
- **NFR-8 Cost.** Firebase free-tier allowances cover friends-scale
  indefinitely; budget alert as tripwire.
- **NFR-9 Swappable backend.** Firebase confined to `@parlor/web`,
  `@parlor/server`, `app/src/sync/`, `packages/functions/`.
- **NFR-10 Game-agnostic platform.** The shared layer lives in the repo-level
  `parlor/` workspace and never imports game packages (machine-checked);
  lex is its first consumer, hive's migration is planned (DESIGN §4).

## 3. Out of scope for v1 (post-v1 candidates)

Opponent-initiated challenges (the invalid-words setting ships the phoney;
nobody adjudicates another player's word) · real-time chess clocks · 3–4 players ·
offline move queueing · keyboard tile entry · chat/emotes · AI opponent ·
analysis/best-play review · `.gcg` export · additional rulesets (e.g. an 11×11
quick board with a reduced tile set) · additional word lists (NWL/SOWPODS if
licensed) · ratings, matchmaking, spectators · native app store builds.
