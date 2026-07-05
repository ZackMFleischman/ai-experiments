# LEX — Design Doc

A digital, two-player **crossword tile game** (Scrabble / Words-with-Friends family),
built as a **PWA** so two people in different states can play each other
**synchronously or asynchronously** — same shape as its sibling project
[`hive/`](../hive/DESIGN.md), from which this project deliberately inherits its
architecture, backend, validation harness, and much of its code (§4).

> Scrabble is a trademark of Hasbro/Mattel; Words with Friends of Zynga. This is a
> private, non-commercial project for personal play. Because the classic board layout
> and letter distribution are the trademark-adjacent parts, **both are data, not code**
> (§2.2): swapping to an original layout/tileset is a one-file change, by requirement.

The name is "LEX" (fittingly, a playable word). Renaming would be a find-replace
plus a DNS choice; nothing in the architecture depends on it.

The complete numbered feature inventory lives in
[REQUIREMENTS.md](./REQUIREMENTS.md); this document is the *how and why* behind
those requirements and cross-references them where useful.

---

## 1. Goals & non-goals

### Goals (v1)

- **Two-player over the internet.** Create a game, send an invite link or challenge a
  past opponent, play.
- **Async or sync, seamlessly.** No mode switch: a game is shared state updating in
  real time. Both online ⇒ feels live; otherwise you get a push when it's your turn.
- **Great placement UX.** Drag tiles from a rack to the board (tap-tap fallback),
  with live feedback: formed words, running score preview, valid/invalid word chips,
  recall, shuffle, blank designation.
- **Dictionary-enforced plays** (Words-with-Friends style): an invalid word can't be
  played — the app tells you which word failed. No challenge mechanic in v1 (§2.3).
- **Swappable board layout, tileset, and dictionary** — first-class architectural
  requirement, not a nice-to-have (§2.2) — and the **board layout and dictionary
  are chosen per game at creation** (v1 ships two of each).
- **Turn awareness & notifications.** Push ("Sam played QUIZ for 68 — your move"),
  lobby badges, icon badge.
- **Multiple concurrent games** per account; lobby grouped by your-turn/waiting.
- **Responsive PWA.** Phone, iPad, desktop; installable; same account everywhere.
- **Robust.** Server-validated moves running the same engine; racks and bag are
  **server-secret** (§3.3) — you can't cheat by reading the wire.

### Non-goals (v1)

- No AI opponent (architecture leaves the door open — engine is a pure library; a
  DAWG-based move generator is a natural `@lex/ai` package later).
- No 3–4 player games (engine models N players from day one — arrays, seat indexes —
  but lobby/invite/notification flows assume 2 seats in v1).
- No challenge/phoney rules, no ratings, no public matchmaking, no chat, no analysis.
- No native app store builds — PWA only.
- No monetization; no hardening beyond "players can't cheat."

---

## 2. Rules scope

### 2.1 Core rules (pinned)

Standard crossword-game rules, played to the **strict-dictionary** house rule:

- **Board:** 15×15 grid with premium squares (double/triple letter, double/triple
  word); the center square starts play and is a double-word square. Layout is data
  (§2.2); the default is the classic arrangement (8 TW, 17 DW incl. center, 12 TL,
  24 DL).
- **Tiles:** 100 tiles — the standard English distribution and point values,
  including 2 blanks (0 points, letter designated on placement, permanent once
  played). Also data (§2.2); a fixture pins the default set at 100 tiles / 187 points.
- **Racks:** 7 tiles, refilled to 7 from the bag after every play while tiles remain.
- **A play** places 1+ tiles from the rack in a single row or column such that:
  the placed tiles plus existing tiles form one contiguous main word; the first play
  covers the center square and uses ≥2 tiles; every later play connects to at least
  one existing tile. Every word formed (main + cross-words) must be in the
  dictionary or the whole play is rejected, naming the offending words.
- **Scoring:** letter premiums apply to newly placed tiles only; word premiums
  multiply (two DWs under one word ⇒ ×4) and also count only when newly covered;
  cross-words score too; placing all `rackSize` (7) tiles in one play is a **bingo**
  (+50). Premium squares never re-count on later plays.
- **Exchange:** on your turn, swap any number of rack tiles with the bag, if the bag
  holds ≥ 7 tiles. Costs the turn.
- **Pass:** always allowed; costs the turn.
- **Game end:**
  1. The bag is empty and one player plays out their last tile ⇒ that player adds
     the sum of the opponent's remaining tile points; the opponent deducts their own.
  2. **Six consecutive scoreless turns** (pass, exchange, or a 0-point play) ⇒ game
     ends; each player deducts their own remaining tile points.
  3. Resignation, or timeout under an async time control (§6.4).
- Higher adjusted score wins; equal ⇒ **draw** (no first-player tiebreak).

### 2.2 Configurable surfaces (the "easily changeable" requirement)

The rules parameterization lives in one immutable value, the **`Ruleset`**, with
the dictionary chosen **independently** per game (so any board pairs with any
word list):

```
Ruleset = {
  board:   BoardLayout      // rows, cols, premium map, start cell
  tiles:   TileSet          // per-letter count + points, blank count
  rackSize, bingoBonus, exchangeMinBag, scorelessLimit
}
GameOptions = { rulesetId, dictionaryId, timeControl }   // pinned at creation (FR-6..11)
```

