# HIVE — Implementation Playbook

Companion to [DESIGN.md](./DESIGN.md). DESIGN.md says *what and why*; this file says
*in what order, in which files, and how you prove it works*. It is written so that a
coding agent — including a less capable one — can pick up the next unchecked task,
build it, and **validate its own work** (correctness *and* visuals) without a human
watching.

---

## 0. Build protocol (applies to every task — read first)

1. **One task per commit/PR.** Tasks are ordered; don't start T*n+1* while T*n*'s
   gate is red. Commit messages: `M3 T3.6: drag layer (pointer events + hit-test)`.
2. **Per task, in this order:**
   1. Read the DESIGN.md sections the task cites. If the task and DESIGN.md disagree,
      **stop and flag it** — don't improvise a resolution.
   2. Write or extend the tests named in the task **first** (they may start red).
   3. Implement until the task's **Gate** command passes.
   4. Run `pnpm typecheck && pnpm test` (the always-on gates).
   5. If the task is marked **[visual]**, run `pnpm validate:visual` (and
      `validate:ux` if interaction changed), then **read every new/changed screenshot**
      in `artifacts/screens/` and review it against `e2e/visual-checklist.md`.
      A screenshot generated but never read is not validation. Fix findings or record
      them in the checklist as accepted deviations (with a one-line reason).
3. **Never** weaken/skip/delete a test to make a gate pass; never hand-edit generated
   files (`artifacts/`, exported icons); never commit `artifacts/`.
4. **Frozen surfaces:** the engine API signatures (§5 below), the Firestore schema
   (DESIGN.md §5.2), and the callable list (DESIGN.md §5.3). Changing any of them
   requires updating DESIGN.md in the same PR and saying so in the PR description.
5. **Human-gated steps** (marked ⚑ below) need Zack: Firebase console setup, DNS,
   real-device push checks, first real OAuth sign-in, and the PersonalWebsite deploy.
   Do everything up to the gate, then list exactly what's needed in the PR.
6. **Determinism:** no `Date.now()`/`Math.random()` in the engine. Randomness (random
   color pick) lives at the edges; time comes in as an argument.

### Definition of done (every task)

- [ ] Task's Gate command passes locally
- [ ] `pnpm typecheck` and `pnpm test` pass
- [ ] New behavior has a test that fails without the change
- [ ] **[visual]** tasks: screenshots captured *and read*, checklist updated
- [ ] Docs updated **in this PR** per the §7 policy: owning section amended in
      place (no appended "Update:" blocks, no new files), DECISIONS.md entry if the
      task involved a judgment call; milestone-closing PRs collapse the shipped task
      table (§7.2.3)
- [ ] No TODOs without an issue/checklist entry

---

## 1. Toolchain & workspace targets

- **pnpm workspace** rooted at `hive/` (independent of `loom/`). Packages:
  `packages/engine`, `packages/app`, `packages/functions`, `e2e`.
