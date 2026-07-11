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

- **pnpm workspace** rooted at `hive/`. Packages:
  `packages/engine`, `packages/app`, `packages/functions`, `e2e`.
- **TypeScript strict** everywhere (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`). Engine has `"sideEffects": false` and **zero
  runtime dependencies**.
- Key deps: React 18 + MUI 5 + Vite 5 + `vite-plugin-pwa`; `react-router`;
  TanStack Query; Vitest + `fast-check` + Testing Library; Playwright;
  `firebase` (app) / `firebase-admin` + `firebase-functions` (functions);
  `firebase-tools` for emulators/deploy. Pin majors in the root README when scaffolding.
- Root scripts (the house convention):

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

### M0 — shipped, see DECISIONS.md

### M1 — shipped, see DECISIONS.md

### M2 — shipped, see DECISIONS.md

### M3 — shipped, see DECISIONS.md

### M4 — shipped, see DECISIONS.md

### M5 — shipped, see DECISIONS.md

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
export function serializeState(state: GameState): string;   // games/{id}.state (DESIGN §5.2)
export function deserializeState(text: string): GameState;  // exact round-trip incl. hashes

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