- The engine computes **everything** — geometry, scoring, end conditions — from the
  `Ruleset`; no dimension, premium, letter count, or bonus is hard-coded anywhere.
- Rulesets live in a registry in `@lex/engine` keyed by id. **v1 ships two**, both
  15×15 over the standard tile set, differing only in premium arrangement:
  `classic` (the traditional layout) and `modern` (a WWF-style layout). Games
  store the **id**; registry entries are immutable — changing a ruleset means
  adding a new id, so finished games always replay under their original rules.
- Dictionaries are swappable assets behind a 2-method interface with their own
  registry in `@lex/dict` (§5.4). **v1 ships two**, both public domain:
  `enable1` ("Tournament-style", ~173k words) and `2of12inf` ("Everyday words",
  ~82k — the 12dicts common-vocabulary list, friendlier for casual play).
- **Both are picked in the New Game flow** (FR-6/FR-7), shown to the invitee
  before accepting, and immutable afterwards (§7.1).
- Board size is *not* assumed 15×15 by the UI: the grid renders `rows × cols` from
  the layout, and the viewport auto-fits (§7.2). An 11×11 quick-play board (with a
  reduced tile set) is a post-v1 registry entry.

### 2.3 Meta rules

- **Resign** any time. No draw offers (unlike hive — draws arise naturally from tied
  scores, and offer flows would be dead UI; cut per §9.6).
- **Time controls:** per-move async deadlines (`1 / 3 / 7 days` or none), timeout ⇒
  loss — identical semantics and machinery to hive (§6.4). Real-time clocks post-v1.
- **Turn order:** chosen at creation (me / them / random, default random); rematch
  swaps who starts.
- v1 plays **strict dictionary** only: no phoneys, no challenges. Challenge-mode
  (play anything, opponent may challenge) is a post-v1 ruleset flag, and is why the
  engine's geometry check and dictionary check are separate calls (§5.2).

### 2.4 Notation & the move log

The move log is a collection of **typed entries** (`play` with explicit placements,
blanks, words, and score; `exchange` with a tile *count* publicly; `pass`; plus meta
`resign`/`timeout`) — JSON, not a string format, because placements with blank
designations are unambiguous that way and the wire format equals the storage format.

For fixtures, human-auditable records, and interop, the engine also speaks
**GCG-style notation** (the community-standard crossword game format): coordinates
like `8D` (row-first = horizontal) / `D8` (column-first = vertical), blanks as
lowercase letters, e.g. `H4 QUIZzed +68`. `toGcg`/`parseGcg` round-trip every test
fixture; a full-game `.gcg` exporter is post-v1.

Unlike hive, **the public log alone cannot reconstruct full state** — draws are
hidden information. Reconstruction inputs are: public log + the server-private draw
log (§6.2). This is the project's central architectural delta from hive and is
designed for explicitly in §3.3.

---

## 3. Architecture

### 3.1 Principle: the game is a library, the app is a client (inherited)

Identical to hive §3.1: the rules engine is a **pure, zero-dependency TypeScript
package** consumed by the web UI, the server-side validator, tests, and (later) an
AI. Same three layers: engine (model) / controller / view. Same hard rule: **the UI
never computes rules** — it calls engine verdict functions on candidate plays and
renders the result.

```
lex/
├── DESIGN.md                   # this document
├── IMPLEMENTATION.md           # ordered task list + build protocol
├── package.json                # pnpm workspace root (independent of loom/ and hive/)
├── packages/
│   ├── engine/                 # @lex/engine — pure rules kernel (zero deps)
│   │   └── src/
│   │       ├── ruleset.ts      # Ruleset/BoardLayout/TileSet types + `classic` registry
│   │       ├── board.ts        # grid cells, word extraction, connectivity
│   │       ├── validate.ts     # checkPlay: geometry + rack legality, words formed
│   │       ├── score.ts        # premium/cross-word/bingo scoring
│   │       ├── state.ts        # GameState (full) / PlayerView (projected), bag & draw
│   │       ├── engine.ts       # applyMove, result, end-game adjustments
│   │       ├── gcg.ts          # GCG-style parse/serialize
│   │       └── serialize.ts    # full + public state round-trips
│   ├── dict/                   # @lex/dict — word lists compiled to a compact DAWG
│   │   ├── words/enable1.txt   # vendored public-domain list (+ LICENSE note)
│   │   └── src/                # build script, loader, Dictionary implementation
│   ├── app/                    # @lex/app — React + MUI + Vite PWA
│   │   └── src/
│   │       ├── screens/        # Landing, Lobby, NewGame, Join, Game, Settings
│   │       ├── board/          # grid board, rack tray, drag layer, viewport
│   │       ├── controller/     # GameController: engine ↔ UI ↔ transport
│   │       ├── sync/           # thin game-specific bindings over @parlor/web
│   │       └── dev/            # /dev/gallery entries
│   └── functions/              # @lex/functions — callables = @parlor/server + submitMove
└── e2e/                        # Playwright: two-browser full-game tests

../parlor/                      # SIBLING WORKSPACE at the repo root (§4): the
├── packages/                   # game-agnostic platform layer, ported from hive
│   ├── core/                   # @parlor/core — transport seam, log session, optimistic queue (zero deps)
│   ├── web/                    # @parlor/web — firebase init, auth, push, lobby queries, providers (React)
│   ├── server/                 # @parlor/server — callable shells, notify, forfeit, invite/challenge/rematch
│   └── harness/                # @parlor/harness — gallery runtime, validate script cores
└── README.md                   # parlor's own rules; build tasks live in lex/IMPLEMENTATION.md
```

