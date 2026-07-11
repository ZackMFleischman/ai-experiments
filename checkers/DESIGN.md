# DESIGN — Checkers

How the pieces fit. Stamped from `tafl/` — its DESIGN.md is the
reference for every inherited section; this file documents where
Checkers diverges.

## §1 Shape

The exemplar's workspace shape, verbatim (see `tafl/DESIGN.md` §1):
engine (pure rules kernel) → app (screens over a LogSession fold) →
functions (@parlor/server callables shaped by config.ts), with parlor
consumed as source-linked siblings.

## §2 Engine

`@checkers/engine` keeps tafl's surface shape (initial/apply/legal*/
result-in-state, `IllegalMoveError`, validating deserialize) with three
checkers-specific ideas:

- **Path moves.** A move is `{ path: number[] }` — origin then every
  landing square. One move = one log entry = one wire payload, so a
  triple jump replays, syncs, and renders exactly like a simple step.
  `legalMovesFrom(state, from)` returns COMPLETE paths only; a path is
  complete when its piece has no further jump from the last landing
  (or just crowned). `applyCheckers` validates by construction: the
  submitted path must equal one of the generated complete paths —
  mandatory capture and mandatory continuation fall out for free, and
  execution only ever replays a known-legal path (jumped piece = the
  hop's midpoint, `(a+b)/2` on a diagonal 2-row hop).
- **Mandatory-capture legality.** Move generation is two-phase: a
  side-wide "does any jump exist?" gate, then per-piece moves — jumps
  via DFS over a working board copy (captured pieces leave the board
  immediately, so nothing is jumped twice; a man landing on the crown
  row stops there), or one-step diagonals when no jump exists anywhere.
- **The `seen` ledger** (tafl's pattern, kept verbatim): a
  `(board + toMove) → count` map inside the state, seeded with the
  initial position; the third sighting of any key is the repetition
  draw. The only other terminal is no-moves — checked for the opponent
  right after every fold, which covers both "no pieces" and "blocked"
  with a single rule.

Board geometry stays flat-index arithmetic (`board.ts`): 0..63
row-major, playable = odd (row+col) parity — a diagonal step preserves
parity, so pieces can never leave the dark squares. `cellName` is
a1-style with rank 1 at the TOP row (tafl's convention), `moveName`
joins with '-' for steps and '×' for jumps ('b6×d4×f2').

## §3 App

The exemplar's screens carry over one-for-one; checkers's divergences:

- **Path-landing selection.** The board dots the landing squares of the
  selected piece's complete paths and submits the full path on tap —
  the multi-jump UX costs one tap, same as a step. When two complete
  paths of the same piece share a landing square (rare double-jump
  geometry), the first generated path wins — a v1 simplification
  (DECISIONS.md); the last-move wash marks the path's endpoints.
- **Seats are sides, again.** 'dark'/'light' are the seat keys, the
  engine's `toMove` values, and the doc field names; dark = seat 0
  moves first. No mapping layer anywhere (tafl's lesson, kept).
- **Pieces are theme-relative discs**: dark = text.primary fill, light
  = background.paper with an ink border; kings wear a ♛ glyph.
  MiniBoard repeats the same encoding statically for lobby cards and
  the landing hero.

## §4 Testing

The exemplar's four layers carry over. Checkers-specific gates:

- Engine unit suites pin the rules: setup, forward-only men, kings,
  mandatory capture, mandatory continuation, free branch choice,
  crowning (including crowning-ends-jump), both no-moves flavors,
  repetition, serialize round-trip + corruption rejection.
- The property sweep (NFR-2) plays whole random games via mulberry32;
  `CHECKERS_PROP_GAMES` widens it (10 default, 200 in validate:m1).
- The visual harness asserts every rendered board has 64 gridcells and
  fits the viewport; the gallery's mid-game fixture folds real moves —
  two of them mandatory jumps — through the engine, so an illegal
  fixture fails loudly.
