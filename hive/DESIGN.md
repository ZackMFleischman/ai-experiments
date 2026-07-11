# HIVE — Design Doc & Implementation Plan

A digital, two-player version of the board game **Hive** (with expansions), built as a
**PWA** so two people in different states can play each other **synchronously or
asynchronously** — the way chess apps offer both live games and "daily" correspondence
games.

> Hive is a trademark of Gen42 Games. This is a private, non-commercial project for
> personal play.

---

## 1. Goals & non-goals

### Goals (v1)

- **Two-player over the internet.** Create a game, send your friend an invite link, play.
- **Async or sync, seamlessly.** There is no mode switch: a game is just a shared state
  that updates in real time. If you're both online it feels live; if not, you get a
  notification when it's your turn and play whenever.
- **Expansions on by default.** Mosquito, Ladybug, and Pillbug, toggleable per game.
- **Great move UX.** Drag-and-drop tiles with clear affordances: which pieces can move,
  where they can legally land, snapping, and a tap-tap fallback for touch.
- **Turn awareness & notifications.** Push notifications ("Your move vs. Sam"),
  in-app "your turn" badges, app icon badge count.
- **Multiple concurrent games** per account, visible in a lobby list.
- **Responsive.** Same account and games from phone, iPad, or desktop.
- **Clean, modern, simple visuals.** Refined rather than elaborate. MUI + a small custom
  board aesthetic.
- **Robust.** Server-validated moves; a heavily tested rules engine; e2e coverage of the
  full two-client game loop.

### Non-goals (v1)

- No AI opponent (but the architecture must leave the door open — see §3).
- No ratings/ELO, matchmaking pools, or public lobby (invite links only).
- No spectators, chat, or game analysis/review tools.
- No native app store builds — PWA only.
- No monetization, no multi-tenant hardening beyond "don't let players cheat."

---

## 2. Rules scope

### 2.1 Base game

All one-hive movement/placement rules, per the official rulebook:

- **Placement:** new tiles must touch your own color only (except each player's first
  placement); White places first at origin, Black adjacent to it.
- **Queen rule:** the Queen Bee must be placed by each player's **4th** turn; no piece
  may *move* until that player's Queen is placed. Tournament opening rule: **the Queen
  may not be placed as a player's first tile** (on by default; per-game toggle).
- **One-Hive rule:** a move may never split the hive, even transiently (a piece that is
  a cut vertex of the hive graph cannot move).
- **Freedom to move (sliding):** a sliding step is legal only if the piece can physically
  slide through the gap (the "two-gate" check on the shared neighbors of the from/to
  cells), evaluated at the piece's height for beetles/climbing.
- **Piece movement:** Queen (slide 1), Spider (slide exactly 3, no backtracking),
  Ant (slide any distance), Grasshopper (jump in a straight line over ≥1 contiguous
  tiles), Beetle (step 1 in any direction, may climb on top of the hive; stacked tiles;
  a covered tile is frozen and its cell takes the beetle's color for placement rules).
- **Pass:** if a player has no legal placement or move, they must pass (the engine
  detects this; the UI offers only "Pass").
- **End:** a Queen surrounded on all 6 sides loses; both surrounded simultaneously is a
  draw. Draw offers and resignation are also supported (see §2.3).

### 2.2 Expansions (each a per-game toggle, all **on** by default)

- **Mosquito:** copies the movement ability of any adjacent piece for that move
  (adjacent mosquito-only ⇒ cannot move; while on top of the hive it moves as a beetle
  until it climbs down; copying a pillbug grants the toss ability).
- **Ladybug:** exactly two steps on top of the hive, then one step down.
- **Pillbug:** moves like a Queen, **or** (instead of moving) tosses an adjacent piece —
  friend or enemy — up over itself and down into an adjacent empty cell. Constraints:
  each toss step obeys freedom-to-move as a beetle-style climb, so only a gate **above
  ground level** (both gate cells stacked to height ≥ 2, the `canSlide` predicate)
  blocks it — a single ground-level tile never does; may not toss a stacked piece, a
  piece whose departure splits the hive, or the piece the opponent just moved; **a piece
  tossed by a pillbug last turn is stunned** — it may neither move, be tossed, nor use
  its own toss ability on the owner's next turn (so a pillbug tossed by the opponent's
  pillbug cannot toss). These "recency" rules are why the engine tracks `lastMoved`
  state (§4.2).

### 2.3 Meta rules

- **Resign** and **offer draw / accept draw** (chess-style), available any time on your turn
  (resign any time).
- **Threefold repetition** of position with the same player to move ⇒ automatic draw
  (keeps async games from deadlocking; positions hashed by the engine).
- **Time controls** (see §5.4): per-move async deadlines in v1 (e.g. 3 days/move, with
  timeout ⇒ loss); real-time chess clocks are a fast-follow (v1.1), not v1.

### 2.4 Notation

Moves are serialized in **UHP (Universal Hive Protocol) notation** — e.g. `wS1 bG1/`,
`bA2 wQ-` — the community-standard format used by Hive engines (Mzinga et al.).
Benefits: human-auditable game records, cross-checkable rule test vectors, and a free
integration path for AI engines later. Game state is reconstructable from
`options + move list` alone; that list is the source of truth (§5.2).

Meta actions (resign, draw offer/accept/decline, timeout) are **not** UHP moves —
UHP stays pure board notation. They are recorded as typed entries interleaved in the
same move log (§5.2), so `options + log` still reconstructs everything, including
how a game ended.

One notation subtlety, decided now so the engine encodes it consistently: a UHP move
string doesn't say *whether a piece moved itself or was tossed by a pillbug*, but the
engine must know (toss ⇒ the moved piece is stunned). The `Move` type distinguishes
them; when both interpretations of a string are legal, serialization and parsing
canonicalize to **self-move**. This is a pinned edge-case fixture (see
`IMPLEMENTATION.md` §fixtures).