### 3.2 The three layers (deltas from hive only)

1. **Model (`@lex/engine`).** Two state shapes, because of hidden information:
   - `GameState` — **full** state (board, both racks, bag order, scores). Exists
     only server-side and in hot-seat mode.
   - `PlayerView` — what one player may know: board, **own** rack, scores, bag
     *count*, opponent rack *count*. `playerView(state, seat)` is the only
     projection, and a property test asserts it never leaks (§10).
   - There is no `legalMoves()` — enumerating all crossword plays is an anagram
     search the UI doesn't need. The UI's contract is instead **verdict functions**:
     `checkPlay` (geometry + rack), `scorePlay`, and dictionary lookups, all of
     which need only `PlayerView`-level knowledge. Full enumeration is an AI
     concern, post-v1.
2. **Controller.** Same optimistic-apply/rollback pattern over the same
   `GameTransport` seam as hive, plus lex-specific derived state: the **pending
   placement set** (tiles staged on the board but not submitted), live
   words/score/validity preview, exchange selection, blank designation.
3. **View.** React + MUI, renders controller state only. The board is a DOM/CSS
   grid rather than hive's SVG (§7.2 says why).

### 3.3 Hidden information (the big delta from hive)

Hive is perfect-information: ship everyone the whole state. Lex is not — a player
must never be able to read the opponent's rack or the bag, **including from raw
Firestore**. Consequences, designed once here and referenced everywhere:

- **Randomness at the edge, determinism inside.** The engine never shuffles: it
  takes a pre-shuffled bag order as input (`initialState(ruleset, bagOrder)`) and
  draws from it deterministically. Shuffling happens exactly twice, both server-side
  with crypto randomness: at `createGame`, and re-shuffling the remainder on each
  `exchange`. Hot-seat mode shuffles in the local transport. Tests inject fixed
  orders — the whole engine stays as deterministic as hive's.
- **Three storage tiers per game** (schema in §6.2): the public game doc + move log
  (board, scores, counts — readable by both players); a per-player **rack doc**
  readable only by its owner; a **private bag doc** readable by no client at all
  (Cloud Functions only). Firestore rules tests assert all three boundaries (§10).
- **Public log + private draw log = full replay.** The private doc records the
  initial bag order and each exchange's re-shuffle, keyed to move numbers, so the
  server can always reconstruct `GameState` exactly — preserving hive's
  "log is the source of truth" property, split across a public and a private half.
- **Exchanges are private.** The public move entry records only *how many* tiles
  were exchanged; which letters went back is server-private.
- **Optimistic play still works** because play legality and scoring depend only on
  public board + own rack: the client fully validates and scores locally, applies
  optimistically, and the only thing it must wait for is its **refill** — which
  arrives via its own rack-doc listener after the server draws.

### 3.4 Open/closed seams

- **Ruleset registry** (§2.2): new board/tileset/rule-knob combinations are data.
- **Dictionary interface** (§5.4): new word lists are assets, not code.
- **`GameTransport`** (from hive): hot-seat, localStorage, and Firestore backends
  behind one interface; an AI opponent later is just another transport peer.
- **N players:** engine state is seat-indexed arrays throughout; only
  platform/lobby/UI assume 2 seats.
- **Tile skinning:** tile/board visuals are CSS-variable-driven themes (the hive
  "bear mode" lesson institutionalized): rules and engine never see the skin.
- **Backend swap:** Firebase confined to `@parlor/web`, `@parlor/server`,
  `app/src/sync/`, and `packages/functions` — same discipline as hive's.

---

## 4. What we take from hive — reuse analysis

Hive shipped M0–M5 and is live; its DESIGN/IMPLEMENTATION/DECISIONS record both the
architecture and the hard-won fixes (emulator long-polling, pinch containment,
SW push-sync, functions bundling, IAM repair…). Lex's stance, per surface:

**Reuse the design wholesale (this document mostly writes deltas):** the three-layer
architecture, the Firebase choice and rationale (hive §5.1 — every driver applies
verbatim), server-authoritative callables, the emulator-first dev loop, the PWA/push
approach, async time controls, the milestone-gate + `/dev/gallery` + screenshot-review
validation harness, and the CI-enforced documentation policy.

**Share — port into the repo-level `parlor/` workspace, genericized (game-agnostic
by construction):**

