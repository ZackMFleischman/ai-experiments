# LEX — Implementation Playbook

Companion to [DESIGN.md](./DESIGN.md). DESIGN.md says *what and why*; this file says
*in what order, in which files, and how you prove it works*. It is written so that a
coding agent — including a less capable one — can pick up the next unchecked task,
build it, and **validate its own work** (correctness *and* visuals) without a human
watching. It is the direct descendant of `hive/IMPLEMENTATION.md`; where a task says
**[port: hive path]**, start by copying that file from `../hive/` and adapting it —
do not write it from scratch.

---

## 0. Build protocol (applies to every task — read first)

1. **One task per commit/PR.** Tasks are ordered; don't start T*n+1* while T*n*'s
   gate is red. Commit messages: `M3 T3.4: drag layer (pointer events + grid hit-test)`.
2. **Per task, in this order:**
   1. Read the DESIGN.md sections the task cites. If the task and DESIGN.md
      disagree, **stop and flag it** — don't improvise a resolution.
   2. Write or extend the tests named in the task **first** (they may start red).
   3. Implement until the task's **Gate** command passes.
   4. Run `pnpm typecheck && pnpm test` (the always-on gates).
   5. If the task is marked **[visual]**, run `pnpm validate:visual` (and
      `validate:ux` if interaction changed), then **read every new/changed
      screenshot** in `artifacts/screens/` against `e2e/visual-checklist.md`.
      A screenshot generated but never read is not validation. Fix findings or
      record them as accepted deviations (one-line reason).
3. **Never** weaken/skip/delete a test to make a gate pass; never hand-edit
   generated files (`artifacts/`, exported icons, compiled DAWG); never commit them.
4. **Frozen surfaces:** the engine API (§5), the Firestore schema (DESIGN §6.2),
   the callable list (DESIGN §6.3), and the `Ruleset`/`Dictionary` interfaces
   (DESIGN §2.2, §5.4). Changing any requires updating DESIGN.md in the same PR.
5. **Human-gated steps** (⚑) need Zack: Firebase console setup, DNS, real-device
   push, first real OAuth sign-in, website deploy. Do the code side, then list
   exactly what's needed in the PR.
6. **Determinism:** no `Date.now()`/`Math.random()` in engine or dict. The bag
   order is an input (DESIGN §3.3); shuffling lives in functions/transports only;
   time comes in as an argument.
7. **Porting discipline:** every file ported from hive gets a one-line header
   `// ported from hive/<path> (adapted)`. `@lex/platform` must never import
   `@lex/engine` (machine-checked, T0.7).

### Definition of done (every task)

- [ ] Task's Gate passes locally; `pnpm typecheck` and `pnpm test` pass
- [ ] New behavior has a test that fails without the change
- [ ] **[visual]** tasks: screenshots captured *and read*, checklist updated
- [ ] Docs amended in place per §7 (owning section, same PR; DECISIONS.md entry for
      judgment calls; milestone-closing PRs collapse the shipped task table)
- [ ] No TODOs without a checklist entry

---

## 1. Toolchain & workspace targets

- **pnpm workspace** rooted at `lex/` (independent of `loom/` and `hive/`).
  Packages: `packages/engine`, `packages/dict`, `packages/platform`,
  `packages/app`, `packages/functions`, plus `e2e/`.
