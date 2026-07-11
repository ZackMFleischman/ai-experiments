# DONE — Checkers

The factory's definition of done (strategy §3). Check items off in the
PRs that land them; the app ships when everything is checked. The stamp
starts green — keep it green at every step.

## Morph (the PLAYBOOK's core loop)

- [ ] Engine replaced with Checkers's rules (pure, deterministic,
      property-tested; golden trace where the archetype has one)
- [ ] Screens/board render the new game; gallery fixtures updated
- [ ] Server config (options/seats/advance) + emulator tests updated
- [ ] Docs describe Checkers (no exemplar leftovers); DECISIONS.md
      records the judgment calls

## Gates (all green in CI)

- [ ] typecheck (docs + boundary + rules-parity lints included)
- [ ] unit suites (engine property sweep widened in validate)
- [ ] Playwright visual gallery — captures actually reviewed
- [ ] emulator suite (callables + security rules negative paths)
- [ ] hot-seat e2e smoke
- [ ] no-firebase bundle assert (hot-seat build)

## Ship

- [ ] Deploy workflow green (Cloudflare preview link works)
- [ ] Brand theme + MoreFromUs present; accent/mark/icons are
      Checkers's own (packages/app/scripts/mark.mjs)
- [ ] ⚑ prod Firebase project + secrets (GAME-SETUP.md §11); budget
      alerts; real-device push check
- [ ] ⚑ human playtest on the PR preview URL — the button only a person
      can press
