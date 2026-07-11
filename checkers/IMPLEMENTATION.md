# IMPLEMENTATION — Checkers

Status ledger. Design rationale in `DESIGN.md`; the factory runbook is
`tools/create-app/PLAYBOOK.md`; the acceptance checklist is `DONE.md`.

## §0 Build protocol

Tests first where behavior is specifiable; `pnpm typecheck && pnpm test`
always-on; docs amended in the same PR; never weaken a gate.

## §2 Milestones

### M0 — morph the stamp into Checkers — IN PROGRESS

The stamp arrives green, playing the exemplar's game. Morph the core
(engine → screens → docs) per the PLAYBOOK, keeping every gate green;
check off `DONE.md` as each lands.

## §7 Docs policy

Closed, line-budgeted doc set enforced by `scripts/check-docs.mjs`
(wired into `pnpm typecheck`): README 25 · CLAUDE 55 · REQUIREMENTS 250
· DESIGN 500 · IMPLEMENTATION 400 · DONE 120 · DECISIONS uncapped
(append-only). Amend in place — no "Update:" markers.
