# IMPLEMENTATION — Checkers

Status ledger. Design rationale in `DESIGN.md`; the factory runbook is
`tools/create-app/PLAYBOOK.md`; the acceptance checklist is `DONE.md`.

## §0 Build protocol

Tests first where behavior is specifiable; `pnpm typecheck && pnpm test`
always-on; docs amended in the same PR; never weaken a gate.

## §2 Milestones

### M0 — morph the stamp into Checkers — DONE (local gates)

The stamp arrived green playing Brandub; the morph landed engine-first
(tests rewritten to specify American checkers, then the kernel: path
moves, mandatory captures, crowning, no-moves/repetition results), then
the app layer (board/MiniBoard, path-landing selection, seat copy,
gallery fixtures, mark), then functions (dark/light seats, path wire
moves, rigged no-moves terminal test). All local gates green: typecheck
(+ docs/boundary/parity lints), engine 54 / app 7 / functions 19 tests,
build + no-firebase bundle assert, validate:m1 (200-game sweep),
hot-seat e2e, visual gallery (36 captures reviewed). Remaining: CI runs
on the PR, then the Ship items (deploy preview, ⚑ prod Firebase,
⚑ human playtest).

## §7 Docs policy

Closed, line-budgeted doc set enforced by `scripts/check-docs.mjs`
(wired into `pnpm typecheck`): README 25 · CLAUDE 55 · REQUIREMENTS 250
· DESIGN 500 · IMPLEMENTATION 400 · DONE 120 · DECISIONS uncapped
(append-only). Amend in place — no "Update:" markers.