| Hive source | Becomes | Notes |
|---|---|---|
| `app/src/controller/transport.ts`, `localStorageTransport.ts` | `@parlor/core` | `GameTransport` with a generic entry type instead of hive's `LogEntry` |
| `GameController`'s log-sync + optimistic-submit/rollback core (~1/3 of it) | `@parlor/core` `LogSession` | the hex selection/drag state machine parts are hive-specific — not ported |
| `app/src/sync/firebase.ts, authContext.ts, RequireAuth.tsx, AppSyncProviders.tsx, push.ts, pushState.ts, NotificationsSetup.tsx, lobby.ts, gameApi.ts, firestoreTransport.ts` | `@parlor/web` | game-specific bits (doc field names beyond the shared meta set, payload types) become type params/config |
| `functions/src/games.ts` create/join/cancel/challenge/respond/rematch + helpers (auth guard, invite codes, deadlines) | `@parlor/server` | `submitMove` is game-specific; its transaction shell (load → turn check → concurrency guard → write + push) is the shared part |
| `functions/src/notify.ts`, `forfeit.ts` | `@parlor/server` | payload copy injected per game |
| `app/src/dev/Gallery.tsx` + registry pattern, `validate:visual`/`validate:ux` script cores, `scripts/check-docs.mjs`, `check-bundle.mjs`, icon/card build scripts | `@parlor/harness` (+ thin `scripts/` wrappers in lex) | near-verbatim |
| `app/src/theme.ts`, `sw.ts` (push display, deep-link, push-sync postMessage) | `@parlor/web` | theme tokens re-skinned per game |

`@parlor/*` **must not import any game package** (`@lex/*`, `@hive/*` —
machine-checked, IMPLEMENTATION §3) — that's what keeps it honestly generic.

**Copy-adapt — start from the hive file, edit meaningfully (screens are ~layout-
identical but content-different; infra files differ in names/fields):**
`screens/*` (Landing/LandingLayout, Lobby + lobbyView + turnBadge, NewGame, Join,
JoinByCode, Settings, Game chrome, waitingView, InstallCoachMark), `game/*`
(PlayerBar, GameMenu, MoveList → score sheet, ResultOverlay), `board/BoardViewport`
(pan/zoom/pinch math — keep; SVG specifics → CSS transform), `firestore.rules`
(+ rack/bag tiers), `firebase.json` + emulator seed, CI workflows + deploy job
(incl. the invoker-repair step), the e2e `test-harness` module, `e2e/visual-checklist.md`
skeleton, and the doc set itself (CLAUDE/DESIGN/IMPLEMENTATION/DECISIONS structure).

**Rewrite — game-specific, no useful hive counterpart:** all of `@lex/engine`
(different game), `@lex/dict` (new concern), board grid + tile + rack-tray
components, pending-placement UX (preview chips, recall, blank picker, exchange
mode), the hot-seat **pass-device** privacy interstitial, sprite/art assets
(lex tiles are typography — far lighter art burden than hive's 16 glyphs).

**The shared library is repo-level from day one (owner decision): `parlor/`** —
named for what it is, a parlor-games platform: the game-agnostic layer for
turn-based, two-player, invite-a-friend PWA games on Firebase. It is its own pnpm
workspace at the repo root with four packages (`@parlor/core`, `@parlor/web`,
`@parlor/server`, `@parlor/harness`), its own tests and CI, and **no game
imports** — lex is its only consumer to start; hive's migration onto it stays a
deliberate later project (hive is live and CI-gated; nothing forces it).
Consumption mechanics — pnpm workspaces don't span repo roots, so lex consumes
parlor as **source-linked sibling packages** (`link:` dependencies + TS path
mapping; exact wiring in IMPLEMENTATION §1). Peer dependencies (react, firebase,
MUI) are declared by parlor and provided by the consuming game, so parlor never
pins a second copy of a framework. Divergence risk against hive's originals (a bug
fixed in hive but not in the port) is contained by provenance headers — every
ported file names its hive source path, so fixes are greppable to their twin —
and shrinks to zero when hive migrates.

---

## 5. Rules engine design

### 5.1 Board & state representation

- Cells are `{row, col}` (0-based), key `"row,col"`. The board is a sparse
  `ReadonlyMap<CellKey, PlacedTile>` — only occupied cells — sized/bounded by the
  `BoardLayout`.
- `PlacedTile = { letter, isBlank }`; points always come from the `TileSet`
  (blanks score 0 regardless of designated letter).
- Racks and bag hold `TileFace = 'A'…'Z' | '?'`. The bag is an ordered array;
  the **front is the next draw** — order is the injected randomness (§3.3).
- Full `GameState`: ruleset id, board, per-seat racks, bag, per-seat scores,
  `toMove` seat, `moveCount`, `scorelessRun`. `PlayerView`: same minus other racks
  and bag contents (counts only).

### 5.2 Verdict pipeline (what replaces hive's `legalMoves`)

A candidate play flows through three pure, separately callable stages — separate so
the UI can give precise live feedback and so challenge-mode can later skip stage 3:

1. **`checkPlay(board, rack, placements, ruleset)`** — geometry + rack legality:
   tiles come from the rack (blank designations legal), single line, contiguity
   through existing tiles, first-play center + ≥2 tiles, connectivity. Returns the
   **words formed** (main + cross) with their cells, or a typed rejection reason.
2. **`scorePlay(board, placements, ruleset)`** — per-word scores (letter premiums on
   new tiles only; word multipliers stack; premiums spent once), bingo flag, total.
3. **Dictionary verdicts** — `dict.has(word)` per formed word; all must pass.