---

## 3. Architecture

### 3.1 Principle: the game is a library, the app is a client

The rules engine is a **pure TypeScript package with zero dependencies** — no React, no
Firebase, no DOM. It is consumed identically by the web UI, the server-side move
validator, tests, and (later) an AI player. Swapping the UI, or adding an AI, never
touches the engine.

```
hive/
├── DESIGN.md                  # this document
├── package.json               # pnpm workspace root (independent workspace)
├── packages/
│   ├── engine/                # @hive/engine — pure rules kernel (zero deps)
│   │   └── src/
│   │       ├── hex.ts         # axial coords, neighbors, rotation math
│   │       ├── state.ts       # GameState, immutable update helpers
│   │       ├── bugs/          # one module per bug (open/closed: add a file to add a bug)
│   │       ├── rules.ts       # one-hive, freedom-to-move, queen rule, placement
│   │       ├── engine.ts      # legalMoves(state), applyMove(state, m), result(state)
│   │       ├── uhp.ts         # UHP notation parse/serialize
│   │       └── zobrist.ts     # position hashing for repetition detection
│   ├── app/                   # @hive/app — React + MUI + Vite PWA
│   │   └── src/
│   │       ├── screens/       # Lobby, Game, NewGame, Join, Settings, SignIn
│   │       ├── board/         # SVG board, tile sprites, drag-drop layer
│   │       ├── controller/    # GameController: mediates engine ↔ UI ↔ sync
│   │       └── sync/          # Firestore adapter behind a GameTransport interface
│   └── functions/             # @hive/functions — Cloud Functions (move validation, push)
└── e2e/                       # Playwright: two-browser full-game tests
```

### 3.2 The three layers

1. **Model (`@hive/engine`).** `GameState` is an immutable value. The engine exposes a
   small, total API:
   - `initialState(options): GameState`
   - `legalMoves(state): Move[]` (always correct and exhaustive — the UI *only* renders
     what this returns; it never computes legality itself)
   - `applyMove(state, move): GameState` (throws on illegal input)
   - `result(state): Ongoing | WhiteWins | BlackWins | Draw`
2. **Controller (`@hive/app/controller`).** Owns the client-side game session: holds the
   authoritative state received from sync, computes *derived* UI state (selected piece,
   legal-target set, animation queue), applies **optimistic local moves**, and reconciles
   when the server confirms/rejects. Talks to the network through a `GameTransport`
   interface (`submitMove`, `onRemoteMove`, `onClockEvent`) so the Firebase adapter is
   swappable.
3. **View (`@hive/app`).** React + MUI. Purely renders controller state and forwards
   intents (drag started, dropped on cell, resign clicked). No rules knowledge.

### 3.3 Open/closed seams (explicit, so we don't regress them)

- **New bug types:** a bug is a module implementing
  `moves(state, from): Move[]` registered in a bug table; Mosquito composes others.
  Adding a hypothetical new expansion piece = one new file + tests.
- **AI player later:** an AI is just another producer of `Move` given `GameState` —
  exactly the engine's public types. A future `@hive/ai` package (or a UHP-speaking
  external engine) plugs into the controller as an alternate "opponent transport"
  with zero engine/UI changes.
- **UI swap:** everything under `app/` can be replaced; `engine/` has no imports from it.
- **Backend swap:** only `app/src/sync/` (through the `@parlor/web` platform
  layer) and `functions/` know Firebase exists.

---

## 4. Rules engine design

### 4.1 Board representation

- **Axial hex coordinates** `(q, r)`, pointy-top orientation, with a **stack** per
  occupied cell (`Tile[]`, bottom→top) to model beetles/mosquitos climbing.
- Board is a `Map<CellKey, Tile[]>` — sparse and unbounded (Hive has no board edge).
- The **view** maps axial → pixel; the engine never deals in pixels.

### 4.2 GameState (engine-side)

```ts
interface GameState {
  options: GameOptions            // expansions on/off, tournament opening rule
  board: ReadonlyMap<CellKey, readonly Tile[]>
  hands: { white: BugCounts; black: BugCounts }   // unplaced tiles
  toMove: Color
  turn: number                     // full-turn counter per player (queen-by-4 rule)
  lastMoved?: { tile: TileId; byPillbug: boolean } // pillbug stun/recency rules
  passCount: number
  positionHashes: readonly bigint[]                // repetition detection
}
```

### 4.3 Algorithms (the interesting parts)

- **One-Hive:** articulation points of the occupancy graph (Tarjan / iterative DFS,
  recomputed per `legalMoves` call — hives are ≤ 28 tiles, so O(V+E) is trivially fast).
  Stacked cells are never articulation-blocked (removing the top of a stack can't split
  the hive).
- **Freedom to move:** the classic two-neighbor gate test, generalized by height so the
  same predicate serves ground slides, beetle climbs (up/down), and pillbug tosses.
- **Spider/Ant:** DFS/BFS over slide-steps around the perimeter with visited-set
  (spider exactly depth 3 without revisits; ant closure).
- **Grasshopper:** ray-walk per direction over ≥1 occupied cells.
- **Mosquito:** union of adjacent pieces' move generators, with the "on top ⇒ beetle"
  and "mosquito-only ⇒ stuck" special cases.
- **Repetition:** Zobrist hashing over (cell, stack-slot, tile) plus side-to-move.

Everything above is pure-function territory and gets exhaustive unit + property tests
(§8) — this package is where the project's "robust" requirement mostly lives.

---

## 5. Backend

### 5.1 Choice: **Firebase** (Auth + Firestore + Cloud Functions + FCM + Hosting)

Decision drivers: fastest path to "two people playing tonight," and each hard
requirement maps to a managed primitive —

