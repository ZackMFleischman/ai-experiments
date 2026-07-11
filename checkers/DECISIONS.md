# DECISIONS — Checkers

> Append-only. New entries at the bottom: date, decision, one-line why.
> ≤8 lines each. Milestone SHIPPED entries follow the same format (date,
> gates run, deviations, stumbles). Post-v1 ideas go here as one-liners
> tagged `post-v1`.

---

- **STAMPED — tools/create-app** (`--kind duo`, exemplar
  `tafl/`, accent `#7a1f3d`). The clone arrived
  all-gates-green playing the exemplar's game; everything below is
  Checkers's own history.

- **2026-07-11 — moves are paths.** `CheckersMove = { path: number[] }`
  (origin + every landing): one multi-jump = one move = one log entry =
  one wire payload. Legality is by construction — `legalMovesFrom`
  emits only COMPLETE paths, so mandatory capture and mandatory
  continuation are enforced by "is your path in the list", and apply
  never executes a partial sequence.

- **2026-07-11 — landing-square ambiguity: first path wins.** When two
  complete paths of one piece share a landing square, the board submits
  the first generated path (Board.tsx targets map). Both are legal, the
  material outcome can differ only in WHICH pieces die, and the
  geometry is rare — a picker UI is post-v1 if anyone ever notices.

- **2026-07-11 — crowning ends the jump sequence** (standard American
  rule). Encoded in path generation itself: a man landing on the crown
  row terminates its path there, so a freshly crowned king never
  continues jumping in the same move — and the engine tests pin the
  tempting counter-case (a continuation that only a king could take).

- **SHIPPED (pending CI + playtest) — 2026-07-11 M0 morph.** Gates run
  locally: typecheck+lints, engine 54 / app 7 / functions 19 (emulator),
  build + bundle assert, validate:m1 (CHECKERS_PROP_GAMES=200), hot-seat
  e2e, visual (36 captures reviewed). Deviations: none — the stamp's
  shapes fit; property test needed a per-test timeout + an
  allLegalMoves that computes the mandatory-capture gate once.
  Human interventions: 0 in this leg.
