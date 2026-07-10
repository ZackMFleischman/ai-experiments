# REQUIREMENTS — Sudoku v1

The first solo title of the minimalist-apps brand: classic 9×9 sudoku,
free on the web, offline-first, no account, no backend, no ads — ever.

## Functional

- **FR-1** New game at four difficulties: easy, medium, hard, expert.
- **FR-2** A daily puzzle: identical for every player on the same local
  date, medium difficulty, labeled with its date.
- **FR-3** Every generated puzzle has exactly one solution; every clue
  matches that solution.
- **FR-4** Easy and medium are solvable with naked/hidden singles only
  (no pencil marks required); hard/expert may require more.
- **FR-5** Tap a cell then a digit (or type 1–9) to place; erase clears;
  arrows move the selection; givens are immutable.
- **FR-6** Notes mode pencils candidate digits per cell; placing a digit
  clears its own notes and erases that digit from peers' notes.
- **FR-7** Unlimited undo/redo across the whole game, surviving reload.
- **FR-8** Conflicting placements (duplicate in row/col/box) highlight as
  errors; the solution is never revealed implicitly.
- **FR-9** The digit pad shows digits used up (nine placed) as spent.
- **FR-10** An in-progress game persists locally and resumes from the
  home screen (one game at a time).
- **FR-11** A per-game elapsed clock, persisted across reloads, stopped
  on solve.
- **FR-12** On solve: quiet completion overlay with time; the result is
  recorded locally (difficulty/daily bucket, duration, day).
- **FR-13** Local stats on home: solved count, current day-streak, best
  time. No account, no sync.
- **FR-14** Light/dark mode, defaulting to the OS, persisted.
- **FR-15** A "More from us" panel linking the family's other apps.

## Non-functional

- **NFR-1** Zero backend: static hosting only; no firebase in the bundle
  (machine-checked); no network calls at runtime.
- **NFR-2** `@sudoku/engine` is pure, zero-dependency, deterministic;
  same seed + difficulty ⇒ same puzzle, forever.
- **NFR-3** Installable PWA; full offline cold-start.
- **NFR-4** Responsive ≥ 375 px; touch targets ≥ 44 px; board legible at
  phone sizes; keyboard fully usable on desktop.
- **NFR-5** All engine invariants gated by tests (uniqueness sweep in CI).
- **NFR-6** Ships free; the $1 native (Capacitor) wrap is a later phase of
  the strategy, not v1 scope.

## Out of scope (v1)

Hints/auto-solve, multiple saved games, variants (killer, 6×6), cloud
sync, leaderboards, sounds, tutorials, Capacitor packaging.