| Requirement | Firebase primitive |
|---|---|
| Realtime sync (live play "for free") | Firestore `onSnapshot` listeners |
| Async play | …the same listeners; state persists, clients come and go |
| Push notifications to a PWA | FCM Web Push |
| Accounts across devices | Firebase Auth (Google sign-in) |
| No server to run/patch | Cloud Functions only for move validation + notifications |
| Scale later | Firestore scales horizontally; the data model (per-game docs) shards naturally |
| Cost | Free tier covers two players indefinitely, and dozens of casual players |

The engine being pure TS is what makes this cheap: the **same `@hive/engine` package
runs inside the Cloud Function** to validate moves server-side. No rules duplication.

### 5.2 Data model (Firestore)

```
users/{uid}:            { displayName, photoURL, fcmTokens: string[], settings }
games/{gameId}:         { players: {white: uid, black: uid|null},
                          playerNames: {white, black},       // denormalized (users/* is private)
                          playerIds: uid[],                  // array field for lobby indexability
                          options,                            // expansions + timeControl (the create payload)
                          status: 'open'|'active'|'finished',
                          inviteCode?: string,                // present while open (re-share from the game screen)
                          challenge?: {from, fromName, to, toName}, // direct challenge while open (no invite;
                                                              //   both uids in playerIds from creation)
                          result?: 'white'|'black'|'draw',
                          endedBy?: 'surround'|'resign'|'timeout'|'draw-agreed'|'repetition',
                          toMove, turn, moveCount,
                          activatedBy?: uid,                  // who made it active (accepted/joined/offered
                                                              //   rematch) — fresh-game badge until move 1 (§7)
                          pendingDrawOffer?: 'white'|'black', // cleared by any move or decline
                          rematchOf?: gameId, rematchGameId?: gameId, // return-game links (idempotent rematch)
                          timeControl?: {days: 1|3|7} | null, // async clock setting (§5.4)
                          deadlineAt?: Timestamp, deadlineWarnedAt?: Timestamp,
                          updatedAt, createdAt,
                          state: string }                     // engine serializeState snapshot (fast load)
games/{gameId}/moves/{n}: { n, kind: 'move'|'pass'|'resign'|'draw-offer'|'draw-accept'
                               |'draw-decline'|'timeout',
                            uhp?: string,                     // present iff kind is move/pass
                            by: uid, at: Timestamp }
invites/{code}:          { gameId, createdBy, hostName, hostSeat: 'white'|'black', options,
                           expiresAt }                       // join screen renders from this alone
```

- **The move log is the source of truth** — UHP moves *and* meta events in one
  ordered collection; the `state` snapshot on the game doc is a denormalized cache so
  clients render instantly without replaying (and gets regression-checked against
  replay in tests).
- Lobby query = `games where playerIds array-contains myUid and status == 'active'
  order by updatedAt desc` (composite index committed in `firestore.indexes.json`);
  the "your turn" / "waiting" grouping is client-side.
- Stale invites (expired, game never joined) are culled by the same scheduled
  function that forfeits timeouts (§5.4).

### 5.3 Game API (server-authoritative callables)

Clients get **no direct write access to `games/*` or `invites/*`** — every game
mutation is a callable Cloud Function validating with the same `@hive/engine`
package. This is the "can't cheat" property, and also the scaling story — the
functions are stateless. The only client-writable doc is your own `users/{uid}`
(profile + FCM tokens), enforced by security rules; game docs are readable only by
their two players, invites by anyone holding the code.

All the callables marked ⬡ are `@parlor/server` shells shaped by hive's
`GameServerConfig` (seat keys `white`/`black`, option validation, fresh state).
The create/challenge payloads match parlor's shape — the color choice rides
`seat`, the time control rides inside `options`, and the invite records
`hostSeat`. Two shells take a heavier game injection: `submitMove` is
`createSubmitMove` (the shared shell owns auth / envelope / preconditions /
concurrency guard / moveCount + deadline bookkeeping / `pendingDrawOffer` clear /
push; hive injects `advance`, which runs the engine over the serialized state),
and the draw offers are `createDrawCallables` — an opt-in capability keyed on
seat that hive includes and lex does not (hive overrides only the offer push
copy). Push copy + the color-based turn test are injected into `@parlor/server`'s
shared notify/forfeit machinery; the forfeit *sweep* itself stays hive's (it
reads the engine `toMove`, not a seat key).

