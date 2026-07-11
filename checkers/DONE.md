# DONE — Checkers

The factory's definition of done (strategy §3). Check items off in the
PRs that land them; the app ships when everything is checked. The stamp
starts green — keep it green at every step.

## Morph (the PLAYBOOK's core loop)

- [x] Engine replaced with Checkers's rules (pure, deterministic,
      property-tested; golden trace where the archetype has one)
- [x] Screens/board render the new game; gallery fixtures updated
- [x] Server config (options/seats/advance) + emulator tests updated
- [x] Docs describe Checkers (no exemplar leftovers); DECISIONS.md
      records the judgment calls

## Gates (all green in CI)

- [x] typecheck (docs + boundary + rules-parity lints included)
- [x] unit suites (engine property sweep widened in validate)
- [x] Playwright visual gallery — captures actually reviewed
- [x] emulator suite (callables + security rules negative paths)
- [x] hot-seat e2e smoke
- [x] no-firebase bundle assert (hot-seat build)

## Ship

- [ ] Deploy workflow green (Cloudflare preview link works)
- [x] Brand theme present; accent/mark/icons are Checkers's own — wine
      accent (#7a1f3d) + crowned-checker mark (packages/app/scripts/
      mark.mjs). (MoreFromUs is a solo-app footer; duo titles cross-promote
      via arcade-site + the registry family list, not a play-screen footer.)
- [ ] Deploy workflow green (Cloudflare preview link) — ⚑ needs the
      owner's `checkers-zmf` Cloudflare Pages project + deploy secrets
      before the workflow can go green (surfaced in BRAND-IMPLEMENTATION.md)
- [ ] ⚑ prod Firebase project + secrets (GAME-SETUP.md §11); budget
      alerts; real-device push check
- [ ] ⚑ human playtest on the PR preview URL — the button only a person
      can press