`applyMove(state, move, dict)` runs the full pipeline (for `play`), enforces
exchange/pass legality, draws refills from the bag, updates `scorelessRun`
(pass, exchange, and 0-point plays increment; scoring plays reset), and — when the
move ends the game — applies the end adjustments of §2.1 so `state.scores` is final.
`result(state)` then just reads. Illegal input throws `IllegalMoveError`, same
contract as hive.

### 5.3 Algorithms (the interesting parts)

All trivially cheap at 15×15 — the engine's difficulty is edge-case correctness,
not performance:

- **Word extraction:** from any placement set, scan the main line to its maximal
  contiguous extent, then perpendicular scans per placed tile; a cross "word" of
  length 1 is not a word (no dictionary check, no score).
- **Contiguity with gaps:** placed tiles may be non-adjacent to each other so long
  as intervening cells are already occupied — validated by walking the main line.
- **Scoring:** single pass per formed word, accumulating letter values (×premium if
  that cell was placed this turn) and a word-multiplier product (likewise).
- **End adjustments:** pure function of racks + tileset points, applied by the
  terminal `applyMove`.
- **Draw:** `splice` from bag front; refill to `rackSize` or bag exhaustion.

### 5.4 Dictionary (`@lex/dict`)

- Interface the engine sees: `{ id: string; has(word: string): boolean }` — the
  engine stays zero-dep; the dictionary is injected.
- `@lex/dict` owns the **dictionary registry**: `DICTIONARIES` metadata
  (id, display name, description, word count — what the New Game picker renders,
  FR-7) plus `loadDictionary(id)`. v1 ships two public-domain lists:
  **`enable1`** ("Tournament-style", ENABLE, ~173k words) and **`2of12inf`**
  ("Everyday words", the 12dicts common-vocabulary inflected list, ~82k words —
  friendlier for casual play). Exact counts pinned at vendor time. NWL/SOWPODS
  are copyrighted — swap-in is the owner's call, and is just a new registry
  entry + word file (§2.2).
- A build script compiles each word list into a **compact binary DAWG** (target
  ≤ 800 KB each, generated at build — not committed). The app lazily loads the
  dictionary **of the game being viewed** (cached by the service worker); the
  functions deploy bundles both. Lookups are microseconds; the client validates
  as you place tiles with zero latency.
- Same list version on client and server, pinned by dictionary id + a content hash
  the tests assert, so client and server can never disagree on a word.

---

## 6. Backend

### 6.1 Choice: Firebase — inherited from hive verbatim

Every decision driver in hive §5.1 applies unchanged (realtime sync, Web Push,
auth, no ops, free at friends-scale), plus one new one: **hidden information wants a
server**, and lex already has one — the same callable pattern hive uses for
anti-cheat carries the rack/bag secrecy (§3.3) for free. Same project shape too: a
new Firebase project (`lex-zmf`), Google sign-in only, emulator suite for all dev
and CI (hive §5.5–§5.6 apply as written, including Blaze plan, VAPID key, deploy
service account, and preview-channel strategy).

### 6.2 Data model (Firestore)

```
users/{uid}:              { displayName, photoURL, fcmTokens: string[], settings }   // = hive
games/{gameId}:           { players: {p0: uid, p1: uid|null},        // p0 moves first
                            playerNames: {p0, p1}, playerIds: uid[],
                            options: { rulesetId, dictionaryId, timeControl },
                            status: 'open'|'active'|'finished',
                            inviteCode?, challenge?,                  // = hive semantics
                            result?: 'p0'|'p1'|'draw',
                            endedBy?: 'played-out'|'scoreless'|'resign'|'timeout',
                            toMove: 'p0'|'p1', moveCount,
                            scores: {p0, p1}, bagCount, rackCounts: {p0, p1},
                            lastPlay?: {by, word, score},             // lobby cards + push copy
                            rematchOf?, rematchGameId?,
                            timeControl?: {days: 1|3|7} | null,
                            deadlineAt?, deadlineWarnedAt?,
                            updatedAt, createdAt,
                            public: string }                          // serialized public state (fast load)
games/{gameId}/moves/{n}: { n, kind: 'play'|'exchange'|'pass'|'resign'|'timeout',
                            play?: { placements: [{row, col, letter, isBlank}],
                                     words: [{word, score}], score, bingo },
                            exchanged?: number,                       // count ONLY — letters are private
                            by: uid, at }
games/{gameId}/racks/{uid}: { tiles: string, n: number }              // e.g. "AEINRT?" — owner-read only;
                                                                      // n = move count this rack is current for
                                                                      // (client refill reconciliation)
games/{gameId}/private/bag: { order: string, drawn: number,           // NO client read, ever
                              state: string,                          // serialized FULL GameState — submitMove's fast path,
                                                                      // regression-checked against order+log+events replay
                              events: [{n, returned, reshuffled}] }   // exchange re-shuffles (§3.3 replay)
invites/{code}:           { gameId, createdBy, hostName, hostSeat, options, expiresAt }  // = hive
```

- Security rules: game docs + moves readable by the two players; `racks/{uid}`
  readable only when `request.auth.uid == uid`; `private/*` readable by **no one**;
  all writes through callables except your own `users/{uid}`. **Rules tests assert
  each boundary, including the negative cases** (opponent rack read denied, bag read
  denied) — this is a security invariant, not a convention (§10).
