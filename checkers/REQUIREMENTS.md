# REQUIREMENTS — Checkers

American checkers (English draughts) for two: free hot-seat + online
multiplayer PWA on the @parlor/* platform.

## Functional

Rules (the engine is the sole authority):

- FR-1: 8×8 board, cells 0..63 row-major; only the 32 dark squares
  ((row+col) % 2 === 1) are playable. Pieces: dark/light men and kings.
- FR-2: Seats ARE sides — 'dark' (seat 0) and 'light'; dark moves
  first. Setup: 12 dark men on the dark squares of rows 0-2 (top), 12
  light men on rows 5-7. Dark moves down the board (+row), light up.
- FR-3: Simple move — one diagonal step to an empty dark square; men
  forward only, kings either way (one step; no flying kings).
- FR-4: Capture — jump an adjacent enemy piece to the empty square
  beyond, diagonally; men forward only, kings any direction.
- FR-5: Captures are mandatory: if any capture exists for the side to
  move, only capture moves are legal.
- FR-6: Multi-jumps are mandatory to continue: a jump sequence goes on
  while the SAME piece has another jump from its landing square; the
  player picks freely among available jumps (no maximal-capture rule).
- FR-7: A whole multi-jump is ONE move / one log entry —
  `{ path: number[] }`, path[0] the origin then each landing (length
  ≥ 2; simple moves exactly 2).
- FR-8: A man reaching the far row is crowned immediately; crowning
  ends the jump sequence.
- FR-9: Win — the opponent has no legal moves at the start of their
  turn (covers both no-pieces-left and fully blocked). Draw — threefold
  repetition of (board + side to move), initial position seeded.
- FR-10: Resign and timeout fold as log entries; the other side wins.

Surfaces (inherited from the exemplar, re-skinned):

- FR-11: Hot-seat game at /game/local — firebase-free static build.
- FR-12: Online play — createGame (side dark/light/random + optional
  1/3/7-day move clock), invite links, join-by-code, direct challenges,
  rematch with sides swapped, resign, forfeit sweep on expired clocks.
- FR-13: Board UI — selecting a piece dots the landing squares of its
  complete legal paths; tapping a dot submits the whole path. aria:
  grid 'checkers board', 64 gridcells labelled 'b3' / 'b3 dark man' /
  'e4 light king' etc.; last-move wash on the path's endpoints.
- FR-14: Lobby with live game list, turn badge, and push notifications
  (your move, game joined — 'dark opens', game over, deadline warning).

## Non-functional

- NFR-1: The exemplar's invariants carry over: pure deterministic
  engine (no Math.random/clock/DOM), server-authoritative moves, the
  move log as the source of truth, serialized state validated on read.
- NFR-2: Property sweep — random full games (mulberry32 over fast-check
  seeds) hold: legal moves exist until a result; applying a generated
  legal move never throws; piece counts only decrease; the board stays
  64 chars with pieces on dark squares only; same seed, same game.

## Out of scope (v1)

- Maximal-capture / huffing variants; flying kings (international
  draughts); draw offers or 40-move counters; engine opponent (AI);
  move-path disambiguation UI when two paths share a landing square
  (first path wins — see DECISIONS.md); spectators; ratings.