| Callable | Does |
|---|---|
| `createGame(options, seat)` ⬡ | creates the game (`status:'open'`) + invite code; returns both |
| `joinGame(code)` ⬡ | transactionally claims the open seat, activates the game, expires the invite |
| `cancelGame(gameId)` ⬡ | creator withdraws an *open* game: deletes the game + its invite |
| `challengeUser(opponentUid, options, seat)` ⬡ | creates an open game addressed to a past opponent (no code); pushes the challenge |
| `respondChallenge(gameId, accept)` ⬡ | challenged player only: accept seats them + activates; decline deletes the game |
| `submitMove(gameId, expectedMoveCount, uhpMove)` ⬡ | the move protocol below (`createSubmitMove` shell + hive's engine `advance`) |
| `resign(gameId)` ⬡ | ends the game; records the `resign` meta event |
| `offerDraw(gameId)` / `respondDraw(gameId, accept)` ⬡ | `createDrawCallables` (opt-in): sets/clears `pendingDrawOffer`; ends game on accept |
| `rematch(gameId)` ⬡ | creates the colors-swapped return game linked via `rematchOf`; pushes the offer |
| `forfeitExpired` *(scheduled, hourly)* | forfeits past-deadline games, sends expiry-warning pushes, culls dead invites |

**The move protocol:**

1. Client computes legal moves locally (instant UX), player drops a tile.
2. Controller applies the move **optimistically** and calls the `submitMove` callable
   Cloud Function with `(gameId, expectedMoveCount, uhpMove)`.
3. Function transactionally: loads game → replays/loads state → asserts it's the
   caller's turn and `expectedMoveCount` matches (optimistic-concurrency guard) →
   validates via `engine.applyMove` → writes the move doc + updated snapshot +
   `deadlineAt` → queues a push to the opponent.
4. All clients converge via their snapshot listeners; if validation failed (should be
   impossible unless clients desync), the controller rolls back and resyncs.

### 5.4 Time controls

- **v1 — async ("correspondence"):** per-game setting of `1 / 3 / 7 days` per move or
  `none`. `deadlineAt` stamped on every move; a scheduled function (hourly) forfeits
  expired games and sends a "you timed out" / "about to expire" nudge push.
- **v1.1 — real-time clocks:** chess-style `base + increment` stored as
  `{remainingMs, lastMoveAt}` per player, settled server-side on each move; client
  renders a ticking clock from those two values (no server ticking needed). Deferred
  because it needs presence/abandonment handling to feel fair — and untimed live play
  already works in v1 via realtime sync.

### 5.5 Local development: the whole backend runs on your machine

Cloud Functions don't mean cloud-only development — the **Firebase Emulator Suite**
runs Auth, Firestore, and Functions locally, so the entire networked game flow is
testable with zero cloud resources:

- `pnpm dev` starts Vite **and** `firebase emulators:start`, auto-seeded from a
  committed fixture export; in dev mode the app connects to the emulators instead of
  production automatically.
- The Auth emulator mints fake users — open two browser windows as "you" and "your
  friend" and play a full networked game entirely against localhost. The Emulator UI
  (localhost:4000) shows every Firestore doc and function log live.
- `submitMove` and the forfeit job run in the Functions emulator with hot reload; the
  hourly scheduler is fired manually in tests (no waiting an hour to test timeouts).
- CI runs the function tests and the Playwright two-browser e2e against a fresh
  emulator instance per run — deterministic, free, no cloud credentials involved.

Two things the emulators can't do, and how they're covered:

- **Real push delivery** (there is no FCM emulator): function tests assert the exact
  messaging payloads the code sends (mocked transport); actual device push is a
  manual check against production during M5 — that's platform behavior, not our logic.
- **Real Google OAuth:** the Auth emulator fakes the flow (a feature — no test
  accounts to manage); the real provider gets exercised on first production sign-in.

Below all of this sits M3's hot-seat mode: because of the `GameTransport` seam, the
full game UI also runs against a purely in-memory transport — no backend, no
emulator, useful for UI iteration.

### 5.6 Setup, deployment & environments

**One-time setup (you, ~30 minutes, mostly in the Firebase console):**

1. Create a Firebase project; enable **Authentication → Google provider** and
   **Firestore**.
2. Upgrade the project to the **Blaze plan** — required for Cloud Functions. Blaze
   still includes all free-tier allowances; friends-scale usage rounds to $0/month,
   but set a budget alert (e.g. $5) as a tripwire.
3. Register a Web App and drop its config values into `packages/app/.env` (these are
   public identifiers, safe to commit).
4. Cloud Messaging → generate the Web Push (VAPID) key pair.
5. For CI deploys: create a deploy service account, add its key as a GitHub Actions
   secret.

Everything else lives in the repo (`firebase.json`, `.firebaserc`, rules, indexes) —
a fresh machine needs only `pnpm install` and `firebase login`.

**Deploying** is one idempotent command: `firebase deploy` ships Hosting (the built
PWA), Functions, and Firestore rules/indexes together. CI runs it on every merge to
main; a manual deploy from your laptop works identically.

**Preview environments:** every PR gets a **Firebase Hosting preview channel**
(`pr-<n>`, auto-expiring, URL posted as a PR comment). Channels preview the *frontend* against the production backend,
which covers the common case of UI-only PRs; backend-touching PRs (functions, rules,
schema) are instead validated by the emulator-based e2e suite in CI and go live on
merge. If that ever feels risky, the escape hatch is a second `hive-staging` Firebase
project behind a `.firebaserc` alias — the code is project-agnostic.

**Domain:** production lives at **`hive.zackmfleischman.com`** via Firebase Hosting's
custom-domain flow (one DNS record; TLS cert auto-provisioned). How it relates to
your apps page: see the end of §7.

---

## 6. Frontend

### 6.1 Screens

| Screen | Purpose |
|---|---|
| **Landing / sign in** | A **themed** full-bleed landing, not a bare button: hive-cluster hero rendered by the real board renderer from a fixed decorative state (with a subtle idle float animation), HIVE wordmark, one-line tagline, Google sign-in button. This is also the first thing an invited friend sees, so it carries the visual identity. Signed-in users skip straight to the lobby. |
| **Lobby (home)** | Your games grouped: **Challenges** (incoming direct challenges, accept/decline on the card — both badged like your-turn games), **Your turn** (badged), *Waiting on opponent* (outgoing challenges here, chipped "Challenge sent"), plus finished games below (with win/loss/draw result chips). Each card: opponent, mini board thumbnail, last-move time, deadline countdown if any. FAB → New game; a **Join with a code** entry routes typed codes to `/join/{code}`; a gear links to Settings. |
| **New game** | Pick your opponent when you have past opponents — a friend chip sends a **direct challenge** (`challengeUser`, no code) and jumps straight to the game; default stays "invite link". Then color (white/black/random), expansions toggles (default all on), tournament-opening toggle, time control. Link games show/copy the **invite link and code** (both stay retrievable on the game screen while open). |
| **Join** | Landing route for invite links (`/join/{code}`): same themed layout as the landing screen with a game-summary card and one accept button (routes through sign-in if needed). The code can also be typed by hand from the lobby. |
| **Game** | While `status:'open'`: a waiting screen — the shareable invite (link + code), or for direct challenges the challenge status (challenger) / an accept-decline card (challenged; push taps land here) — the board is withheld so no move can be attempted before the opponent joins. Once active: the board (§6.2), player bars (name, "(you)" seat marker, a **Your turn / Their turn** chip, queen-liberties indicator, clock/deadline), your **hand** of unplaced tiles as a dockable tray, move list drawer, and Resign / Offer draw / Pass actions in an overflow menu. An empty board shows a first-placement hint; long-pressing a piece you *can't* move (or hovering any) names it and states its move — draggable pieces never grow a card over their drop targets. The piece guide hosts the bear-mode toggle, so art switches mid-game. Ends in the victory sequence (§6.3). |
| **Settings** | Notifications opt-in state, theme (light/dark/system), sign out. |

Routing: React Router; every screen is a URL (`/game/{id}`) so notification taps and
multi-device resume deep-link correctly.

### 6.2 Board rendering & interaction (the UX core)

**SVG, not canvas.** A hive is ≤ 28 tiles + ≤ 30 highlight cells — trivially cheap in
SVG, and we get crisp vector art at any DPI, native pointer events per tile, CSS
transitions, and easy testability (DOM assertions in e2e) for free.

- **Pan/zoom** via pointer + wheel/pinch on the SVG viewport, with a "recenter" button;
  auto-fit on load and after moves that grow the hive.
- **Interaction model — drag with tap fallback**, both driven by the same controller
  states so behavior is identical:
  1. *Idle:* all pieces with ≥1 legal move get a subtle "movable" affordance (slight
     lift/shadow). Opponent pieces are inert (except as pillbug-toss targets, which
     highlight when the pillbug is selected).
  2. *Pick up* (pointer-down + drag, or tap): the piece lifts, and **all legal target
     cells render as ghost hexes** (empty-cell outlines, or "climb" badges on occupied
     cells for beetles). Everything else dims ~20%.
  3. *Drag over a target:* the target hex fills, the tile **snaps** its preview to the
     cell; over a non-target the tile follows the pointer with a "not allowed" tint.
  4. *Drop* on a target ⇒ optimistic move + settle animation. Drop elsewhere (or Esc)
     ⇒ spring back. Tap-mode: tap a highlighted cell to move, tap elsewhere to cancel.
  5. Placement works the same way, dragging from the hand tray; the tray shows remaining
     counts per bug and disables bugs with no legal placement (queen pulses when
     "must place queen" is active).
- **Stacks** render with an offset-and-shadow so height is readable at a glance; tapping
  a stack you can't lift fans it out to inspect what's buried, while a stack whose top you
  *can* move is picked up by a tap and peeked with a long-press. Acting on the board
  (select, move, tap-away) collapses the fan; it is pure inspection and never a move.
- **Last move** stays highlighted (from/to). Remote moves animate in.
- Drag implemented with raw **pointer events** on the SVG layer (not a dnd library —
  HTML5 DnD is wrong for touch, and dnd-kit fights SVG coordinate spaces; the math is
  ~a screenful of code against the axial↔pixel helpers).

### 6.3 End of game & victory screens

Losing a Hive game means *watching your queen get surrounded* — the ending should land
as a moment, not a modal that teleports in.

- **The beat.** When `result(state)` flips to a win, the board auto-centers on the
  surrounded queen, the six surrounding tiles pulse once, and there's a ~1s pause
  (tap to skip) before the overlay appears — the loser gets to see the position.
  Endings by resignation or timeout skip the board beat and go straight to the overlay.
- **Result overlay** — full-screen sheet on phones, centered card on tablet/desktop:
  - Headline + reason, themed per outcome: *"Queen surrounded!"*, *"Sam resigned"*,
    *"Draw — threefold repetition"*, *"Won on time"*. Victory/defeat/draw each get a
    distinct (but restrained) color/tone treatment.
  - Hero art: the winning color's queen tile rendered large by the board renderer —
    same sprite system as the game (§6.4), no bespoke raster art.
  - A stats line: move count, and duration (elapsed days for async games).
  - Actions: **Rematch** (creates the return game with colors swapped and pushes a
    rematch offer to the opponent), **View board** (dismisses the overlay to inspect
    the final position, leaving a persistent result banner), **Back to lobby**.
- Finished games stay openable from the lobby (result chip on the card); opening one
  shows the final position with the result banner, and the overlay can be re-opened.
- Resigning and accepting a draw confirm via a small dialog first (no accidental
  resigns on touch), then flow into the same overlay.

### 6.4 Art direction & asset pipeline

- **MUI** for all chrome (app bar, cards, drawers, dialogs) with a custom theme:
  one accent color, generous whitespace, rounded MUI defaults — clean and unfussy.
  Light + dark from day one (board palette swaps with the MUI theme).
- **One asset source of truth:** `app/src/assets/hive-sprites.svg` — an SVG sprite
  sheet with a `<symbol>` per asset, rendered everywhere via `<use href="#bug-queen">`:
  - the **8 bug glyphs** (Queen, Ant, Spider, Grasshopper, Beetle, Mosquito, Ladybug,
    Pillbug) — flat, geometric, single-path marks on a fixed 100×100 grid with a
    consistent stroke weight, readable at 40px;
  - the **8 bear glyphs** (bear mode, a Settings reskin): one bear species per
    piece in the same mark system, resolved per-render by `board/pieceArt.tsx` —
    rules and engine never see the art choice;
  - the **hex tile base** (cream/charcoal variants matching the physical game's
    white/black tiles), the ghost/target hex, and small motifs (result-chip crown,
    empty-state tile).
  - Glyphs use `currentColor` plus one CSS variable, so player color, light/dark
    theme, and dimmed/highlight states are pure CSS — no duplicated assets.
- **How other screens get their art: composition, not illustration.** The landing
  hero, join screen, victory hero, and lobby thumbnails are all the *board renderer*
  pointed at fixed or real states — decorative hive clusters and big single tiles
  built from the same sprites. One visual language across every screen, and zero
  bespoke-illustration maintenance.
- **Authoring plan:** M3 ships a serviceable draft glyph set (circle/arc geometry —
  good enough to play with); the M6 polish pass refines the drawings. Because
  everything references the sprite sheet, the art pass touches exactly one file.
- **Raster only where the platform demands it:** PWA icons, maskable icon, and the
  notification badge are exported from the queen glyph by a build script — never
  hand-maintained PNGs.
- Subtle motion only: lift, snap, settle, and the §6.3 end-of-game beat. No particle
  nonsense.

### 6.5 State management

- Server/cache state (auth, game docs, snapshots): **TanStack Query** + thin Firestore
  listener hooks.
- Per-game session state: the **GameController** (a plain class + `useSyncExternalStore`),
  keeping React components dumb.
- No Redux; there isn't enough shared mutable state to justify it.

---

## 7. PWA & notifications

- **Manifest + service worker** via `vite-plugin-pwa`: installable on iOS/Android/
  desktop, offline app-shell (lobby renders cached games read-only when offline;
  moves require connectivity — offline move queuing is post-v1).
- **Push:** FCM Web Push. On grant, token stored on `users/{uid}.fcmTokens[]`
  (multi-device). Cloud Function sends on: opponent moved, game joined, challenge
  received/accepted/declined, draw offered, game over, deadline warning. Tap ⇒
  deep-link to `/game/{id}`.
  - iOS requires the PWA to be installed to Home Screen for Web Push (iOS 16.4+) —
    the app detects this and shows a one-time "install to get notified" coach mark.
- **In-app awareness** (works even with push denied): lobby "your turn" section +
  per-game badges, document title `(2) HIVE`, and app **icon badge** via the Badging API
  where supported. Every push also carries the recipient's fresh actionable count
  (`badge`: your-turn games, incoming challenges, and games the opponent just activated —
  accepted invite/challenge or rematch offer — until white's first move); the service
  worker applies it via `setAppBadge`, so the installed icon (iOS 16.4+) stays current
  while the app is closed.

**The zackmfleischman.com apps page — link out, don't iframe.** The site's apps
infrastructure (`PersonalWebsite/src/ts/Apps/`) is built around iframe embeds: every
`IApp` has a required `embedUrl`, and `/apps/{slug}/` renders it in `AppEmbed`'s
`<iframe>`. Hive must **not** ride that path — embedding would break exactly the
features this project is built around:

- **PWA install only works in a top-level browsing context** — browsers ignore the
  manifest inside iframes, so "install to home screen" (which iOS *requires* for web
  push) becomes unreachable.
- **Cross-origin iframes get partitioned storage and restricted permission prompts**
  in Safari and Chrome — Firebase Auth sessions won't persist reliably, and the
  Notification permission request is blocked or ignored from inside a frame.
- The board's pan/zoom gestures would fight the host page's scrolling at the frame
  boundary.

Instead, hive becomes the apps grid's first **external-link card** — a small,
additive variant of the existing card. The concrete PR against `PersonalWebsite`:

- `src/ts/Redux/IModels.ts` — make `embedUrl` optional on `IApp` and add
  `externalUrl?: string`; a card carries exactly one of the two.
- `src/ts/Apps/AppsGrid.tsx` — in `_renderCard`, when `externalUrl` is set render an
  `<a href={externalUrl} target="_blank" rel="noopener noreferrer">` in place of the
  internal `<Link>`, reusing the same `app-card-*` styles, plus a small ↗ affordance
  so the outbound behavior is legible.
- `src/ts/Apps/AppEmbed.tsx` — guard: a hand-typed `/apps/hive/` URL for an
  external-only app redirects out (`window.location.replace(externalUrl)`) instead of
  rendering an empty frame.
- `configs/store.yaml` — the hive entry under `apps:` (name, description,
  `externalUrl: https://hive.zackmfleischman.com`, tags, thumbnail).
- Thumbnail: the hive-cluster hero (§6.4) exported by hive's icon build script as a
  static image committed to `assets/images/hive-card.png` — no live coupling. If you
  want it to feel alive later, a "current board snapshot" image endpoint is a small
  post-v1 function.

Idiom warning for that PR: PersonalWebsite is webpack 4 / React 16.6 (**pre-hooks**)
class components with tslint — match the existing patterns, don't modernize in
passing.

The two deploys stay fully independent: the website is GitHub Pages behind
`www.zackmfleischman.com` (CNAME); hive is Firebase Hosting behind one new
`hive.zackmfleischman.com` DNS record. Same domain family, so the card still reads
as part of your site, and once the PWA is installed the link opens straight into the
installed app. The website PR ships during M6, alongside hive's production deploy.

---

## 8. Testing strategy

| Layer | Tool | What it proves |
|---|---|---|
| Engine unit tests | Vitest | Every bug's move generation against hand-built positions, incl. published edge cases (gates, pillbug stuns, mosquito-on-top, spider backtrack bans, queen-by-4, forced pass) |
| Engine property tests | fast-check | Invariants over random legal games: one-hive never violated, `legalMoves ∘ applyMove` never throws, replay(moves) ≡ snapshot, hash stability |
| UHP fixtures | Vitest | Parse/serialize round-trips; full recorded games replay to the expected result |
| Controller tests | Vitest | Optimistic apply + rejection rollback, transport mocking, drag state machine transitions |
| Function tests | Vitest + Firebase emulator | submitMove happy path, turn enforcement, concurrency guard, timeout forfeits |
| UI component tests | Vitest + Testing Library | Tray/board render from fixed states, tap-mode move flow |
| **e2e** | Playwright + Firebase emulator suite | Two browser contexts play a full scripted game: create → invite → join → moves both ways → notification doc written → resign; plus a reload-mid-game resume test |

CI (GitHub Actions): typecheck + all unit layers on every push; e2e on PRs to main.
The **engine is the coverage priority** — it's the part where a bug silently ruins a
game three days later.

### Self-validation for agent builders (correctness *and* look-and-feel)

This project will be built largely by coding agents, so every milestone must be
verifiable without a human watching — including the visual/UX half:

- **Machine gates.** Each milestone N ships a `pnpm validate:mN` script (the house
  pattern) that runs its acceptance criteria end-to-end; `pnpm validate` chains them
  all. A milestone is not done while its gate is red.
- **Fixture gallery.** The app ships a dev-only `/dev/gallery` route rendering a
  registry of named states: mid-game boards (replayed from UHP fixtures), every
  screen, and every interaction state (piece lifted with ghost targets, stack fanned,
  drag-over-invalid tint, victory overlay per outcome, empty lobby, …). `?static=1`
  freezes animations and hides nondeterministic text (timestamps, names) so captures
  are reproducible.
- **`pnpm validate:visual`.** Playwright walks the gallery and captures every entry
  at three viewports (390×844 phone / 1024×768 tablet / 1440×900 desktop) in light
  **and** dark to `artifacts/screens/`, machine-checking console cleanliness, that
  every sprite `<use>` resolved (non-empty bbox), and that the board fits its
  viewport. `pnpm validate:ux` additionally scripts the §6.2 drag and tap-tap flows
  and captures before/during/after frames.
- **The agent must then look.** Captured screenshots are reviewed against the
  committed checklist `e2e/visual-checklist.md` (tile readability at minimum zoom,
  glyph distinguishability, ghost-target visibility in both themes, ≥44 px touch
  targets, overlay hierarchy, safe-area clearance, …) by actually reading the
  images. A screenshot generated but never read is not validation. Each finding is
  either fixed or recorded in the checklist as an accepted deviation.

The full harness spec and the per-task build protocol live in `IMPLEMENTATION.md`.

**Backend portability of the suite:** only the bottom two rows touch the Firebase
emulator, and they're kept swappable on purpose:

- Everything above them (the bulk of the suite) is pure TS or mocked-transport —
  a backend migration doesn't touch it.
- The function tests and e2e assert *backend-agnostic behavior* (turn enforcement,
  concurrency guard, legality rejection, timeout forfeit, full-game flow through the
  UI); the scenarios survive a swap — only the setup does not.
- All emulator-specific code (boot, seed, reset, fake-auth users) lives in a single
  shared **`test-harness` module** that the function tests and Playwright both
  import; migrating backends means rewriting that module and the thin function
  wrappers, not the specs. The `submitMove` core is `engine.applyMove` + a
  transaction, so the validation logic itself ports as-is.

---

## 9. Decisions made on ambiguities (override any of these)

Per your instruction, I decided these myself, optimizing for "you two playing ASAP":

1. **Backend = Firebase** (over Supabase or a custom Node/WebSocket server). Rationale
   in §5.1; the custom-server option loses on push notifications + ops burden, Supabase
   loses on Web Push integration and realtime maturity for this shape. The
   `GameTransport` seam keeps it swappable if you outgrow it.
2. **Auth = Google sign-in only** for v1. You both have Google accounts; skips password
   reset/email verification entirely. Easy to add other providers later.
3. **All three expansions** (Mosquito + Ladybug + Pillbug) default **on**, each
   toggleable per game; tournament opening rule (no queen first) default on.
4. **Invite links + direct challenges** — no public lobby or matchmaking. A game is
   created open for a link/code join, or addressed to a past opponent as a challenge
   (§5.3); people you've played are the only "friend list".
5. **Async time controls in v1; real-time clocks in v1.1.** Untimed live play works in
   v1 by nature of realtime sync (see §5.4 for why clocks are deferred).
6. **Resign + draw offers in v1; takebacks post-v1** (mutual-consent takeback is easy
   later — truncate the move list — but it's scope, not core).
7. **Server-authoritative moves via Cloud Function** rather than trusting clients +
   security rules. Slightly more code, but it's the only honest way to enforce turn
   order and legality, and it reuses the engine as-is.
8. **SVG board, custom pointer-event drag** (no dnd library, no canvas). This is less
   "rolling our own DnD" than it sounds — the drag itself is trivial; the hard part is
   *hit-testing a zoomable hex grid*, which no library does for us:
   - HTML5 drag-and-drop is a non-starter: it doesn't work on touch, and iPad is a
     primary device.
   - Pointer-based libraries (dnd-kit et al.) model drop targets as DOM elements
     hit-tested by **bounding rect**. Hexagons' bounding boxes overlap their
     neighbors', so rect hit-testing misdrops near cell edges — exactly where players
     drop. Rects are also measured at drag start, so pan/zoom mid-drag (pinching with
     the other hand) silently invalidates them.
   - The correct "which cell is the pointer over" on a hex grid is one closed-form
     formula (pixel → fractional axial → cube-round), using the same axial↔pixel
     helpers the renderer already needs. A library would sit *on top of* that math,
     not replace it — all cost, no lift.
   - Drag and tap-tap are two input frontends on the same controller state machine
     (§6.2), so the whole interaction is testable at the controller layer without
     synthesizing drag events.
   - Reconsider if we ever add HTML-to-HTML drags (e.g. reordering lists) — that's
     dnd-kit's home turf, and it can coexist with the board's pointer handling.
9. **UHP notation** for the move log (free test vectors now, free AI/engine interop later).
10. **Separate pnpm workspace** at `hive/` — the sibling
    projects share nothing and shouldn't share a lockfile.
11. **Threefold repetition = auto-draw** so async games can't zombie forever.
12. **Firebase Hosting + PR preview channels** for deploys, production at
    `hive.zackmfleischman.com` (§5.6) — one CLI deploys hosting, functions, and rules
    together, and previews come free. (Cloudflare Pages would split the
    deploy across two systems for no gain here.)
13. **No iframe embed on the zackmfleischman.com apps page** — a themed link-out card
    instead (end of §7): iframing breaks PWA install, push permission prompts, and
    auth persistence.
14. **Meta actions live in the move log** as typed entries (`kind: 'resign' |
    'draw-offer' | …`), not UHP strings — the log stays the single reconstruction
    source, and UHP stays pure board notation (§2.4, §5.2).
15. **Every game mutation is a callable** — `createGame`, `joinGame`, `submitMove`,
    `resign`, `offerDraw`/`respondDraw`, `rematch` (§5.3). Clients never write
    `games/*` or `invites/*`; the only client-writable doc is your own `users/{uid}`.
16. **Personal-site integration = an external-link card variant** (`externalUrl` on
    `IApp`) added to the existing apps grid; the iframe path stays for the apps that
    already use it. File-level plan at the end of §7; ships with M6.
17. **Agent self-validation is a first-class deliverable** — per-milestone
    `validate:mN` gates, the `/dev/gallery` fixture gallery, and mandatory
    screenshot review against a committed visual checklist (§8). UHP toss/self-move
    ambiguity canonicalizes to self-move (§2.4).

---

## 10. Implementation plan

Each milestone is mergeable, demoable, and gated on `pnpm validate:mN` passing. This
section is the milestone map; the **task-level breakdown** (file-by-file tasks, per-task
tests and gates, frozen engine API, fixture lists, harness spec, and the build protocol
for agent builders) lives in **[IMPLEMENTATION.md](./IMPLEMENTATION.md)**.

### M0 — Scaffold (½ day)
Workspace + `engine`/`app`/`functions`/`e2e` packages; Vite + React + TS + MUI +
router shell; Vitest wired everywhere; GitHub Actions CI (typecheck + tests + e2e);
emulator suite config committed, running fully offline against a `demo-` project —
the Firebase console setup (§5.6) waits until M4; hosting/previews arrive with M3's
static deploy (T3.12).
**Done when:** `pnpm validate:m0` green in CI.

### M1 — Engine: base game (2–3 days)
Hex math, state, placement rules, all five base bugs, one-hive + freedom-to-move,
queen rule, pass, win/draw detection, UHP parse/serialize, Zobrist + repetition.
Full unit + property suites.
**Done when:** `pnpm validate:m1` green — a scripted full game replays via UHP to the
correct result; property suite runs 10k random games clean.

### M2 — Engine: expansions (1–2 days)
Mosquito, Ladybug, Pillbug incl. stun/recency state and toss gate checks; edge-case
suite from published rulings (the pinned list in IMPLEMENTATION.md §fixtures).
**Done when:** `pnpm validate:m2` green — all expansion fixtures pass; property suite
re-run with expansions on.

### M3 — Local game UI (3–4 days)
Board rendering (SVG, pan/zoom, stacks), draft sprite sheet (§6.4), hand tray,
drag/tap interaction per §6.2, GameController with a local (hot-seat) transport,
move list, end-of-game beat + result overlay (§6.3, minus rematch). **Plus the
validation harness itself:** `/dev/gallery`, fixtures, `validate:visual` +
`validate:ux`, and the first full screenshot-review pass (§8). Plus hot-seat
persistence (localStorage behind the `GameTransport` seam; refresh resumes) and a
public static deploy of the hot-seat PWA with a minimal manifest (T3.11/T3.12).
**Done when:** `pnpm validate:m3` green — a scripted hot-seat e2e plays a full
expansion game to the victory sequence; visual/ux harness runs clean and the
screenshots have been agent-reviewed against the checklist; the live URL serves
the installable hot-seat game.

### M4 — Multiplayer backend (3–4 days)
Auth + themed landing/sign-in screen (§6.1); Firestore schema + rules + indexes; the
full callable set of §5.3 (`createGame`/`joinGame`/`submitMove`/`resign`/draw
offers/`rematch`) with emulator tests; invite create/join flow; lobby with multiple
concurrent games; optimistic moves + reconciliation; Playwright two-browser e2e.
**Done when:** `pnpm validate:m4` green — the two-browser full-game e2e passes
(create → invite → join → moves both ways → resign → rematch); you and a second
account can play from two devices.

### M5 — PWA + notifications + async (2–3 days)
`vite-plugin-pwa` manifest/SW, install coach marks, FCM push (all trigger events),
icon/document badges, deadline stamping + hourly forfeit function + expiry warnings.
**Done when:** `pnpm validate:m5` green — push payloads asserted for every trigger,
timed-out game forfeits in emulator test; manual check: phone gets a real push when
the other side moves.

### M6 — Polish & ship (2–3 days)
Final glyph art pass on the sprite sheet, landing-hero and victory-screen polish,
dark mode pass, animations, empty states, responsive audit via a fresh
`validate:visual` review at all viewports, error toasts, Lighthouse PWA audit, deploy
to production Hosting + DNS, **the PersonalWebsite external-link card PR (§7)**, play
a real game start-to-finish.
**Done when:** `pnpm validate` (all gates) green; Lighthouse PWA pass; the apps page
card links out correctly; you've finished an actual game with your friend and neither
of you hit a rough edge worth filing.

### v1.1 candidates (in rough order)
Real-time chess clocks → takebacks → offline move queueing → game chat/emotes →
AI opponent via `@hive/ai` or an external UHP engine → analysis mode.

---

## 11. Risks & mitigations

- **Rules edge cases** (pillbug/mosquito interactions are notoriously fiddly) →
  UHP fixtures from published rulings + property tests, engine frozen behind its API.
- **iOS PWA push quirks** → detect + coach-mark the Home-Screen install; in-app badges
  as the guaranteed fallback.
- **Firestore listener costs at scale** → per-game docs and snapshot caching keep reads
  O(games you're in); revisit only if this outgrows friends-and-family.
- **Drag UX on touch** → tap-tap fallback is a first-class path, not a degraded one;
  e2e runs a mobile viewport project.
