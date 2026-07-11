# PLAYBOOK — building a brand app with create-app

The per-app runbook handed to Claude Code (strategy §3, decision A4: AI
builds, human reviews/ships). Input: a 1-page brief (name, kind, the
game's rules, accent, tagline — see `tools/create-app/briefs/`). Output: a
PR the owner playtests from its preview URL and ships.

## 0. Why the stamp plays the wrong game

`create-app` clones the archetype's **living exemplar** (duo=tafl,
solo=sudoku, arcade=breakout, utility=stillness) with identity rewritten —
so the stamp is all-gates-green from minute one, *playing the exemplar's
game*. You then **morph the game-specific core** while every other gate
(docs lint, boundary lint, bundle/parity checks, visual harness, CI,
deploy) keeps passing. You are never debugging a half-wired skeleton; you
are always one failing test away from green. Templates extracted from
shipped apps, never invented — this is that, taken literally.

## 1. Stamp

```
node tools/create-app/index.mjs <name> --kind duo|solo|arcade|utility \
  --display "Name" --tagline "..." --accent "#rrggbb" --port 52X0
cd <name> && pnpm install && pnpm typecheck && pnpm test   # must be green untouched
git add <name> .github/workflows/<name>-*.yml   # commit the stamp as-is
```

Ports: pick an unused base (grep `--port` history: sudoku 5199, breakout
5201, tafl 5202/03). The stamp rewrites the exemplar's e2e/dev ports from
the base.

## 2. Morph the engine first (tests before code)

Replace `packages/engine/src` internals with the brief's rules, driving
from its tests: rewrite the test files to specify the new game, watch them
fail, make them pass. Keep the exemplar's *shape* — pure state + fold,
seeds/ledgers in the state, `IllegalMoveError`, serialization round-trip,
the property test (random playouts, env-widened) and, for arcade, the
golden trace + same-seed/same-trace determinism gate. The engine's public
surface should stay shape-compatible where it can (duo: `initialX/applyX/
legalDestinations/result` etc.) — the less the app layer changes, the
faster step 3 goes.

## 3. Morph the app layer

- **duo**: board component (render `legalDestinations()` only), the
  functions `config.ts` (options, seat names — prefer seats-ARE-sides,
  tafl's lesson), the wire move in `gameApi.ts`/`parseMove`, lobby
  caption/thumbnail, gallery fixtures, emulator tests.
- **solo/arcade**: `game/` session or loop wiring, screens, gallery
  fixtures, `store/listing.ts` copy, native test expectations.
- **utility**: screens + the native plugin wiring the app exists for.
- All kinds: `packages/app/scripts/mark.mjs` (the app's own mark — icons
  regenerate from it), manifest/index.html copy, Home pitch, FAMILY list.
- All kinds: keep the `@parlor/brand` shell — `AppShell`, `GameHud`,
  `MoreFromUs`, theme tokens (`palette.board`) — in place; they encode
  repo-root `DESIGN-PRINCIPLES.md`. Morph what the game *is*, never how
  the family *looks*; no hardcoded surface hexes in app code.

## 4. Docs + DONE

The stamped docs are budgeted TODO skeletons — fill them as the morph
lands (docs lint already enforces the budgets). Check `DONE.md` off in the
same PRs; it is the factory's definition of done. Judgment calls →
`DECISIONS.md` (append-only, ≤8 lines).

## 5. Gates, then hand to the human

`pnpm typecheck && pnpm test && pnpm build` plus the app's `validate:*`
set, locally and in CI. Read the visual captures — don't just pass the
gate. Then the ⚑ items (store ops, Firebase project, device checks) and
the one button only a person can press: playtest the preview URL and ship.

## Interventions log

The Phase-4c acceptance ("stamp checkers/ and drive it to all-gates-green
with <~5 human interventions") counts every time a human had to unblock
the loop — record them in the app's DECISIONS.md SHIPPED entry.