- **TypeScript strict** everywhere (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`). Engine has `"sideEffects": false` and **zero
  runtime dependencies**.
- Key deps: React 18 + MUI 5 + Vite 5 + `vite-plugin-pwa`; `react-router`;
  TanStack Query; Vitest + `fast-check` + Testing Library; Playwright;
  `firebase` (app) / `firebase-admin` + `firebase-functions` (functions);
  `firebase-tools` for emulators/deploy. Pin majors in the root README when scaffolding.
- Root scripts (mirror the loom convention):

```
pnpm dev              # vite + firebase emulators (auto-seeded)
pnpm typecheck        # tsc --noEmit across all packages
pnpm test             # vitest across all packages
pnpm validate         # all validate:* gates in order, stop on first failure
pnpm validate:m0..m6  # per-milestone acceptance (defined per milestone below)
pnpm validate:visual  # gallery screenshot capture + machine checks (§4)
pnpm validate:ux      # scripted drag/tap flows with frame captures (§4)
```

---

## 2. Milestone task lists

### M0 — Scaffold

| # | Task | Files / notes | Gate |
|---|---|---|---|
| T0.1 | Workspace root: `pnpm-workspace.yaml`, root `package.json` (scripts above as stubs), base `tsconfig.json`, `.gitignore` (`artifacts/`, `.firebase/`, `www/`… ) | `hive/` root | `pnpm install` clean |
| T0.2 | `@hive/engine` skeleton: `src/index.ts` exporting the frozen types of §5 (bodies may `throw new Error('unimplemented')`), vitest config, one passing placeholder test | `packages/engine` | `pnpm --filter @hive/engine test` |
| T0.3 | `@hive/app` shell: Vite + React + MUI + router; empty routed screens (Landing, Lobby, NewGame, Join, Game, Settings); MUI theme with light/dark toggle stub | `packages/app` | app boots, all routes render |
| T0.4 | `@hive/functions` + emulator config: `firebase.json`, `.firebaserc`, Firestore rules stub (deny-all except own `users/{uid}`), `firestore.indexes.json`, one `ping` callable + emulator test; committed emulator seed fixture | `packages/functions`, repo root | `pnpm --filter @hive/functions test` (boots emulator) |
| T0.5 | `e2e` package: Playwright config (chromium; 3 viewport projects: 390×844 / 1024×768 / 1440×900), smoke test that loads the app and asserts no console errors | `e2e/` | `pnpm --filter e2e test` |
| T0.6 | CI: GitHub Actions — typecheck + unit layers on push, full `pnpm validate` (incl. e2e) on PR. No Firebase console/Hosting before M4 (DECISIONS 2026-07-02); the static hot-seat deploy ships in T3.12 | `.github/workflows/hive-ci.yml` | `pnpm validate:m0` |
| T0.7 | Commit `hive/CLAUDE.md` (builder guide: commands, protocol pointer, frozen-surface warning) and wire `validate:m0` = typecheck + all tests + e2e smoke | root | `pnpm validate:m0` |
| T0.8 | Docs lint: `scripts/check-docs.mjs` enforcing the §7 policy (budgets, closed file set, no "Update:" markers); wire into `pnpm typecheck` + CI | root | lint fails on a synthetic violation, passes on HEAD |

### M1 — Engine: base game

All tasks in `packages/engine`. Every task ends with unit tests in
`packages/engine/test/`. **Signatures are pinned in §5 — do not drift.**

| # | Task | Notes | Gate |
|---|---|---|---|
| T1.1 | `hex.ts`: axial coords, `neighbors(h)`, `add/sub`, `cellKey`/`parseKey`, pixel↔axial (`hexToPixel`, `pixelToHex` via fractional-cube round) | pointy-top; pixel math lives here so board + drag share it | hex tests (incl. round-trip fuzz) |
| T1.2 | `state.ts`: `GameState`, `GameOptions`, `TileId`, `Move`, immutable update helpers, `initialState(options)` | §5 types verbatim | state tests |
| T1.3 | `rules.ts` (part 1): placement legality — own-color contact, first two placements, queen-by-turn-4, tournament-opening toggle, "covered cell counts as covering color" | | placement tests |
| T1.4 | `rules.ts` (part 2): one-hive via articulation points (iterative DFS); tops of stacks never articulation-blocked | | one-hive tests incl. stack cases |
| T1.5 | `rules.ts` (part 3): freedom-to-move gate predicate, generalized by height (ground slide, climb up/down) | one predicate reused by bugs + pillbug toss | gate tests (both-neighbors-occupied, height cases) |
| T1.6 | `bugs/queen.ts`, `bugs/beetle.ts`, `bugs/grasshopper.ts` + bug registry table | beetle: stacking, covered-tile freeze; hopper: ray-walk ≥1 | per-bug tests |
| T1.7 | `bugs/spider.ts`, `bugs/ant.ts` | perimeter slide DFS/BFS; spider exactly-3 no-revisit; ant closure | per-bug tests |
| T1.8 | `engine.ts`: `legalMoves` (placements + moves + forced pass), `applyMove` (throws on illegal), `result` (surround / double-surround draw) | pass is a `Move`, offered only when nothing else is legal | engine tests |
| T1.9 | `uhp.ts`: parse/serialize vs. current state; toss/self-move ambiguity canonicalizes to **self-move** (DESIGN §2.4); one hand-authored full-game UHP fixture replaying to a win | fixture lives in `test/fixtures/` | round-trip + replay tests |
| T1.10 | `zobrist.ts` + repetition: hash over (cell, stack slot, tile) + side-to-move; `positionHashes` maintained by `applyMove`; threefold ⇒ `result` = draw. Property suite (fast-check): invariants list in §6 over 10k random games | seeded PRNG for reproducibility | `pnpm validate:m1` |

`validate:m1` = full engine suite + the 10k-game property run (property count
configurable via env so CI can run 1k on PRs, 10k nightly).

### M2 — Engine: expansions

| # | Task | Notes | Gate |
|---|---|---|---|
| T2.1 | `bugs/ladybug.ts`: exactly 2 on-top steps then 1 down, gate-checked at height | | ladybug tests |
| T2.2 | `bugs/pillbug.ts`: queen-move + toss generation; `lastMoved` bookkeeping in `applyMove`; stun (tossed piece immobile next turn); may not toss opponent's-last-moved piece, stacked pieces, or through a height-1 gate | this is the fiddly one — encode every constraint as its own test | pillbug tests |
| T2.3 | `bugs/mosquito.ts`: union of adjacent generators; mosquito-only ⇒ stuck; on-top ⇒ beetle; copying pillbug grants toss | | mosquito tests |
| T2.4 | Edge-case fixture pack: encode the pinned list in §6 as UHP fixtures; re-run property suite with all expansions on | `test/fixtures/expansions/` | `pnpm validate:m2` |

### M3 — Local game UI (+ the validation harness)

`packages/app` unless noted. **[visual]** tasks require the §0.2.5 screenshot review.

| # | Task | Notes | Gate |
|---|---|---|---|
| T3.1 | Draft sprite sheet `src/assets/hive-sprites.svg`: 8 bug glyphs (circle/arc geometry is fine for now), hex bases (light/dark), ghost hex, motifs; all `currentColor` + one CSS var per DESIGN §6.4 | **[visual]** — capture a sprite-contact-sheet gallery entry | sprites render in gallery |
| T3.2 | `board/BoardView.tsx`: SVG renderer — tiles from a `GameState`, stack offset+shadow, auto-fit viewBox, last-move highlight | pure: `(state, uiState) → SVG`; no engine logic | component tests + **[visual]** |
| T3.3 | Pan/zoom: pointer + wheel/pinch on the SVG viewport, recenter button, auto-fit after growth | keep transform in controller-owned uiState | interaction tests + **[visual]** |
| T3.4 | `controller/GameController.ts` + `LocalTransport` (hot-seat) + `useSyncExternalStore` hook. Controller owns: authoritative state, selection, legal-target set, drag state machine (§6.2 states 1–5), optimistic queue (no-op locally) | transport interface per DESIGN §3.2 | controller unit tests (state-machine transitions, incl. cancel paths) |
| T3.5 | Selection & affordances: movable lift/shadow, ghost targets, climb badges, ~20% dim of everything else, queen-must-place pulse | **[visual]** | component tests + gallery entries |
| T3.6 | Drag layer: raw pointer events, `pixelToHex` hit-testing (works mid-pan/zoom), snap preview, not-allowed tint, spring-back, Esc cancel; tap-tap fallback driving the same controller states | DESIGN §9.8 | controller tests + `validate:ux` frames **[visual]** |
| T3.7 | Hand tray: dockable, per-bug counts, disabled=no legal placement, drag-to-place + tap-to-place | **[visual]** | component tests |
| T3.8 | Game screen chrome: player bars (name, queen-liberties), move list drawer (UHP + meta rows), overflow menu with Pass / Resign / Offer draw (local-only handlers for now), confirm dialogs | **[visual]** | component tests |
| T3.9 | End-of-game: auto-center on surrounded queen, six-tile pulse, ~1 s beat (tap-skip), result overlay per DESIGN §6.3 (minus rematch), per-outcome theming, view-board mode with persistent banner | **[visual]** — gallery entries for all outcomes × themes | component tests |
| T3.10 | **Validation harness**: `/dev/gallery` route + fixture registry (§4), `?static=1` mode, `validate:visual` + `validate:ux` scripts, `e2e/visual-checklist.md` seeded with §4.3; hot-seat scripted e2e (full expansion game via tap-mode to victory overlay) | dev-only route, excluded from prod build | `pnpm validate:m3` |
| T3.11 | Hot-seat persistence: `LocalTransport` saves the in-progress game (UHP log + options) to localStorage behind the `GameTransport` seam — refresh resumes, "New game" clears | controller tests: save/resume/clear round-trip | controller tests |
| T3.12 | Static deploy: build `@hive/app` with `LocalTransport` default (verify no firebase in bundle), minimal PWA manifest + icons via `vite-plugin-pwa` (subset of T5.1), deploy via GitHub Actions — Cloudflare Pages project `hive` (loom's pattern; GitHub Pages fallback), main deploy + PR preview | **[visual]** — installability checked on the live URL | deploy green on merge |

`validate:m3` = component/controller suites + hot-seat full-game e2e +
`validate:visual` + `validate:ux` machine checks green. Then perform the first full
screenshot review pass and commit the updated checklist.

### M4 — Multiplayer backend

| # | Task | Notes | Gate |
|---|---|---|---|
| T4.1 | Auth: Firebase Auth (Google) + emulator; auth state in TanStack Query; route guards; ⚑ real-OAuth check on production later | `app/src/sync/auth.ts` | emulator auth e2e |
| T4.2 | Landing/sign-in + Join screens per DESIGN §6.1: hero = BoardView pointed at a fixed decorative state, idle float, wordmark | **[visual]** | gallery entries + review |
| T4.3 | Firestore schema + security rules + indexes exactly per DESIGN §5.2/§5.3 (deny client writes to `games/*`, `invites/*`; own-doc `users/{uid}`); rules unit tests with `@firebase/rules-unit-testing` | `packages/functions` | rules tests |
| T4.4 | Callables: `createGame`, `joinGame` (transactional seat claim), `submitMove` (protocol per DESIGN §5.3, engine-validated, concurrency guard) | emulator tests: happy path, wrong turn, stale `expectedMoveCount`, illegal move, non-player caller | function tests |
| T4.5 | Callables: `resign`, `offerDraw`, `respondDraw`, `rematch` (meta events to move log, `pendingDrawOffer`, `rematchOf`) | emulator tests incl. offer-clears-on-move | function tests |
| T4.6 | `FirestoreTransport`: snapshot listeners → controller; optimistic apply + rollback/resync on rejection; move-log ↔ snapshot regression check on load | controller tests with mocked transport already exist — add the real adapter + emulator integration test | integration test |
| T4.7 | Lobby + NewGame + invite flow UI: your-turn/waiting groups, result chips, mini board thumbnails (BoardView, static), deadline countdown, FAB, invite-link copy; rematch flow into the §6.3 overlay | **[visual]** | component tests + gallery |
| T4.8 | Two-browser Playwright e2e vs. emulators: create → invite → join → alternating moves → draw-offer declined → resign → rematch → reload-mid-game resume | shared `test-harness` module for emulator boot/seed/fake-auth (DESIGN §8) | `pnpm validate:m4` |

### M5 — PWA + notifications + async

| # | Task | Notes | Gate |
|---|---|---|---|
| T5.1 | `vite-plugin-pwa`: manifest, SW, offline app-shell (lobby read-only offline); icon build script exporting PWA/maskable/badge icons from the queen glyph | icons are generated — never hand-edit | Lighthouse PWA installable |
| T5.2 | FCM: token capture to `users/{uid}.fcmTokens[]` (multi-device, stale-token pruning on send failure), push-permission UX, iOS install coach mark (DESIGN §7) | **[visual]** for the coach mark | unit tests |
| T5.3 | Notification sends from functions on: opponent moved, game joined, draw offered, game over, deadline warning; deep-link payloads to `/game/{id}` | mocked messaging transport; assert exact payloads per trigger | function tests |
| T5.4 | In-app awareness: your-turn badges, document title `(n) HIVE`, Badging API | | component tests |
| T5.5 | Async clocks: `deadlineAt` stamping in `submitMove`/`joinGame`, hourly `forfeitExpired` (forfeits, warnings, invite culling) fired manually in tests | | `pnpm validate:m5` |

⚑ Manual device pass at the end of M5: real push on a phone, iOS home-screen install.

### M6 — Polish & ship

| # | Task | Notes | Gate |
|---|---|---|---|
| T6.1 | Final glyph art pass on `hive-sprites.svg` (one file); re-capture sprite contact sheet | **[visual]** | review vs. checklist |
| T6.2 | Landing hero, victory overlay, empty states, error toasts, animation timing pass; board z-order: paint stacks by vertical layer (all level-0 tiles first, then level-1, …) so tall stacks are never overdrawn by neighboring tiles | **[visual]** | gallery review |
| T6.3 | Dark-mode + responsive audit: full `validate:visual` re-review at all 3 viewports × 2 themes; fix findings | **[visual]** | checklist clean |
| T6.4 | Lighthouse PWA + perf audit; fix regressions | | Lighthouse pass |
| T6.5 | ⚑ Production: `firebase deploy`, DNS record for `hive.zackmfleischman.com`, first real sign-in, real game | | live game |
| T6.6 | **PersonalWebsite PR** (separate repo): `externalUrl` card variant + hive entry + `assets/images/hive-card.png`, exactly per DESIGN §7 file list; match the repo's React 16.6 class-component/tslint idiom; verify card renders via the site's `npm run dev` | **[visual]** — screenshot the apps grid | ⚑ site deploy |

---

## 3. What the builder must NOT do

- Add rules knowledge to the UI (the UI renders `legalMoves()` output, period).
- Let the app import Firebase outside `app/src/sync/`.
- Add engine dependencies, or DOM/React types to the engine.
- Introduce a drag-and-drop library (DESIGN §9.8) or Redux (DESIGN §6.5).
- Rendering-time randomness or wall-clock reads in anything the gallery captures.
- Commit `artifacts/`, screenshots, or exported icons' intermediates.

---

## 4. Validation harness spec

### 4.1 `/dev/gallery`

- Dev-only route (stripped from prod builds). Left nav = registry list; main pane
  renders one entry at real size.
- **Registry** (`app/src/dev/galleryRegistry.ts`): named entries, each
  `{ id, render: () => JSX, viewports?: [...] }`. Board entries build state by
  replaying a UHP fixture from `e2e/fixtures/`. Interaction states (piece lifted,
  ghost targets, drag-over-invalid, stack fanned) are produced by constructing the
  controller in that state directly — no synthetic pointer events needed.
- **`?static=1`**: disables all animation (CSS `*{animation:none;transition:none}` +
  a controller flag), pins names/avatars/timestamps to fixed fixture values.
- Minimum registry by end of M3: sprite contact sheet; empty board; early/mid/late
  base-game boards; tall-stack board; every §6.2 interaction state; tray full/depleted/
  queen-pulse; move list open; each end-of-game outcome (surround win/loss, draw);
  confirm dialogs. M4 adds: landing, join, lobby (your-turn/waiting/finished, empty),
  new-game form. M5 adds: coach mark, offline lobby.

### 4.2 Scripts

- **`validate:visual`**: Playwright iterates the registry × 3 viewports × light/dark
  → `artifacts/screens/<entry>--<viewport>--<theme>.png`. Machine checks per capture:
  zero console errors/warnings; every `<use>` has a non-empty bbox (no broken sprite
  refs); board bbox fits the viewport after auto-fit. Exits nonzero on any machine
  check; prints the capture list for the agent's review pass.
- **`validate:ux`**: scripted §6.2 flows via real pointer events (drag happy path,
  drop-on-invalid spring-back, Esc cancel, tap-tap move, tap-cancel, pan/zoom
  mid-drag) asserting controller state transitions, each capturing
  before/during/after frames to `artifacts/screens/ux/`.
- Both run headless in CI (machine checks only); the **review pass** is the agent
  reading images locally per §0.2.5.

### 4.3 `e2e/visual-checklist.md` (seed content)

Per-screen checklists; initial global items:

- Bug glyphs distinguishable from each other at 40 px; readable at minimum zoom.
- White/black tiles and their glyphs legible in **both** themes; ghost targets
  clearly visible on the board background in both themes.
- Dimmed (non-target) content still readable; dim ≈ 20%, not 80%.
- Stack offsets convey height; fanned stack doesn't overlap player bars.
- All interactive targets ≥ 44×44 px on the phone viewport.
- Player bars, tray, and board never overlap; safe-area respected at 390×844.
- Last-move highlight visible but subordinate to selection highlights.
- Victory overlay: clear hierarchy (outcome → reason → stats → actions); readable
  over any board.
- Text contrast ≥ 4.5:1 (spot-check the MUI theme tokens).
- No layout shift between `?static=1` captures of the same entry (determinism).

Accepted deviations are logged at the bottom with date + reason.

---

## 5. Frozen engine API

`@hive/engine` exports exactly this surface (extend only with a DESIGN.md update):

```ts
export type Color = 'w' | 'b';
export type BugKind = 'Q' | 'A' | 'S' | 'G' | 'B' | 'M' | 'L' | 'P';

export interface TileId { color: Color; kind: BugKind; ordinal: 1 | 2 | 3 } // e.g. wA2
export interface Hex { q: number; r: number }                // axial, pointy-top
export type CellKey = string;                                // `${q},${r}`

export interface GameOptions {
  mosquito: boolean; ladybug: boolean; pillbug: boolean;
  tournamentOpening: boolean;                                // no queen as first tile
}

export type Move =
  | { type: 'place'; tile: TileId; to: Hex }
  | { type: 'move';  tile: TileId; from: Hex; to: Hex }      // piece moves itself
  | { type: 'toss';  by: TileId;  tile: TileId; from: Hex; to: Hex } // pillbug toss
  | { type: 'pass' };

export type GameResult =
  | { status: 'ongoing' }
  | { status: 'won'; winner: Color; by: 'surround' }
  | { status: 'draw'; by: 'surround' | 'repetition' };

export interface GameState {
  readonly options: GameOptions;
  readonly board: ReadonlyMap<CellKey, readonly TileId[]>;   // stack bottom→top
  readonly hands: Readonly<Record<Color, Readonly<Record<BugKind, number>>>>;
  readonly toMove: Color;
  readonly turn: number;                                     // per-player full turns, 1-based
  readonly lastMoved?: { tile: TileId; byPillbug: boolean };
  readonly passCount: number;
  readonly positionHashes: readonly bigint[];
}

export function initialState(options: GameOptions): GameState;
export function legalMoves(state: GameState): Move[];        // exhaustive; UI renders ONLY this
export function applyMove(state: GameState, move: Move): GameState; // throws IllegalMoveError
export function result(state: GameState): GameResult;        // board outcomes only (resign etc. live in the game doc)
export function toUhp(move: Move, state: GameState): string;
export function parseUhp(uhp: string, state: GameState): Move; // ambiguity ⇒ self-move
export function hash(state: GameState): bigint;

// hex utilities (shared with the renderer/drag layer)
export function neighbors(h: Hex): Hex[];
export function hexToPixel(h: Hex, size: number): { x: number; y: number };
export function pixelToHex(x: number, y: number, size: number): Hex; // fractional-cube round
```

---

## 6. Test vectors & invariants

### Property-test invariants (fast-check, T1.10 / T2.4)

Over random legal games (pick uniformly from `legalMoves` until terminal or 300 plies):

1. Every move returned by `legalMoves` is accepted by `applyMove` (never throws).
2. After every move the hive is connected (independent BFS check, not the engine's).
3. Tile conservation: hand counts + board tiles = initial set, per color/kind.
4. `toUhp` → `parseUhp` round-trips to a deep-equal `Move` at every position.
5. Replaying the UHP log from `initialState` reproduces the final state and `hash`.
6. `legalMoves` is never empty (pass is generated when nothing else is legal).
7. A player with an unplaced queen after turn 3 is only offered queen placements.
8. `hash` equality for transposition-reached identical positions (spot-checked via
   shuffled move-order pairs).

### Pinned edge-case fixtures (T2.4 — one UHP fixture each)

- Pillbug may not toss the piece the opponent just moved.
- A tossed piece is stunned: cannot move or be tossed on its owner's next turn.
- Pillbug cannot toss a stacked (covered or covering) piece.
- Toss blocked by a full height-1 gate; allowed once the gate opens.
- UHP ambiguity: destination reachable by self-move *and* toss ⇒ parsed as
  self-move (and no stun results).
- Mosquito adjacent only to a mosquito ⇒ no moves.
- Mosquito on top of the hive moves only as beetle until it climbs down.
- Mosquito adjacent to pillbug can toss; the toss obeys all pillbug constraints.
- Ladybug must go exactly 2 on top + 1 down (no shortcuts, gate-checked at height).
- Spider cannot backtrack; exact-3 enforcement around a pocket.
- Ant blocked from a pocket by a gate it cannot slide through.
- Grasshopper jumps any straight line ≥1, never over gaps.
- Beetle climb blocked by a height gate (beetle-gate ruling).
- Covered tile is frozen; its cell counts as the covering color for placement.
- Queen must be placed by turn 4 (forced set); no moving before your queen is down.
- Tournament opening: queen illegal as either player's first placement.
- Forced pass position; two consecutive passes don't end the game (only surround/
  repetition/meta do).
- Simultaneous double-surround ⇒ draw.
- Threefold repetition (same position + same side to move) ⇒ draw.

### Full-game fixtures

- One base-only game to a surround win (T1.9).
- One all-expansions game to a win featuring at least one toss, one mosquito copy,
  and one ladybug move (T2.4).
- One game ending in threefold repetition.
These three also drive gallery board entries and the hot-seat e2e script.

---

## 7. Documentation policy — how the docs stay small

Docs rot in two ways: they grow (append-minded agents bolt on "Update:" sections,
new files, restated facts) and they drift (code changes, docs don't). Both are
prevented by construction, and the key rules are **machine-enforced** so PRs can't
merge past them.

### 7.1 The doc set is closed

Exactly these files, each with one job and a line budget:

| File | Job | Budget |
|---|---|---|
| `README.md` | elevator pitch + pointers | 25 |
| `CLAUDE.md` | agent entry point: hard rules + commands | 50 |
| `DESIGN.md` | the *current* design — what & why, present tense | 850 |
| `IMPLEMENTATION.md` | how to build **what isn't built yet** + harness/fixture reference | 450 |
| `DECISIONS.md` | append-only decision + SHIPPED log | no cap; ≤8 lines/entry |
| `e2e/visual-checklist.md` | living visual-review checklist | 150 |

`DECISIONS.md` is the **only** file allowed to grow over time — and it grows
linearly, in cheap fixed-size entries. Everything else holds its budget forever.

### 7.2 Rules

1. **Current state only.** Docs describe the system as it is; history lives in git
   and DECISIONS.md. Amend sections in place — never append "Update (date):" blocks,
   never keep superseded text "for context," never narrate what changed (that's the
   PR description's job).
2. **One home per fact.** Commands live in CLAUDE.md; schema in DESIGN.md §5.2;
   frozen API in IMPLEMENTATION.md §5; and so on. Other docs *link* (`DESIGN §5.2`),
   never restate. If you're about to paste a fact that exists elsewhere, link it.
3. **The plan is self-consuming.** When a milestone's gate is green and merged,
   replace its task table in §2 with one line — `### M1 — shipped, see DECISIONS.md`
   — and append a SHIPPED entry to DECISIONS.md (date, gates run, deviations from
   plan, stumbles worth remembering; ≤8 lines). Task detail is preserved by git
   history, not by the living doc. By M6 this file is mostly §4–§6 reference.
4. **New ideas don't open new files.** Post-v1 ideas become one-line DECISIONS.md
   entries tagged `post-v1`. Creating any new `.md` under `hive/` requires a
   DECISIONS entry justifying it *and* a row in the §7.1 table, in the same PR.
5. **Checklist hygiene.** Fixed visual deviations are deleted, not marked fixed;
   the accepted-deviations list holds only what is *currently* accepted.
6. **Raising a budget is a decision, not a workaround.** An over-budget PR must cut
   or consolidate; if a budget is genuinely too small, raise it in the §7.1 table
   with a DECISIONS entry saying why.

### 7.3 Enforcement (what makes agent PRs respect it)

- **Mechanical gate (T0.8):** `scripts/check-docs.mjs`, wired into `pnpm typecheck`
  and CI, fails on (a) any budget in §7.1 exceeded, (b) any `.md` under `hive/` not
  in the table, (c) the literal marker `Update (` or `UPDATE:` appearing in
  DESIGN.md/IMPLEMENTATION.md — the tell-tale of append-minded editing. Since
  `typecheck` runs on every push, no PR merges past a bloated doc.
- **Protocol hook:** the §0 definition-of-done includes the docs item — the owning
  doc section is amended *in the same PR* as the behavior change (no follow-up
  doc-sync PRs), plus a DECISIONS entry if the PR made a judgment call.
- **CLAUDE.md carries the summary** every agent reads on entry, so the policy
  doesn't depend on agents finding this section.
- **Review question for every PR:** "does this diff add doc text a future reader
  doesn't need?" Narration, alternatives considered, and progress notes belong in
  the PR description, which is free — the docs are not.

## 8. Open items / deliberately deferred

- Real-time chess clocks, takebacks, offline move queueing, chat, AI, analysis —
  post-v1 (DESIGN §10 v1.1 list).
- "Current board snapshot" image endpoint for the website card — post-v1.
- If Playwright pixel-diff snapshots ever get added, they gate only the sprite
  contact sheet (art churn makes full-board pixel gates noisy) — decision deferred
  to M6.