- Lobby query identical to hive (`playerIds array-contains` + status, composite
  index committed); grouping client-side.
- The `public` snapshot is the same denormalized-cache idea as hive's `state`
  field, regression-checked against server-side replay in tests.

### 6.3 Game API (server-authoritative callables)

| Callable | Delta vs hive |
|---|---|
| `createGame(options, seat)` | seat = `me / them / random` (turn order, not color); shuffles + persists the bag, deals both racks |
| `joinGame(code)` / `cancelGame` / `challengeUser` / `respondChallenge` / `rematch` | ported from `@parlor/server` — semantics identical to hive §5.3 (challenge = open game addressed to a past opponent; rematch links + swaps who starts) |
| `submitMove(gameId, expectedMoveCount, move)` | `move` is the typed JSON `Move` (§2.4). Server reconstructs full state (public log + private doc), asserts turn + concurrency guard, runs `applyMove` (full verdict pipeline incl. dictionary), draws refill, writes: move doc + game doc (incl. `public`, counts, `lastPlay`, deadline) + caller's rack doc + private bag doc — one transaction — then pushes to the opponent |
| `resign(gameId)` | = hive |
| `forfeitExpired` *(scheduled, hourly)* | = hive (timeouts, expiry-warning pushes, stale-invite cull) |

Dropped from hive's list: `offerDraw`/`respondDraw` (§2.3).

**Move protocol** = hive's §5.3 protocol with one addition: after the optimistic
local apply, the client's **refill arrives via its rack-doc listener** rather than
being computable locally; the controller holds a "drawing…" placeholder on the rack
until the snapshot lands. Rejection ⇒ rollback + resync, exactly as hive.

### 6.4 Time controls & 6.5 local development

Identical to hive §5.4 (async deadlines v1, real-time clocks post-v1) and §5.5
(emulator suite runs everything; FCM payloads asserted in tests; two-window local
multiplayer against localhost). No lex-specific deltas beyond seeding fixture games
with pinned bag orders.

---

## 7. Frontend

### 7.1 Screens

Same map as hive §6.1 — Landing (themed hero: a board vignette spelling the
wordmark from real tile components), Lobby (challenges / your-turn / waiting /
finished groups; cards show scores + last play: "Sam played QUIZ +68"), New game
(opponent chip or invite link; **board picker** — classic/modern with a mini
premium-map preview; **dictionary picker** — labeled with name + word count;
turn order; time control; FR-6..9), Join (the game-summary card lists board,
dictionary, time control, and your seat — the invitee sees the rules before
accepting, FR-10), Settings (notifications, theme, tile skin), and Game (the
game menu restates the chosen options mid-game).

Game-screen deltas: player bars carry **scores** and a bag-count chip; the hand tray
is the **rack** (7 slots, drag-reorder, shuffle button); a **score sheet** drawer
replaces the move list (per-turn word + score + running totals); actions are
**Play / Recall / Exchange / Pass / Resign**; while `status:'open'` the same
waiting-screen treatment as hive (board withheld, invite re-shareable).

### 7.2 Board rendering & interaction (the UX core)

**DOM/CSS grid, not SVG** — a deliberate departure from hive §6.2, same goals:
crisp at any DPI, per-cell pointer events, CSS transitions, DOM-assertable in e2e.
Hive needed SVG for hex geometry and vector glyph art; lex tiles are **typography on
squares** (letter + point index), which DOM does better, and grid hit-testing is one
subtraction + division against the viewport transform — no geometric rounding at
all. The board renders `rows × cols` from the `BoardLayout` (§2.2); premium cells
are colored *and labeled* (DL/TL/DW/TW) so color is never the only signal.

- **Viewport:** the whole board auto-fits the screen (15 cols ≈ 25px cells on a
  phone — readable for orientation, not placement); **pinch/wheel zoom + pan**
  with the hive `BoardViewport` math ported to a CSS transform, including hive's
  hard-won pinch containment (gesture-event swallowing, touch-action pinning).
  Double-tap zooms to placement scale centered on the tap; a recenter/fit button
  matches hive's.
- **Interaction — drag with tap-tap fallback**, one controller state machine, both
  frontends (hive §6.2 model):
  1. *Idle, your turn:* rack tiles are draggable/selectable; board cells inert.
  2. *Drag a rack tile* over the board: the hovered cell highlights; empty cells
     only. Drop ⇒ the tile becomes a **pending placement** — visually lifted, gold
     edge, distinct from committed tiles in both themes. Drop off-board ⇒ returns
     to rack. Tap-tap: tap a rack tile, tap an empty cell.
  3. Pending tiles are freely movable/returnable (drag back, tap to bounce back,
     **Recall** returns all). Dropping a blank opens the letter-picker sheet.
  4. As placements change, the **live preview** updates: each formed word gets a
     chip (word + points, ✓/✗ from the local dictionary); the chips are the only
     score display (no separate total badge — it duplicated the main chip and
     obscured the board). Play is enabled only when `checkPlay` passes and
     all words are valid — pressing it submits optimistically (§6.3).
  5. **Exchange** flips the rack into multi-select (tiles dim/raise on tap) with a
     confirm bar ("Exchange 3 tiles — costs your turn"); disabled with a reason
     when the bag < 7. **Pass** confirms via dialog.
