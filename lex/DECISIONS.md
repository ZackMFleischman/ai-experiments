# DECISIONS.md — lex/

Append-only. New entries at the bottom: date, decision, one-line why. ≤8 lines each.
Milestone SHIPPED entries follow the same format (date, gates run, deviations,
stumbles). Pre-build design decisions 1–12 live in DESIGN.md §9 — this log starts
at build time. Post-v1 ideas go here as one-liners tagged `post-v1`.

---

- **2026-07-04 — Project adopted; docs are the deliverable of PR #39.** DESIGN.md +
  IMPLEMENTATION.md authored from an analysis of shipped hive (M0–M5 + user-feedback
  fixes). Documentation policy adopted verbatim from hive (IMPLEMENTATION.md §7):
  closed doc set, CI-enforced budgets, this file is the only doc that grows.

- **2026-07-04 — Shared code strategy: port into `@lex/platform`, extract later**
  (DESIGN §4). Hive is live and doc-frozen; cross-workspace linking is friction
  without a second stable consumer. Platform is generic by construction (machine
  check: no `@lex/engine` imports); promotion to a repo-root shared workspace and
  hive's migration onto it is tagged `post-v1`.

- **2026-07-04 — SUPERSEDED ↑: platform is repo-level `parlor/` from day one**
  (owner decision). Own workspace at the repo root (`@parlor/core|web|server|
  harness`), lex consumes via `link:` + TS paths (IMPLEMENTATION §1); lex-only
  to start, hive migration stays `post-v1`. Named for what it hosts: parlor games.

- **2026-07-04 — Board layout + dictionary are per-game options (owner req).**
  `dictionaryId` moved out of `Ruleset` into `GameOptions`; v1 ships rulesets
  `classic` + `modern` (WWF-style premiums) and dictionaries `enable1` (~173k)
  + `2of12inf` (12dicts everyday list, ~82k) — both public domain. Pickers in
  New Game (FR-6/7); options shown to the invitee pre-accept (FR-10).

- **2026-07-04 — REQUIREMENTS.md added to the doc set** (owner request): the
  numbered FR/NFR feature inventory, budget 250 (IMPLEMENTATION §7 table);
  IMPLEMENTATION budget raised 650→700 for the parlor wiring + second ruleset/
  dictionary tasks. Parlor keeps its own two ≤55-line docs.