- **TypeScript strict** everywhere (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`). `engine`, `dict`, and `platform/core` have
  `"sideEffects": false` and **zero runtime dependencies**.
- Dependencies: **match hive's majors exactly** (React 18, MUI 5, Vite 5,
  `vite-plugin-pwa`, react-router 6, TanStack Query 5, Vitest 3 + fast-check +
  Testing Library, Playwright pinned ~1.56, firebase 12 / firebase-admin +
  firebase-functions v2, esbuild for the functions bundle). Copy versions from
  `hive/packages/*/package.json` when scaffolding — hive's pins encode fixes.
- Root scripts (the loom/hive convention):

```
pnpm dev              # vite + firebase emulators (auto-seeded, demo-lex project)
pnpm typecheck        # tsc --noEmit across packages + scripts/check-docs.mjs + check-platform.mjs
pnpm test             # vitest across all packages
pnpm validate         # all validate:* gates in order, stop on first failure
pnpm validate:m0..m6  # per-milestone acceptance
pnpm validate:visual  # gallery screenshot capture + machine checks (§4)
pnpm validate:ux      # scripted drag/tap flows with frame captures (§4)
```

---

## 2. Milestone task lists

### M0 — Scaffold

| # | Task | Notes | Gate |
|---|---|---|---|
| T0.1 | Workspace: `pnpm-workspace.yaml`, `tsconfig.base.json`, six package skeletons with strict TS **[port: hive root configs]** | engine/dict/platform export placeholder types | `pnpm typecheck` |
| T0.2 | App shell: Vite + React + MUI + router, stub routes for every DESIGN §7.1 screen, base theme **[port: hive app scaffold + theme.ts]** | | routes render test |
| T0.3 | Vitest + fast-check + Testing Library wired in every package; one seed test each | | `pnpm test` |
| T0.4 | Playwright + smoke e2e at 3 viewports **[port: hive e2e config]** | pin ~1.56; webServer `--host 127.0.0.1` (§8) | smoke green |
| T0.5 | Firebase emulator suite config against `demo-lex`; functions package with a `ping` callable; seed script **[port: hive firebase.json, emulator-seed, functions scaffold]` | fully offline — no console setup yet (§8) | ping test vs emulator |
| T0.6 | GitHub Actions CI: typecheck + unit layers + e2e vs fresh emulators **[port: hive workflow]** | | CI green |
| T0.7 | `scripts/check-docs.mjs` (budgets, closed set, no "Update (" markers) + `scripts/check-platform.mjs` (platform must not import `@lex/engine`; app imports firebase only via platform/web or `src/sync/`), both wired into `pnpm typecheck` **[port: hive check-docs.mjs]** | | planted violations fail; clean passes |
| T0.8 | `validate:m0` chaining all of the above | | `pnpm validate:m0` |

### M1 — Engine core (DESIGN §2.1–§2.2, §5)

| # | Task | Notes | Gate |
|---|---|---|---|
| T1.1 | Types + `classic` Ruleset data (BoardLayout premiums, TileSet distribution) + immutable registry | invariant tests: 8 TW / 17 DW / 12 TL / 24 DL, symmetric; 100 tiles, 187 points, 2 blanks | unit |
| T1.2 | Bag + `initialState(ruleset, bagOrder)`: permutation validation, deal racks in seat order; draw helper | determinism: same order ⇒ identical states | unit |
| T1.3 | `checkPlay`: rack legality (incl. blanks), single line, contiguity through existing tiles, first-play center + ≥2 tiles, connectivity; word extraction (main + cross, length-1 cross ≠ word) | typed rejection reasons for UI copy | unit vs hand-built boards |
| T1.4 | `scorePlay`: letter premiums (new tiles only), stacking word multipliers, cross-word scores, bingo flag | pinned score fixtures (§6) | unit |
| T1.5 | `applyMove` play/exchange/pass: full pipeline, refill draw, `scorelessRun` bookkeeping, `IllegalMoveError` paths | exchange needs bag ≥ `exchangeMinBag`; 0-point plays increment scorelessRun | unit |
| T1.6 | End conditions + final adjustments + `result()`: played-out bonus/deduction, scoreless-limit end, tie ⇒ draw; terminal `applyMove` finalizes scores | fixtures for each ending | unit |
| T1.7 | GCG-style `toGcg`/`parseGcg` (row-first = horizontal; blanks lowercase; exchange/pass forms) | round-trip at every fixture position | unit |
| T1.8 | `serializeState`/`deserializeState` (full, exact round-trip), `playerView(state, seat)`, `serializePublic`/`parsePublic` | playerView leak assertions | unit |
| T1.9 | Full-game fixture: scripted game (stub dictionary, pinned bag order) replaying to known final scores, exercising bingo + blank + exchange + played-out ending | drives gallery + e2e later | replay test |
| T1.10 | Property suite (invariants list, §6) over random legal games | fc seed pinned in CI; yield between games (§8) | 1000-game run |
| T1.11 | `validate:m1` script | | `pnpm validate:m1` |

### M2 — Dictionary (DESIGN §5.4)

| # | Task | Notes | Gate |
|---|---|---|---|
| T2.1 | Vendor `enable1.txt` + license note; pin exact word count + content hash in a test | public domain — record provenance in the package README lines | unit |
| T2.2 | DAWG builder (build-time script → binary artifact in dist, ≤ 800 KB) + loader; `Dictionary` implementation | generated, never committed | full-list equivalence vs a reference `Set` + fuzzed negatives |
| T2.3 | Async app loader (fetch + cache) and sync functions loader (bundled) sharing one decoder | id + hash asserted both sides | unit |
| T2.4 | Engine integration: `applyMove` play path takes `dict`; per-word verdicts surface for UI; invalid-word fixtures (one bad cross-word rejects the whole play, names it) | | unit |
| T2.5 | Real-dictionary full-game fixture; `validate:m2` | | `pnpm validate:m2` |

### M3 — Local game UI + validation harness (DESIGN §7)

| # | Task | Notes | Gate |
|---|---|---|---|
| T3.1 | Grid board from `BoardLayout`: premium colors + DL/TL/DW/TW labels, star; committed-tile component (letter + point index) **[visual]** | CSS-variable tile skin from day one | render tests + gallery |
| T3.2 | Viewport: fit-view, pan, pinch/wheel zoom, double-tap zoom, recenter **[port: hive BoardViewport → CSS transform]** **[visual]** | keep hive's pinch containment verbatim (§8) | viewport tests |
| T3.3 | Rack tray: 7 slots, drag-reorder, shuffle, counts; bag-count chip **[visual]** | | component tests |
| T3.4 | `GameController`: pending-placement model, verdict pipeline calls, optimistic submit over `GameTransport` **[port: hive transport.ts + LogSession core into platform/core first]** | controller tests: place/return/recall, submit, rollback | unit |
| T3.5 | Drag layer (raw pointer events, transform-aware hit-test) + tap-tap fallback + recall; Esc cancels | | `validate:ux` flows |
| T3.6 | Blank letter-picker sheet; exchange multi-select mode + confirm bar; pass confirm dialog **[visual]** | | component tests |
| T3.7 | Live preview: per-word chips (word, points, ✓/✗ from local dict) + total badge; Play enablement rules **[visual]** | | component tests |
| T3.8 | Hot-seat: `LocalTransport` (shuffles at the edge, full state in localStorage, refresh resumes) + **pass-device interstitial** (DESIGN §7.3) **[visual]** | | persistence + flow tests |
| T3.9 | Score sheet drawer; last-play highlight; remote-play animation **[visual]** | | component tests |
| T3.10 | End-of-game beat + result overlay with score story (adjustment line items) **[visual]** | fixtures for every ending incl. draw | gallery review |
| T3.11 | Harness: `/dev/gallery` + registry + fixtures (§4.1 minimum registry), `validate:visual`, `validate:ux` **[port: hive dev/ + scripts]**; first full screenshot-review pass | | harness green + review committed |
| T3.12 | Static hot-seat PWA deploy (no firebase in bundle, minimal manifest) to Cloudflare Pages project `lex` **[port: hive T3.12 setup]** | | live URL serves installable hot-seat game |
| T3.13 | `validate:m3`: scripted hot-seat e2e — full game through the pass-device flow to the victory sequence, tap AND drag variants at 390×844 | | `pnpm validate:m3` |

### M4 — Multiplayer backend (DESIGN §3.3, §6)

| # | Task | Notes | Gate |
|---|---|---|---|
| T4.1 | Port `platform/web`: firebase init, authContext, RequireAuth, AppSyncProviders, gameApi, lobby queries **[port: hive app/src/sync/*]** | genericize field/payload types while copying | unit |
| T4.2 | Themed landing/sign-in (tile-vignette hero) + emulator email/password test sign-in for dev/e2e (prod = Google only, §8) **[visual]** | | auth tests |
| T4.3 | Schema + `firestore.rules` + indexes: public tier, `racks/{uid}` owner-read, `private/*` no-read **[port: hive rules as base]** | **negative rules tests**: opponent rack denied, bag denied, direct game writes denied | rules suite |
| T4.4 | Callables: create/join/cancel/challenge/respond/rematch via `platform/server` **[port: hive functions/games.ts, notify.ts]**; `createGame` shuffles + persists bag, deals racks | | emulator tests |
| T4.5 | `submitMove`: reconstruct full state (public log + private doc), turn + concurrency guard, `applyMove` w/ dict, transactional writes (move, game+public+lastPlay, rack, bag), opponent push | tests: happy, illegal word, illegal geometry, wrong turn, stale count, exchange privacy (count only public), tile conservation across docs, exchange re-shuffle event recorded | emulator tests |
| T4.6 | `firestoreTransport` + own-rack listener + optimistic/refill reconciliation ("drawing…" placeholder) **[port: hive firestoreTransport]** | integration tests vs emulator | integration |
| T4.7 | Lobby (challenges/your-turn/waiting/finished; cards with scores + lastPlay), join flow, new-game flow (opponent chip / invite link, turn order, time control), waiting screen with re-shareable invite **[port: hive screens]** **[visual]** | | screen tests + gallery |
| T4.8 | Two-browser Playwright e2e: create → invite → join → plays both ways → exchange → bingo → resign → rematch; reload-mid-game resume | single worker; force long polling in emulator mode (§8) | e2e green |
| T4.9 | Multiplayer build mode + deploy workflow: default build stays firebase-free static hot-seat; `--mode multiplayer` ships to Firebase Hosting; esbuild-bundled functions; idempotent invoker-repair step **[port: hive-deploy.yml]** ⚑ console/project setup | | deploy job green vs `lex-zmf` once ⚑ done |
| T4.10 | `validate:m4` | | `pnpm validate:m4` |

### M5 — PWA + notifications + async clocks (DESIGN §8, §6.4)

| # | Task | Notes | Gate |
|---|---|---|---|
| T5.1 | `vite-plugin-pwa` injectManifest SW: precache + SPA fallback + push display/deep-link + **push-sync postMessage** + visibilitychange resync **[port: hive sw.ts]** | | offline/installability e2e vs production build |
| T5.2 | FCM tokens on `users/{uid}`, NotificationsSetup, iOS install coach mark **[port: hive]** **[visual]** | | unit + gallery |
| T5.3 | Push triggers with exact payload tests: played (word + score in copy), joined, challenge x3, rematch, game over, deadline warning | data-only webpush (§8) | functions tests |
| T5.4 | Icon/document badges; offline read-only lobby (persistent cache) **[port: hive]** | | e2e |
| T5.5 | Deadlines: `deadlineAt` stamping, hourly `forfeitExpired` (+ warnings + stale-invite cull) **[port: hive forfeit.ts]** | pinned-now sweep tests | functions tests |
| T5.6 | `validate:m5` ⚑ real push on a device, iOS home-screen check | | `pnpm validate:m5` |

### M6 — Polish & ship

| # | Task | Notes | Gate |
|---|---|---|---|
| T6.1 | Tile/board theme pass + tile skins (classic/walnut/high-contrast) in Settings; wordmark; icon export **[visual]** | | gallery review |
| T6.2 | Animation/empty-state/error-toast pass; landing + victory polish **[visual]** | | gallery review |
| T6.3 | Dark + responsive audit: full `validate:visual` re-review, 3 viewports × 2 themes × skins | **[visual]** | checklist clean |
| T6.4 | Lighthouse PWA + perf audit; DAWG load budget check | | Lighthouse pass |
| T6.5 | ⚑ Production: `firebase deploy --project prod`, DNS `lex.zackmfleischman.com`, first real sign-in + real game | | live game |
| T6.6 | Website card: `store.yaml` entry + thumbnail via the `externalUrl` variant (hive T6.6); if hive hasn't landed it, implement per hive DESIGN §7 file list ⚑ site deploy | **[visual]** | card renders |
| T6.7 | Full `pnpm validate`; collapse shipped task tables per §7 | | all gates green |

---

## 3. What the builder must NOT do

- Put rules knowledge in the UI — it renders engine verdicts (`checkPlay`,
  `scorePlay`, dict lookups) only. No score math, no legality logic, in components.
- Let `@lex/platform` import `@lex/engine`, or firebase escape
  `platform/web|server`, `app/src/sync/`, `packages/functions` (T0.7 enforces).
- Add dependencies to `engine`/`dict`/`platform/core`, or DOM/React types to them.
- Shuffle or read clocks inside the engine (bag order and time are inputs).
- Expose rack letters or bag contents in any public doc, log entry, push payload,
  or client-visible error message. Exchange entries carry a **count**.
- Hard-code 15, 7, 50, letter counts, or premium positions anywhere outside the
  `classic` ruleset definition.
- Introduce a drag-and-drop library or Redux (hive decisions §9.8/§6.5 carry over).
- Commit `artifacts/`, screenshots, exported icons, or the compiled DAWG.
- Rendering-time randomness or wall-clock reads in anything the gallery captures.

---

## 4. Validation harness spec

Ported from hive (IMPLEMENTATION §4 there) — same runtime, same rules. Deltas only:

### 4.1 `/dev/gallery` minimum registry

By end of M3: empty board (each skin); early/mid/late boards replayed from GCG
fixtures; every premium type covered + labeled; pending placement with preview
chips (valid, invalid-word, illegal-geometry states); blank picker open; exchange
mode with selection; rack full/low/empty; pass-device interstitial; score sheet
open; last-play highlight; every ending overlay (played-out win/loss, scoreless,
tie/draw, resign, timeout) with adjustment line items; confirm dialogs.
M4 adds: landing, join, lobby groups (incl. empty), new-game form, waiting screen.
M5 adds: coach mark, offline lobby. `?static=1` freezes animations and pins
fixture names/timestamps, as in hive.

### 4.2 Scripts

`validate:visual`: registry × 3 viewports (390×844 / 1024×768 / 1440×900) ×
light/dark → `artifacts/screens/`; machine checks: zero console errors, board fits
viewport at fit-view, no missing tile glyphs (every tile cell renders a letter).
`validate:ux`: scripted flows — drag place happy path, drop-off-board return,
recall, tap-tap place + cancel, blank designation, exchange select/confirm, pan/
zoom mid-placement — asserting controller state, capturing before/during/after
frames. Both headless in CI; the review pass is the agent reading images (§0.2.5).

---

## 5. Frozen engine API

`@lex/engine` exports exactly this surface (extend only with a DESIGN.md update):

```ts
export type Letter = string;                       // 'A'–'Z'
export type TileFace = Letter | '?';               // '?' = blank (in rack/bag)
export interface Cell { row: number; col: number } // 0-based
export type CellKey = string;                      // `${row},${col}`
export type Seat = number;                         // 0-based player index

export type Premium = 'DL' | 'TL' | 'DW' | 'TW';
export interface BoardLayout {
  id: string; rows: number; cols: number;
  premiums: Readonly<Record<CellKey, Premium>>;
  start: Cell;                                     // first play covers this
}
export interface TileSet {
  id: string;
  counts: Readonly<Record<TileFace, number>>;
  points: Readonly<Record<TileFace, number>>;      // '?' → 0
}
export interface Ruleset {
  id: string; board: BoardLayout; tiles: TileSet;
  rackSize: number; bingoBonus: number;
  exchangeMinBag: number; scorelessLimit: number;
  dictionaryId: string;
}
export const RULESETS: Readonly<Record<string, Ruleset>>;  // v1: { classic }

export interface Dictionary { id: string; has(word: string): boolean }

export interface PlacedTile { letter: Letter; isBlank: boolean }
export interface Placement extends PlacedTile { cell: Cell }

export type Move =
  | { type: 'play'; placements: readonly Placement[] }
  | { type: 'exchange'; tiles: readonly TileFace[] }
  | { type: 'pass' };

export interface WordScore { word: string; score: number; cells: readonly Cell[] }
export type PlayCheck =
  | { ok: true; words: readonly WordScore[] }      // scores filled by scorePlay
  | { ok: false; reason: 'not-your-tiles' | 'not-a-line' | 'gap' | 'first-play-center'
                        | 'first-play-too-short' | 'not-connected' | 'occupied' | 'off-board' };
export interface PlayScore { words: readonly WordScore[]; bingo: boolean; total: number }

export interface GameState {                       // FULL state — server/hot-seat only
  readonly rulesetId: string;
  readonly board: ReadonlyMap<CellKey, PlacedTile>;
  readonly racks: ReadonlyArray<readonly TileFace[]>;
  readonly bag: readonly TileFace[];               // front = next draw
  readonly scores: readonly number[];
  readonly toMove: Seat;
  readonly moveCount: number;
  readonly scorelessRun: number;
}
export interface PlayerView {
  readonly rulesetId: string;
  readonly board: ReadonlyMap<CellKey, PlacedTile>;
  readonly rack: readonly TileFace[];              // own only
  readonly scores: readonly number[];
  readonly bagCount: number;
  readonly rackCounts: readonly number[];
  readonly toMove: Seat; readonly moveCount: number; readonly scorelessRun: number;
}

export type GameResult =
  | { status: 'ongoing' }
  | { status: 'finished'; winner: Seat | 'draw';
      by: 'played-out' | 'scoreless'; finalScores: readonly number[] };

export function initialState(ruleset: Ruleset, bagOrder: readonly TileFace[],
                             seats: number): GameState;   // validates permutation; deals racks
export function checkPlay(board: GameState['board'], rack: readonly TileFace[],
                          placements: readonly Placement[], ruleset: Ruleset): PlayCheck;
export function scorePlay(board: GameState['board'],
                          placements: readonly Placement[], ruleset: Ruleset): PlayScore;
export function applyMove(state: GameState, move: Move,
                          dict: Dictionary): GameState;   // throws IllegalMoveError; terminal move finalizes scores
export function result(state: GameState): GameResult;     // board outcomes only (resign/timeout live in the game doc)
export function playerView(state: GameState, seat: Seat): PlayerView;
export function toGcg(move: Move, state: GameState): string;
export function parseGcg(line: string, state: GameState): Move;
export function serializeState(state: GameState): string;    // exact round-trip
export function deserializeState(text: string): GameState;
export function serializePublic(state: GameState): string;   // games/{id}.public (DESIGN §6.2)
export function parsePublic(text: string): Omit<PlayerView, 'rack'>;
```

---

## 6. Test vectors & invariants

### Property-test invariants (fast-check, T1.10)

Over random legal games (random bag orders; a stub dictionary accepting everything;
random choice among candidate plays found by brute-force placement search, else
exchange/pass; until terminal or 200 plies):

1. Tile conservation: board + all racks + bag = the TileSet, per face, every ply.
2. Every candidate accepted by `checkPlay` is accepted by `applyMove` (no throws).
3. Scores are non-negative and non-decreasing until the terminal adjustment.
4. `serializeState ∘ deserializeState` is identity at every ply; same for public.
5. Replay (initial bagOrder + move list, with exchange re-shuffle events injected)
   reproduces the final state exactly.
6. `playerView(s, seat)` contains no other seat's rack faces and no bag faces;
   counts match reality.
7. `toGcg → parseGcg` round-trips to a deep-equal Move at every position.
8. `scorelessRun` resets exactly on plays with total > 0; the game always
   terminates (scoreless limit guarantees it even under pass-only play).
9. Terminal scores equal hand-computed adjustments (independent reimplementation).

### Pinned edge-case fixtures (T1.4–T1.6, T2.4 — one fixture each)

- First play must cover the start cell and place ≥2 tiles; single-tile first play
  rejected; later single-tile plays fine.
- Placement with an internal gap not bridged by existing tiles ⇒ `gap`.
- Placement bridged by existing tiles ⇒ legal; main word spans the full extent.
- Disconnected play (touches nothing) ⇒ `not-connected`.
- Letter premium counts only for newly placed tiles; covered premiums never
  re-count on later plays.
- One word covering two DW ⇒ ×4; DL under a new tile inside a TW word ⇒ letter
  doubles then word triples.
- Cross-word scoring: one placement forming main + 3 cross words, all scored;
  length-1 "cross words" ignored.
- A play that extends a word both ways (prefix + suffix in one line) scores the
  whole word once.
- Blank: 0 points but full word membership; designated letter permanent; GCG
  lowercase; blank on DL still 0 (letter premium × 0); blank counts toward bingo.
- Bingo: exactly `rackSize` tiles placed ⇒ +50; 6 tiles ⇒ no bingo; a 7-tile play
  when the rack held 7 near endgame ⇒ bingo.
- Exchange with bag = 7 ⇒ allowed; bag = 6 ⇒ rejected; exchanged count public,
  letters private (schema-level test in T4.5).
- Pass, exchange, and 0-point plays each increment `scorelessRun`; a scoring play
  resets it; 6th consecutive scoreless turn ends the game with rack deductions.
- Played-out ending: finisher gains opponent rack sum; opponent deducts; resulting
  tie ⇒ draw.
- Final refill when bag < needed draws what remains.
- Dictionary: one invalid cross-word rejects the whole play and names it; validity
  is case-insensitive.

### Full-game fixtures (T1.9, T2.5)

- One stub-dict game to a played-out ending, exercising bingo + blank + exchange.
- One real-dict (ENABLE) game to a played-out ending.
- One game ending by scoreless limit; one ending in a tie/draw.
These drive gallery board entries, the hot-seat e2e script, and replay checks.

---

## 7. Documentation policy

Hive's policy (hive IMPLEMENTATION §7) adopted verbatim — closed doc set, line
budgets, current-state-only, one home per fact, self-consuming plan, DECISIONS.md
the only growing file, `check-docs.mjs` enforcement. Lex's table:

| File | Job | Budget |
|---|---|---|
| `README.md` | elevator pitch + pointers | 25 |
| `CLAUDE.md` | agent entry point: hard rules + commands | 55 |
| `DESIGN.md` | the *current* design — what & why | 900 |
| `IMPLEMENTATION.md` | how to build what isn't built yet + reference | 650 |
| `DECISIONS.md` | append-only decision + SHIPPED log | no cap; ≤8 lines/entry |
| `e2e/visual-checklist.md` | living visual-review checklist | 150 |

When a milestone ships: collapse its §2 table to `### MN — shipped, see
DECISIONS.md` and append a SHIPPED entry (date, gates, deviations, stumbles).

---

## 8. Lessons imported from hive (apply them; don't rediscover them)

From `hive/DECISIONS.md` — each cost a debugging session there:

1. Playwright pinned ~1.56 to match the sandbox chromium; CI webServer needs
   `--host 127.0.0.1`.
2. Long synchronous fast-check runs starve vitest's worker RPC — yield a macrotask
   between games; pin the fc seed in CI.
3. Firestore emulator WebChannel 400s in headless chromium — force long polling in
   emulator mode; run multiplayer Playwright single-worker.
4. Functions deploy: esbuild-bundle so `workspace:*` deps are inlined (Cloud Build
   npm chokes on them); strip devDependencies from the packed dir.
5. First functions deploy creates callables without invoker IAM — the deploy
   workflow repairs invoker bindings idempotently every run (callables public,
   scheduler jobs scheduler-only); the deploy SA needs `roles/run.admin`.
6. Pushes are **data-only** webpush with SW-side display; SW broadcasts
   `push-sync` postMessage so open clients resync even if a Firestore stream died
   silently; also resync on visibilitychange.
7. Pinch must be contained to the board: pin viewport page scale and swallow
   Safari gesture events + multi-touch touchmove on the board element —
   `touch-action` alone is not enough.
8. Emulator-only email/password test sign-in for dev/e2e; production UI stays
   Google-only.
9. No cloud project until the first deploy milestone: emulators run against a
   `demo-` project id; `default` alias stays demo so CI never needs credentials;
   deploys use `--project prod`.
10. Ship a waiting screen while `status:'open'` (board withheld) — players *will*
    open the game before the opponent joins.

## 9. Open items / deliberately deferred

Challenge-mode ruleset, real-time clocks, 3–4 players, keyboard entry, chat, AI
(`@lex/ai` DAWG move generator), analysis, `.gcg` export, platform promotion to a
repo-level shared library + hive migration — post-v1 (DESIGN §11). Pixel-diff
snapshots: same stance as hive (defer; if added, gate only the tile contact sheet).