- **Remote plays animate in** tile-by-tile along the word; the opponent's last play
  stays highlighted (hive's last-move convention, green edge — distinct from the
  pending gold) and its score floats alongside. Both step aside while you have
  tiles staged so they never compete with the placement emphasis.
- Drag is raw pointer events, no dnd library — hive decision §9.8's reasoning
  transfers wholesale (touch first, transform-aware hit-testing, controller-testable
  without synthetic events).

### 7.3 Hot-seat privacy (pass-device mode)

Hot-seat (M3, `LocalTransport`) adds the one thing hive never needed: **racks are
secret between seats on one device**. After each turn ends, a full-screen
interstitial ("Hand the device to Sam — tap to see your rack") hides both racks
until tapped. The gallery captures it; the e2e drives through it.

### 7.4 End of game & victory screens

Hive §6.3's structure ported: a brief board beat (camera settles on the final play;
skip on resign/timeout), then the result overlay — headline + reason ("Played out!",
"Sam resigned", "Won on time", "Draw — 212 apiece"), the **score story** (final
scores with the end-adjustment line items: "+9 from Sam's rack" / "−4 unplayed"),
stats (moves, biggest word, duration), and Rematch / View board / Back to lobby.
Finished games reopen read-only with the score sheet, same as hive.

### 7.5 Art direction & 7.6 state management

- MUI chrome + custom theme, light/dark from day one — hive §6.4's system with a
  fraction of the asset burden: no glyph menagerie, just the **tile** (letter +
  point index, CSS-variable skin: classic cream / walnut / high-contrast — the
  institutionalized bear-mode seam), premium-cell palette, wordmark, and a small
  sprite sheet for motifs (star, result crown). PWA icons exported from the tile
  wordmark by the ported build script.
- State management identical to hive §6.5: TanStack Query + Firestore listener
  hooks; `GameController` as a plain class + `useSyncExternalStore`; no Redux.

---

## 8. PWA & notifications

Hive §7 applies nearly verbatim: `vite-plugin-pwa` (injectManifest, per hive's M5
learnings), offline read-only lobby via Firestore persistent cache, FCM Web Push
with data-only payloads + SW display + the **push-sync postMessage resync** fix,
iOS install coach mark, document-title and Badging API counts. Push triggers:
opponent played (copy includes word + score), game joined, challenge
received/accepted/declined, rematch offered, game over, deadline warning.

**Website integration:** lex becomes the second **external-link card** on
zackmfleischman.com's apps grid — the card variant hive's T6.6 builds (`externalUrl`
on `IApp`). By lex M6 that variant exists, so lex's PR is just a `store.yaml` entry
+ thumbnail (exported by the icon script); if hive hasn't landed T6.6 yet, lex M6
inherits that task as specified in hive DESIGN §7. Production domain:
**`lex.zackmfleischman.com`** via Firebase Hosting, same DNS/TLS flow as hive.

---

## 9. Decisions made on ambiguities (override any of these)

1. **Strict dictionary, no challenges, v1** — Words-with-Friends convention; right
   for casual friends-play. Challenge-mode is a post-v1 ruleset flag; the split
   verdict pipeline (§5.2) already accommodates it.
2. **Two public-domain word lists, chosen per game** — `enable1` (tournament-ish)
   and `2of12inf` (everyday words); licensing-clean, and the picker is real from
   day one. NWL/SOWPODS are registry entries away if the owner obtains them.
3. **Two players in v1, N-player engine** — lobby/invite flows are the 2-seat
   part; the engine is seat-indexed arrays from day one.
4. **No draw offers** — score ties are the natural draw; hive's offer flow would be
   dead weight. Resign stays.
5. **Typed JSON moves on the wire, GCG for fixtures/records** — blanks make GCG
   strings a lossy wire format; JSON is unambiguous and equals the storage format.
6. **Bag pre-shuffled at create + re-shuffled on exchange, server-side crypto RNG,
   engine fully deterministic** — hive's "randomness lives at the edges" rule
   adapted to hidden information (§3.3).
7. **Scoreless-turn limit = 6** (standard), counting passes, exchanges, and 0-point
   plays; prevents zombie async games the way hive's repetition rule does.
8. **DOM grid over SVG** for the board (§7.2) — typography-heavy tiles, trivial
   hit-testing; hive's viewport/pinch math ports anyway.
9. **The shared platform is the repo-level `parlor/` workspace from day one**
   (owner decision, superseding the earlier defer-extraction plan) — lex is its
   only consumer to start; hive migrates later. Mechanics + rationale in §4.
10. **Rematch swaps who starts**; turn order at create is me/them/random
    (default random) — the seat analog of hive's color pick.
11. **Same doc policy, same enforcement** as hive (IMPLEMENTATION §7): closed doc
    set, line budgets, DECISIONS.md as the only growing file, `check-docs.mjs`
    wired into typecheck.
12. **Named LEX** (owner-confirmed); nothing in the architecture depends on it.
13. **Board layout and dictionary are per-game options in v1** (owner
    requirement): v1 ships `classic` + `modern` layouts and both word lists;
    `dictionaryId` lives in `GameOptions`, not inside the `Ruleset`, so any
    board pairs with any list.