- **2026-07-04 — SHIPPED M0 (T0.1–T0.8).** Gates: typecheck (docs + boundaries +
  strict tsc) + unit tests green in both workspaces; ping green vs demo-lex
  emulators; Playwright smoke 9/9 at 3 viewports; `validate:m0` chains them; CI
  ported (parlor / checks / validate jobs). Deviations: T0.5 ships minimal
  deny-all firestore.rules (three-tier rules are T4.3); e2e package named
  `lex-e2e` (a bare `e2e` collides with hive's in pnpm filters). Stumbles:
  fast-check predicates must return boolean/undefined — a vitest matcher's
  return value failed a seed property.

- **2026-07-04 — SHIPPED M1 (T1.1–T1.11).** Gates: 111 engine tests green;
  `validate:m1` = 1000-game property run (~40s) over both rulesets, fc seed
  pinned in CI. Deviations: `modern` premium census pinned 8TW/12DW/16TL/24DL
  with a plain-star center (WWF-style); engine exchange appends returned tiles
  to the bag end (server re-shuffle is a T4.5 transport event, so invariant-5
  replay is exact from bagOrder + moves at engine level); playerView throws on
  out-of-range seats. Stumbles: none — fixtures were generated, then pinned.

- **2026-07-04 — SHIPPED M2 (T2.1–T2.5).** Gates: 31 dict tests; `validate:m2`
  = DAWG build (enable1 480 KB / 2of12inf 227 KB, ≤800 KB) + full suite incl.
  the pinned played-out ENABLE game. Deviations: 2of12inf `%`/`!` marker words
  KEPT (markers stripped — they are real playable words per the 12dicts docs);
  sync loader exported at subpath `@lex/dict/node` to keep the frozen browser
  surface exact; provenance in `words/README.md` (outside the doc gate's walk).
  Stumbles: norvig.com blocked by the proxy — vendored enable1 from the
  dolph/dictionary mirror, 2of12inf from the official SourceForge zip.

- **2026-07-04 — SHIPPED M3 (T3.1–T3.13).** Gates: 101 app + 20 parlor tests;
  validate:m3 = visual sweep (24 gallery entries × 3 viewports × 2 themes with
  machine checks) + §4.2 ux flows + tap AND drag full-game e2e at 390×844 vs
  the production build; full `pnpm validate` green. Deviations: per-task gallery
  review consolidated into T3.11's first pass (3 accepted deviations logged in
  the checklist); result-overlay stats omit duration (no clock exists pre-M4).
  Stumbles: jsdom hid two real-browser bugs (tray wedged after drag hand-off —
  no pointerup after capture release; skin read a context, not the MUI theme).

- **2026-07-04 — Production Firebase project `lex-zmf` registered** (owner, per
  hive §5.6 steps 1–4): web-app config committed as `VITE_FIREBASE_*` in
  `packages/app/.env` (public identifiers). `.firebaserc` gains a `prod` alias;
  `default` stays `demo-lex` so emulators/CI keep running fully offline (§8.9) —
  deploys use `--project prod`. VAPID public key committed too
  (`VITE_FIREBASE_VAPID_KEY` — M5's push setup), and the deploy service
  account (Editor + roles/run.admin) is stored as the GitHub Actions secret
  `FIREBASE_SERVICE_ACCOUNT_LEX_ZMF` — hive §5.6 setup complete; nothing
  manual blocks M4.

- **2026-07-05 — SHIPPED M4 (T4.1–T4.10).** Gates: full `pnpm validate` green —
  22 negative-case rules tests, 32 callable/submitMove emulator tests, 5 real-SDK
  integration tests + the two-browser e2e (bingo, count-only exchange, reload
  resume, resign, rematch, challenge/decline) under validate:m4; 186-shot visual
  sweep. Deviations: the client ADOPTS server snapshots instead of replaying the
  log (hidden info — 'sync' entries; §3.3); private/bag gains `state`, racks gain
  `n` (§6.2 amended); resign allowed off-turn. Stumbles: reconcileSlots collapsed
  duplicate faces; snapshot fetches racing a commit needed a monotonic gate.

- **2026-07-05 — SHIPPED M5 (T5.1–T5.6).** Gates: validate:m5 = offline/
  installability e2e vs a production SW build; 18 new functions tests (exact
  payloads incl. word+score copy, badge fan-out, token pruning, pinned-now
  forfeit sweep); title-badge asserted in the two-browser e2e; full validate
  green. Deviations: sw.ts stays in the app (injectManifest builds from the
  app's srcDir — cross-workspace SW source is brittle; port map said parlor);
  badges/offline lobby largely landed with T4.7/T5.1, T5.4 closed the gates.
  ⚑ remaining for Zack: real push on a device + iOS home-screen check.

- **2026-07-05 — T6.4: pinch-zoom re-enabled; skin contrast is now a test.**
  Dropped `maximum-scale=1/user-scalable=no` (Lighthouse a11y): the board
  already consumes its gestures via `touch-action: none`, so page zoom only
  affects menu screens. Premium-label + tile-letter contrast (≥4.5:1, every
  skin × mode) moved from eyeball checklist to a unit test; classic/walnut
  inks went full black/white and walnut-light TW + high-contrast-dark TL/TW
  shifted to pass. Scores: PWA 1.0, a11y 1.0, SEO 1.0, BP 0.96, perf 0.89
  (throttled first load; TBT 0). DAWGs 480/227 KB vs NFR-6's 800 KB cap.

- **2026-07-05 — SHIPPED M6 (T6.1–T6.7): v1 code-complete.** Gates: full
  `pnpm validate` green (m0–m5 + unit + typecheck); Lighthouse PWA/a11y/SEO
  1.0; 228-shot gallery review ×3 rounds. Skins classic/walnut/high-contrast
  (persisted, contrast unit-enforced ≥4.5:1); rejected-move toast; lobby
  empty state + stacked chips; U+2212 scores; one-row actions at 390px;
  pinch-zoom re-enabled; card thumbnail exported. Stumble: Settings read
  mode from context, not theme — the M3 lesson, caught by dark captures.
  ⚑ Zack: prod deploy + DNS, first real game, PersonalWebsite card PR.

- **2026-07-05 — Board polish from first real-game feedback (Zack).** Four UX
  fixes: (1) preview total badge removed — it duplicated the main word chip and
  covered cells (bingo ★ moved onto the chip); (2) last-play highlight gets its
  own skin var `--lex-tile-lastplay-edge` (green ≠ pending gold — opponent tiles
  read as part of your staging) and hides while any tile is staged; (3) zoom-out
  floor = fit, bottoming out snaps to auto-fit (board could vanish off-screen);
  (4) board viewport is `user-select: none` (press-drag highlighted labels).

- **2026-07-05 — Drag drops snap to cells, ghost under the finger (Zack).**
  The ghost floated 40px above the finger and drops hit-tested at the ghost's
  center — releases landed a cell off from what you'd expect. Now the ghost
  rides under the finger and SNAPS into the free cell it would land in
  (position + scale match the cell exactly); release commits the snapped cell,
  so a tile always stays where the snap shows. No snap target (occupied cell /
  off-board) sends the tile home — occupied drops previously kept a staged
  tile put silently; home matches what the un-snapped ghost communicates.

- **2026-07-07 — Score-bar polish + move-clock visibility (Zack).** From a real
  game: (1) player-bar names show first names, falling back to first + last
  initial then full name only as far as needed to disambiguate — long names were
  wrapping the bar and top-justifying the score; (2) the side-to-move seat gets a
  live move-clock (compact "2d"/"18h"/"soon" + clock icon, fits even colliding
  "Mike B."/"Mike C." at 390px); (3) the lobby deadline chip now rides waiting
  cards too, so the opponent's clock is visible. Shared `game/clock.ts` feeds both;
  `deadlineAt` (already in schema) surfaced through `GameMeta` to the game screen.

- **2026-07-07 — In-game back button + branded boot loading screen (Zack).**
  (1) The score-bar now leads with a back arrow that leaves the live board for
  the lobby (multiplayer) / landing (hot-seat) — reuses the `onBackToLobby`
  already threaded from both game containers for the end-of-game overlay, so no
  new plumbing. (2) Landing shows the LEX hero + spinner while full-mode auth
  resolves instead of flashing the sign-in buttons at an already-signed-in
  player, then redirects to their games; guarded deep-links already covered by
  RequireAuth's own loading state.

- **2026-07-07 — Action-row hierarchy: Play is the CTA, Resign moves to ⋯
  (Zack).** From a real game: every action button was the same compact size and
  a `flex:1` spacer pushed Resign to the far-right edge — the natural primary-CTA
  slot on mobile — giving a rare, game-ending action false prominence while Play,
  the every-turn action, had none. Redesigned `GameActions` by frequency ×
  consequence: Play is a full-width contained CTA that grows to dominate the row;
  Recall is its outlined undo-pair; Exchange/Pass stay low-emphasis; Resign moves
  into an overflow (⋯) menu (error-colored, still behind its confirm dialog, still
  enabled off-turn via `canResign` per §2.3). Matches Words With Friends / Scrabble
  GO. Action set unchanged (DESIGN §7.2 still Play/Recall/Exchange/Pass/Resign);
  only placement changed. Tests/e2e that clicked Resign now open the menu first.

- **2026-07-07 — Lobby/landing UI shared into `@parlor/web/lobby-ui` (Zack).**
  Phase 1 of putting both hive and lex on parlor. The lobby presentation was
  originally copy-adapted per game (DESIGN §4); it's now a shared, game-agnostic
  seam: the grouped game list (`makeLobby` with injected thumbnail / caption /
  empty-state slots), the turn badge (`makeTurnBadge`), invite/waiting/challenge
  screens, the landing shell (hero slot), and the join card (details slot). Each
  lex `screens/*` file is now a thin wrapper binding lex's slots; its lobby
  summary EXTENDS a generic seat-index `LobbySummary`. Kept game-side: the
  new-game `NewGameForm` — hive's color+expansions vs lex's board+dictionary make
  it all-slots, so sharing it would be net-negative; only its generic pieces
  (`friendsFrom`, `InviteLinkView`, `Friend`) moved. Wiring: new `./lobby-ui`
  subpath export + tsconfig path; added `@mui/icons-material` to the vite/vitest
  `resolve.dedupe` so linked parlor icon components don't pull a second React
  (§8.11). hive migration onto this seam is Phase 3.

- **2026-07-08 — Top-level ErrorBoundary; stale-chunk auto-reload (fix: lex
  white screen).** The app had no error boundary, so anything thrown while
  rendering blanked the page to white. The game route is uniquely exposed: it is
  the only route behind lazy chunks (`SyncProviders` + `MultiplayerGame`). After
  a redeploy rotates the chunk hashes the running JS still references (and
  `cleanupOutdatedCaches` purges the old ones), the dynamic import throws through
  the unguarded `<Suspense>` — surfacing as "click into a game after the opponent
  moved → white screen, sometimes" (opening from a push navigates straight to
  `/game/:id`). Fix: `src/ErrorBoundary.tsx` wraps the whole tree in `main.tsx`.
  A dynamic-import failure is transient, so it hard-reloads once (a `sessionStorage`
  timestamp + 10s window stops a deterministic failure from looping); any other
  error falls back to a self-contained reload card (plain DOM, no MUI/providers —
  those may be what threw). Twin exists in hive (same missing boundary) — flagged
  for a follow-up port.

- **2026-07-08 — Added `nwl2023` dictionary (NASPA Word List 2023).** Third
  registry entry alongside `enable1`/`2of12inf` (DESIGN §5.4). Vendored from
  `scrabblewords/scrabblewords`; its source carries a definition per line, so the
  word file is the first column (`cut -d' ' -f1`), one word per line, LF — kept
  reproducible rather than hand-edited. 196,601 words; DAWG 541 KB (≤800 KB
  budget). Unlike the other two it is **copyrighted** (© NASPA); README states
  the terms and it ships at the owner's explicit direction, which DESIGN §5.4
  already reserved as the owner's call.

- **2026-07-08 — Off-turn planning: stage tiles (rack + board), reorder, and
  shuffle while the opponent moves.** Previously the whole tray was `disabled`
  off-turn, freezing even reorder/shuffle. Now staging is decoupled from
  committing: `placeAt`/`selectRackSlot` gate on `ended()` (game over) instead of
  `interactive()`, so you can lay out a planned play off-turn; `interactive()`
  still gates Play/Exchange/Pass, so nothing commits until your turn (DESIGN §7.2
  step 1 amended; same off-turn-action precedent as resign, §2.3). `disabled` now
  means the hard lock at game over only. Recall policy is **recall-everything**:
  a new game state (the opponent's move) already clears `pending` in `syncRack`,
  so any staged plan — including a tile on a cell the opponent just filled —
  returns to the rack wholesale rather than trying to partially reconcile.
  `buildPreview` now reads the acting seat's rack (off-turn `game.toMove` is the
  opponent), and the engine state is never touched by staging.

- **2026-07-08 — Firestore rules + indexes track a canonical parlor reference,
  enforced by a parity lint (hardening Phase 1).** `parlor/firestore.rules` +
  `parlor/firestore.indexes.json` are the canonical source of truth for the
  security model (declarative files, not TS — they live at the parlor root;
  parlor's boundary/doc lints ignore non-`.md`, non-source files). **Firebase
  requires the rules/indexes files to live inside each game's own project dir** —
  a `../parlor/...` path in `firebase.json` is rejected by `emulators:exec`/deploy
  ("outside of project directory"), which CI caught — so the physical file can't
  be shared. Each game keeps its own copy; `scripts/check-rules-parity.mjs`
  (wired into `pnpm typecheck`) fails if a game's rules drift from or weaken the
  base (base tiers must appear verbatim as a subsequence) or its indexes differ.
  lex is a hidden-information game: it keeps the base three tiers
  (users/games/moves/invites/deny-all) verbatim and ADDS `racks/{uid}`
  (owner-read) + `private/*` (server-secret), which the reference documents as a
  copy-in snippet — parity allows added tiers, forbids dropped/weakened ones. The
  negative-path rules-unit-tests remain the behavioral gate. DESIGN §4 updated.

- **2026-07-08 — submitMove is now the @parlor/server createSubmitMove shell
  (parlor hardening Phase 2).** The transaction shell (auth / envelope /
  preconditions / concurrency guard / moveCount+deadline bookkeeping /
  `pendingDrawOffer` clear / opponent push) moved to `@parlor/server`; lex injects
  only its engine `advance` (score → applyMove → exchange re-shuffle → public
  snapshot + rack doc + private bag doc as sub-writes) via `lexSubmitConfig` in
  submitMove.ts. The shell's unconditional `pendingDrawOffer` delete is a harmless
  no-op for lex (no draws). lex does **not** call `createDrawCallables` (its draws
  arise from tied scores in the engine, not an offer) — capabilities are opt-in by
  inclusion, so no draw endpoints ship. Wire contract (`move` field), doc shapes,
  and privacy invariant (exchange log carries a count only) unchanged. DESIGN §4/§6.3
  updated; submit-move + callables emulator tests are the equivalence gate.

- **2026-07-08 — FirestoreTransport shell shared via @parlor/web/transport
  (parlor hardening Phase 3).** lex adopts the shared shell — `seatIndexOf`,
  `watchGameMeta` (incl. the **permission-denied delete-detection**), and
  `fetchOrderedMoves` — dropping its local `seatOf` and inlined meta listener. It
  KEEPS its hidden-information **coherent-adoption** sync strategy game-side
  (`fetchSync` re-reads game doc + own rack + log per signal behind the rack-`n` /
  log-length coherence gates and the monotonic emit gate; serialized single-queue
  refetch) — the plan explicitly allows leaving this game-provided, and lifting
  race-sensitive live-sync into a generic module carries risk out of proportion to
  the dedup (the mp e2e is its only gate). Behavior preserved; DESIGN §4 updated.

- **2026-07-09 — Play button moved to the "thumb corner"; secondary actions
  iconified; opt-in play-confirm.** Fat-finger fix: `GameActions` now renders
  Recall/Exchange/Pass as a compact left-side icon cluster (≥44px, tooltip +
  aria-label preserve the `getByRole('button', {name})` selectors) with Play
  isolated as the prominent contained CTA on the right, separated by a spacer.
  New `lex.confirmPlay.v1` preference (Context per the skinContext idiom,
  provider in App.tsx, Settings toggle) gates a Play-confirm dialog; default
  **off** so existing one-tap flow and e2e are unchanged. Visual-checklist amended.

- **2026-08-05 — Preview chips → one draggable preview card (Zack).** Per-word
  chips anchored a row above each word's first cell covered the letters they
  annotated, and cross words (whose first cells sit a cell apart) piled their
  chips onto each other. Replaced by a single card: one row per word, a bingo
  line, and the play's total — which **reverses the 2026-07-05 "no total badge"
  call**, since the reason that badge was redundant (one chip = one word) dies
  with the chips, and a multi-word play had nowhere to show its value. Placement
  is `previewCard.pickCardSpot` (pure board-space geometry, unit-tested): score
  the spots around the play by what they'd hide, fall back to a clear corner of
  the visible slice, clamp on screen. It renders OUTSIDE the board transform so
  zoom doesn't shrink the text, and it is drag/arrow-key movable — a parked spot
  survives until it would cover a *new* staged word. Same pass: the last-play
  `+N` badge flips inside the board when its word ends at the right edge.

- **2026-08-05 — The preview card is click-through; only its grip isn't
  (Zack, from the PR's mp e2e).** The card parks in the empty space beside the
  play — which is exactly where the next tile goes — so as a normal pointer
  target it swallowed taps meant for cells: the multiplayer e2e hung clicking a
  cell under a "Must connect to a word" hint, and a real player would have hit
  the same wall. The chips it replaced were `pointerEvents: none` and never
  could. Now the card body is inert, a small grip carries the drag/arrow-key
  affordance, and the transient geometry hint has no grip at all. The row
  hover-to-ring interaction died with it, replaced by something better that
  needs no pointer events: the cells of any word marked ✗ stay ringed (dashed
  red) while the card is up.

- **2026-08-05 — Last-play badge follows the WORD, not the last tile dropped
  (Zack).** It anchored one cell past `cells[last]` — the tile the mover
  happened to place last, in staging order — so on a play that bridges committed
  letters (LATELY laid through the L of LOVER) it parked directly on a letter.
  It now shares the card's geometry module: `pickBadgeSpot` hugs the played
  word's full span (the placed cells' bbox spans anything bridged) and takes the
  first side that covers no tile. The badge is explicitly sized so the placement
  math reasons about the box the DOM renders.

- **2026-08-05 — Board chrome goes inert while a tile is armed (Zack).** The
  preview card's grip and the last-play badge both sit in empty cells beside the
  play, and for a word growing down a column the grip lands on the very NEXT
  cell — which is how the mp e2e's vertical bingo stalled even after the card
  itself went click-through. Both now drop `pointer-events` whenever
  `selection !== null` (a rack tile armed for tap-tap). Nothing is lost: with no
  tile armed a tap on an empty cell does nothing anyway, so the only taps the
  chrome can take are the ones the board had no use for.

- **2026-08-05 — The last-play badge expands into its word breakdown (Zack).**
  "How did they score 19?" was only answerable from the score-sheet drawer,
  two taps away and out of sight of the play. Tapping the badge now opens a
  popover with each word and its score, a ★ Bonus line when the recorded total
  exceeds the recorded words (stated as the arithmetic gap — the UI doesn't know
  the ruleset's bonus rules), and the total. A popover, not another board
  floater: anchored, tap-away-dismissed, edge-flipping. Works in multiplayer —
  the sync path keeps `words` (word + score) and drops only their cells.

- **2026-08-13 — A rejected word is the preview card's loudest state (Zack).**
  A small red ✗ on one row, beside a big black total, next to a Play button
  whose only tell is being grey, read as decoration — players kept pressing a
  disabled button. The card now turns whole: red border, total struck through,
  the offending row filled red, a thicker dashed ring on its cells. The first
  build also carried a band spelling out "CATS isn't in the dictionary"; Zack
  cut it as clutter — the state is legible without narrating itself, and the
  words still reach hover and the a11y tree as the Play button's title. Still
  pure verdict rendering — the UI decides nothing new, it just stops whispering.

- **2026-08-13 — A board tap tucks the last-play badge away (Zack).** The badge
  parks in an empty cell, which is not the same as out of the way: beside a
  tight word it still sits over the square you want to read, and its only exit
  was staging a tile. A tap on the board now toggles it (the green highlight
  stays — only the number steps aside). Taps that place or bounce a tile are
  doing their own job and don't toggle; nor do taps taken while tiles are
  staged, so a recall never returns to a missing badge; a new play always
  restores it.

- **2026-08-24 — "Invalid words" is a per-game setting, and a phoney is private
  (Zack).** Requested as "you don't know if the word is valid until you play,
  and if it isn't you lose your turn". Four calls. (1) **Named for the rule, not
  a difficulty.** It shipped for a day as a "Hard mode" switch; Zack asked for a
  setting you pick like the dictionary or the time limit instead. So it is
  `invalidWords: 'blocked' | 'costs-turn'`, titled "Invalid words" with the
  values "Can't be played" / "Cost your turn", in the same two-value toggle shape
  as turn order and time control, with the rule stated under whichever is
  selected. A value, not a flag — which also leaves room for a third rule later.
  (2) It lives in `GameOptions`, not the `Ruleset` (DESIGN §2.2) — orthogonal to
  board and word list, and a `Ruleset` field would mean a registry entry per
  board × rule and would imply finished games' boards differ. The engine takes it
  per call (`applyMove`'s `MoveOptions`); only the stage-3 branch changes, so it
  can never make illegal geometry legal. (3) The withheld verdict is
  `valid: null`, not `false` — a third state, so no surface can render "not told"
  as "rejected". (4) The refused words are **not** recorded publicly: they are
  still in the mover's rack, and `moves/*` is read by both players, so a phoney
  writes `kind:'phoney'` and nothing else and the push names no word (§3.3). That
  is the deliberate difference from over-the-board challenge play, where a phoney
  is revealed before it is withdrawn; the rack-privacy invariant wins. The mover
  sees their own words once, client-side, in a blocking beat — blocking because a
  lost turn that leaves the board unchanged is otherwise indistinguishable from a
  bug. In hot-seat it layers *above* the pass-device interstitial rather than
  suppressing it — the first build suppressed it, and the gallery capture showed
  the incoming player's rack behind the dialog, since a phoney has already passed
  the turn. No log marker is needed: replay re-derives the verdict.

- **2026-08-24 — Hot-seat gets its own setup screen (Zack).** Zack couldn't test
  the invalid-words setting in the PR preview: a preview deploys the static
  build, the static build is hot-seat only, and hot-seat had no creation form at
  all — every game was classic/NWL2023 under the default rules. So `/game/local`
  now shows a setup form when nothing is stored (a stored game still resumes
  straight onto the board, since options are immutable once a game is under
  way), `/game/local/new` reaches it any time, and the in-game info dialog —
  where you go to read how this game is set up — offers starting another one.
  It shows the three settings one device can honour; turn order and the clock
  are meaningless with no second device. The pickers are extracted to
  `optionPickers` and shared with the multiplayer form so the two can't describe
  a rule differently. Two hazards found while building it: `createHotSeatOptions`
  took positional args, so the rematch path silently reset any setting it forgot
  to pass (it now takes an object and rematch spreads the finished game's own
  options); and switching dictionary needs a NEW controller with reset-before-
  reload ordering, or the previous log replays through the new dictionary and
  throws on a word the narrower list refuses. Both are pinned by tests.

- **2026-08-28 — N players (2–4) adopted; the platform generalizes, lex is the
  acceptance vehicle** (owner decision). Option B of the exploration: `../parlor/`
  grows an N-seat model rather than lex forking its own callables. Sequenced ahead
  of `PORTFOLIO-HARDENING.md` M7 (Firebase identity consolidation) because the
  coupling is weak — M7 is project/namespacing, not seat shape — and lex is
  `status: "built"` with no live users, so the schema is free to change now and
  never again. Plan: IMPLEMENTATION §2 M7. Hard gate on every parlor PR: hive,
  checkers and tafl `validate` suites green, with no file changes in those repos.

- **2026-08-28 — The player count is a MAXIMUM, not a fixed size** (owner
  decision, superseding "fixed at creation" from the same exploration). The host
  picks up to 4, invites people, and may **start early** from 2 behind a
  confirmation that names who is being left out; the server auto-starts at max.
  Consequence, and the largest platform change in M7: the count is unknown at
  creation, so `initialGame` — the bag shuffle and the deal — **moves from
  `createGame` to a new `startGame`** for `maxPlayers ≥ 3`. Games with
  `min === max` (all three siblings, and lex at 2) keep dealing at create.

- **2026-08-28 — Invitations reserve nothing; first come, first served** (owner
  decision). Inviting friends and sharing a code are additive recruiting channels,
  not alternatives: every 3+ game always has one code, and whoever arrives first is
  next on the list. Kills the per-seat invite structure an earlier draft proposed,
  and with it `withdrawInvite`, `inviteToSeat`, per-seat vacate logic and
  code-minting-on-decline. Pre-game is a **guest list** (`roster` in join order +
  `invited` + `declined`); seats do not exist until `startGame`. A decline moves a
  name and never deletes the game at 3+ (at 2 it still deletes, as today).

- **2026-08-28 — Turn order is a parlor capability with three modes.** Random
  (default), a named player first, or a manual arrangement, chosen at create and
  finalized in the game room; `setTurnOrder` persists it **so every player sees the
  arrangement live, not just the host**. Opening on the centre double-word is a real
  edge, so fairness is enforced by transparency before start rather than by
  prohibition; `rematch` rotates the order by one so the advantage circulates.
  Manual arrangement uses up/down icon buttons, not drag — no DnD library is
  permitted, hand-rolled HTML5 drag is unreliable on touch, and buttons are
  keyboard- and AT-reachable for free. `parseSeatChoice` is kept as the per-game
  wire→intent mapping so the siblings' callable contracts are untouched.

- **2026-08-28 — Resign/timeout at 3+ is a WITHDRAWAL** (owner decision). The
  player is out, their score freezes, and **their rack returns to the bag** for the
  server to re-shuffle (the machinery exchange already uses). Tiles were nearly
  vanished instead; returning them wins because 4-player lex deals 28 of 100 tiles
  and removing a rack shortens the rest of the game by an arbitrary amount. Both
  options conserve tiles — the conservation argument raised against returning them
  was wrong. The game ends when one active player remains (`'last-standing'`).
  At exactly 2 players the behaviour is terminal, byte-for-byte as today.

- **2026-08-28 — Withdrawn players rank below everyone who finished** (owner
  decision), ordered among themselves by frozen score. Ranking purely by score
  makes resigning-while-ahead a viable strategy — leave at 250 in a 4-player game
  and bank second place. Reverse-withdrawal-order (the elimination convention) was
  rejected too: it punishes an early disconnect harder than a late rage-quit and
  makes the standings order underivable from the printed numbers. `GameResult`
  therefore replaces `winner: Seat | 'draw'` with `standings: Seat[][]`
  (best-first, inner arrays = ties) rather than carrying both.

- **2026-08-28 — `scorelessLimit: 6` reinterpreted as `scorelessRounds: 3`,
  keeping the `classic`/`modern` ruleset ids.** Evaluated as
  `scorelessRounds × activeSeats`, which is exactly 6 at two seats. DESIGN §2.2
  declares registry entries immutable ("a rules change means a NEW id") so that
  finished games replay under their original rules; behaviour is preserved
  bit-for-bit for every game that could exist today (all extant games are 2-seat),
  so replay fidelity — the property the rule protects — is intact and the ids
  stand. Recorded because it brushes a stated invariant rather than clearing it.
  `Ruleset` also gains `players: {min,max}`: the range is a rules dimension (a
  reduced-tile board cannot deal four racks), and lex forbids dimensions outside it.

- **2026-08-28 — The 2-player path is preserved, not migrated** (owner decision on
  two candidate changes). Today's post-create `InviteLinkView` step **stays** at
  `maxPlayers === 2`; `WaitingForOpponent`, `ChallengeReceived` and `InviteLinkView`
  are not modified at all, and the new `GameRoom`/`GuestList`/`InvitationReceived`
  are strictly additive 3+ surfaces. `e2e/multiplayer/game.spec.ts` must pass
  unedited; 3+ coverage lands in a new `room.spec.ts`. The one accepted 2-player
  change is the **winner-first result overlay** (today it lists seats in seat order;
  a victory screen should read winner-first, and `ResultOverlay` is not shared).

- **2026-08-28 — `withdraw` advances `moveCount`, and a withdrawal adjusts no
  score** (T7.1). Withdrawal is not a move, but it writes a log entry and passes
  the turn, so counting it keeps the entry index, the turn cursor and
  `submitMove`'s `expectedMoveCount` guard in step — a withdrawal racing a move is
  then a conflict rather than a silent overwrite. The leaving player's score
  freezes exactly as it stands: their rack is already back in the bag, so there is
  nothing to deduct, and deducting anything would price quitting differently from
  the §2.1 endings, which all settle against tiles a player still holds.

- **2026-08-28 — Ending precedence, and `withdraw` finalizes** (T7.2). `endedBy`
  ranks `last-standing` above `played-out` above `scoreless`: once one active seat
  remains nothing else can be decided, and a played-out rack still beats a
  scoreless run as it always has. `last-standing` applies **no** adjustment — the
  survivor's tiles never came off a natural ending, and the other racks are
  already in the bag. `withdraw` therefore runs the same finalizer `applyMove`
  does: dropping an active seat shrinks the scoreless limit (`scorelessRounds` ×
  active seats), so leaving can itself end the game, deductions and all.

- **2026-08-28 — `standings` is the only outcome the engine reports; the 2-seat
  `winner` is derived at the boundary** (T7.3). `result()` stops carrying a winner,
  so the two places that still speak the `'p0'|'p1'|'draw'` wire form — `submitMove`
  and the app's `computeEnd` — read `standings[0]` and treat a shared top placing as
  a draw. Behaviour is identical at two seats; widening those surfaces is T7.9/T7.11.
  `initialState` also starts **refusing** seat counts outside `ruleset.players`,
  closing a door that was open (5+ seats dealt happily): the range is rules data,
  and a board that cannot deal a count should be the thing that says so.

- **2026-08-28 — `parseSeatChoice` returns `TurnOrderChoice | number`, so no
  sibling file changes** (T7.4). M7's hard gate is that hive, checkers and tafl
  stay green **untouched**, and their configs return a resolved `0 | 1`. Widening
  the hook's return type (covariant) rather than replacing it keeps those
  implementations assignable, and `normalizeTurnOrder` lifts a bare index into
  `{mode:'host-seat'}` at the one call site. Rematch's rotate-by-one also lands
  here rather than in T7.7: it is *identical* to today's two-seat swap, and the
  seat plumbing had to be rewritten generically anyway.

- **2026-08-28 — The guest list is a pure module; `maxPlayers` on the doc is what
  makes a game a 3+ game** (T7.5). Every transition (join / invite / decline /
  leave / resolve the seat order) is a pure function in `@parlor/server`'s
  `roster.ts`, unit-tested without an emulator, with the callables as thin
  transactional shells — parlor has no emulator harness of its own, and this is
  what makes the lifecycle testable at all. `maxPlayers` is written **only** at 3+,
  so every two-seat doc is byte-for-byte what it was and takes the original code
  path. The host leaving promotes `roster[0]` implicitly rather than storing a
  separate host field; the last one out deletes the game, as cancelling would.

- **2026-08-28 — A stored arrangement is a preference, not a permutation** (T7.6).
  `setTurnOrder` persists the host's choice while people are still arriving, so by
  the time `startGame` (or an auto-start at max) resolves it, the roster has often
  moved on. `resolveSeatOrder` therefore appends anyone the arrangement never named
  in join order and ignores any uid that has since left, rather than validating a
  permutation and failing. Treating it strictly would drop a newcomer or break the
  auto-start outright — the trap IMPLEMENTATION §2 T7.6 names. `setTurnOrder` still
  rejects an arrangement naming somebody who is not in the game, so typos surface
  when the host makes them rather than silently at the start.

- **2026-08-28 — Per-seat doc fields stay seat-KEYED maps, not arrays**
  (T7.11, deviating from IMPLEMENTATION §2's "array `scores`/`rackCounts`").
  `{p0, p1, p2}` is N-capable already, and it keeps a two-seat game's doc
  byte-for-byte what it was — which is the promise the rest of M7 is built on and
  what lets the 75 existing functions tests pass untouched. An array would have
  changed the wire format for every existing game and dragged the whole sync layer
  (T7.12) into this task. `standings` is a new field rather than a reshaped
  `result`: `result` keeps its two-seat meaning for the lobby, and T7.9 reads
  `standings` behind `finalStandings()`.

- **2026-08-28 — Withdrawal is one shared routine, and the game owns the state
  change** (T7.7). `resign` and the timeout sweep both call `withdrawInTx`, so
  the two paths cannot drift — the bug that would otherwise surface only in a
  scheduled job nobody watches. Parlor owns the doc bookkeeping (`withdrawn`, the
  meta log entry, the deadline, the terminal flip) and delegates the state change
  to a `withdrawSeat` hook, because returning a rack to the bag is lex's business
  and `@parlor/*` may never import a game package. lex re-shuffles those returned
  tiles exactly as it does an exchange's, so the remainder stays unpredictable.

- **2026-08-28 — A placing on the wire is a map, not a bare list** (T7.7).
  Firestore cannot store an array directly inside an array, so the engine's
  `standings: Seat[][]` is written as `[{seats:['p3']}, {seats:['p0','p1']}]`.
  The emulator suite is what found it: the field is only written on a terminal
  move, so the whole 3+ withdrawal path type-checked and passed unit tests while
  being unwritable in production. The same suite caught a second one — parlor was
  writing the meta log entry BEFORE calling `withdrawSeat`, which reads the
  private bag, violating Firestore's reads-before-writes rule.

- **2026-08-28 — Guest-list pushes are a capability trigger, and `actorName` is
  additive** (T7.8). `'invited' | 'player-joined' | 'game-started'` form a
  `RoomTrigger` that parlor builds copy for itself (the `DrawTrigger` pattern),
  rather than joining `SharedTrigger`: adding a member there would make hive's,
  checkers' and tafl's exhaustive `buildPayload` switches non-exhaustive and
  break the three workspaces M7 promises not to touch. For the same reason
  `TriggerArgs.opponentName` stays required and `actorName` is an optional
  alongside it that parlor always sets — a rename would have been a breaking
  change to a field every game constructs. A decline sends nothing: it is the
  host's business and not push-worthy.

- **2026-08-28 — `LobbySummary.result` is kept, deprecated, and read through
  helpers** (T7.9). Every N-shaped field on the lobby contract is optional, and
  `finalStandings()` falls back to the two-seat `'p0'|'p1'|'draw'` when a game
  carries no `standings` — so games finished before M7 still place correctly and
  no backfill is needed. `placingOf()` / `isWinner()` are the only things the UI
  calls; nothing reads `result` directly any more. `friendsFrom` now prefers an
  `opponents` list, so a three-handed game contributes all of its players to the
  challenge picker rather than one, and `actionableCount` stops nagging a player
  who has withdrawn but is still nominally `toMove`.

- **2026-08-28 — A phoney is announced on the board surface, not just logged
  (Zack).** Shipped with the opponent learning only via a push and a row inside
  the score-sheet drawer — and since a phoney leaves the board untouched, a
  player opening the game saw nothing at all and could not tell it from a pass.
  Two surfaces now: a persistent strip under the score bar naming the player and
  the cost (tap to open the sheet, replaced by the next move, hidden while tiles
  are staged), and the sheet row marked ✗/red/0 rather than merely worded.
  Neither names the word — that half of the privacy call stands: the letters are
  still in the mover's rack and both surfaces are on both players' screens. If
  the word should be revealed too, that is a deliberate loosening of the §3.3
  invariant and wants its own decision.

- **2026-08-28 — A phoney names the word; the rack behind it stays secret
  (Zack).** Reverses the privacy half of the 08-24 entry, which withheld the
  refused words from every shared surface. Zack's call: the banner, the score
  sheet and the opponent's push all read "<name> tried to play the invalid word
  “QUIZZ” — turn lost". This is what an over-the-board challenge does — a phoney
  is shown before it is withdrawn — and without it the opponent could not tell a
  lost turn from a pass, since a phoney leaves the board untouched. The bound
  that keeps §3.3 true: only the words the play FORMED are published, never the
  placements, the score, or the rest of the rack. A formed word can span tiles
  already on the board, so it discloses at most the tiles that word consumed.
  `moves/{n}` gains `phoney.words`; CLAUDE.md's hard rule now names this as its
  one sanctioned exception rather than being silently contradicted by the code.