---

## 10. Testing strategy

Hive §8's layer table carries over with these substitutions:

| Layer | Lex-specific content |
|---|---|
| Engine unit | checkPlay geometry cases, scoring fixtures (premium stacking, cross-words, bingo, blanks), end adjustments, exchange/pass legality, GCG round-trips — the pinned list in IMPLEMENTATION §6 |
| Engine property | random legal games over injected bag orders: tile conservation across board+racks+bag, apply-never-throws, serialize/replay identity, **`playerView` never leaks hidden info**, scoreless-run bookkeeping, termination |
| Dictionary | DAWG lookup ≡ reference word-set on both full lists + fuzzed negatives; content-hash pins; registry metadata matches vendored files |
| Controller | pending-placement model, optimistic apply + rack-refill merge + rejection rollback, exchange selection, drag/tap state machine |
| Functions + rules | submitMove happy/illegal/concurrency paths, **rack/bag read-denial rules tests**, exchange privacy (public doc has count only), draw correctness, forfeit sweep |
| UI components | board/rack render from fixed states, preview chips, blank picker, pass-device flow |
| e2e (Playwright + emulators) | two-browser full game: create → invite → join → plays both ways → exchange → bingo → resign → rematch; reload-mid-game resume |

Self-validation harness (gallery, `validate:visual`/`ux`, mandatory screenshot
review against `e2e/visual-checklist.md`) is inherited as-is — it's ported code,
not reinvented process. Full harness spec and build protocol: IMPLEMENTATION.md.

---

## 11. Milestone map

Task-level breakdown, gates, and the frozen engine API live in
[IMPLEMENTATION.md](./IMPLEMENTATION.md). Estimates assume agent builders, matching
hive's actuals.

- **M0 — Scaffold (½ day).** The `parlor/` workspace + the lex workspace (five
  packages) with source-link wiring, CI for both, emulators, doc-lint — hive's
  M0 outputs copied wholesale. *Gate:* `validate:m0` in CI.
- **M1 — Engine core (2–3 days).** Ruleset data + registry (`classic` +
  `modern`), bag/draw, checkPlay, scoring, applyMove, end conditions, GCG,
  serialization, property suite. *Gate:* scripted full game replays to known
  final scores; property run clean.
- **M2 — Dictionaries (1–2 days).** Both lists vendored, DAWG build + loaders,
  registry metadata, engine integration, invalid-word fixtures.
  *Gate:* `validate:m2`.
- **M3 — Local game UI (3–4 days).** Grid board + viewport, rack, drag/tap,
  pending-placement UX with live preview, blank/exchange/pass flows, pass-device
  hot-seat with persistence, end-of-game sequence, **the whole validation harness**,
  static hot-seat PWA deploy. *Gate:* hot-seat e2e full game; visual review done.
- **M4 — Multiplayer backend (3–4 days).** Auth + landing, three-tier schema +
  rules (+ privacy rules tests), callables, invite/challenge/rematch, lobby,
  new-game flow with board/dictionary pickers, optimistic + refill
  reconciliation, two-browser e2e, multiplayer build + deploy workflow.
  *Gate:* `validate:m4`; a real game from two devices.
- **M5 — PWA + notifications + async (2–3 days).** Manifest/SW, push (all
  triggers, payloads asserted), badges, deadlines + hourly forfeit.
  *Gate:* `validate:m5`; real push on a phone.
- **M6 — Polish & ship (2–3 days).** Theme/tile-skin pass, dark + responsive
  audit, Lighthouse, production deploy + DNS, website card, a real game
  start-to-finish. *Gate:* full `pnpm validate`; a finished real game.

**v1.1 candidates:** challenge-mode ruleset · real-time clocks · 3–4 players ·
keyboard entry on desktop · game chat/emotes · AI opponent (`@lex/ai`, DAWG move
gen) · analysis/best-play review · hive's migration onto `parlor/` · `.gcg` export ·
more rulesets/word lists (11×11 quick board; NWL/SOWPODS if licensed).

---

## 12. Risks & mitigations

- **Scoring/legality edge cases** (premium stacking, blanks, endgame math) → the
  pinned fixture list (IMPLEMENTATION §6) + property tests; engine frozen behind
  its API like hive's.
- **Hidden-info leaks** → three-tier schema with *negative* rules tests; playerView
  leak property test; exchange letters never leave the server.
- **Client/server dictionary skew** → single package, id + content hash asserted on
  both sides.
- **Board readability at phone width** → fit-view is for orientation, placement
  happens zoomed; double-tap zoom; visual-checklist items pin legibility at both
  scales.
- **IP concerns if ever public** → layout/tileset/name are all data/config by
  requirement (§2.2); swapping to original values is a one-file change.
- **Divergence from hive's originals in `parlor/`** → provenance headers make
  fixes greppable to their twin (§4); goes away when hive migrates onto parlor.
- **Cross-workspace linking friction (parlor ↔ lex)** → one documented wiring
  (IMPLEMENTATION §1) with the vite/pnpm gotchas pre-solved in §8's lessons.
- **iOS push quirks, Firestore costs** → hive's mitigations inherited (coach mark,
  in-app badges; per-game docs).
