---
name: new-app
description: >-
  Stand up a new game/app workspace in this portfolio from a living exemplar.
  Use when asked to "create a new app/game", "stamp a new <kind>", "add a
  sudoku-like / breakout-like / duo game", or start a title from a brief in
  tools/create-app/briefs/. Wraps the create-app factory + PLAYBOOK + DONE.md
  flow — the discoverable default path, so nobody hand-copies a workspace.
---

# new-app — stamp a new workspace from the factory

The factory (`tools/create-app/index.mjs`) is the ONLY supported way to create
a workspace. It clones the archetype's living exemplar all-gates-green, stamps
fresh docs + `DONE.md`, stamps the repo-root workflows, and registers the app
in `registry/apps.json`. Never hand-copy an existing game dir.

## 1. Pick the archetype

| `--kind`  | exemplar   | backend           | use for                          |
|-----------|------------|-------------------|----------------------------------|
| `duo`     | tafl       | Firebase (parlor) | two-player invite-a-friend games |
| `solo`    | sudoku     | none (Cloudflare) | single-player turn/puzzle games  |
| `arcade`  | breakout   | none (Cloudflare) | single-player realtime/canvas    |
| `utility` | stillness  | none (Cloudflare) | no game engine (timers, tools)   |

## 2. Stamp it

```
# from repo root — parlor must be installed first (source-linked siblings)
cd parlor && pnpm install && cd ..
node tools/create-app/index.mjs <name> --kind <kind> \
  --display "Display Name" --glyph "🔷" --tagline "One line."
```

Identity flags default from the exemplar's registry entry; `--glyph` has a
placeholder default — pass the real one (the check-registry gate wants a
non-empty glyph, and the PLAYBOOK's mark swap expects the game's own). The
stamp appends the app to `registry/apps.json` (status `coming-soon`) and
regenerates the brand family list.

## 3. Prove the stamp is green BEFORE morphing

```
cd <name> && pnpm install && pnpm typecheck && pnpm test
```

Both must pass playing the exemplar's game. Commit the stamp + its
`.github/workflows/<name>-*.yml` before any edit.

## 4. Morph to the brief

`tools/create-app/PLAYBOOK.md` is the runbook: engine first (pure, property-
tested) → board UI against `@parlor/harness` `/dev/gallery` → wire transport →
keep every gate green at each step. Work the checklist in `<name>/DONE.md`;
the app ships when it's all checked. The mechanical ~90% is templated — your
edits are the game-specific core listed in `DONE.md` under "morph these".

## Gates the stamp inherits (never weaken to pass)

typecheck (docs + boundary + rules-parity lints), engine unit + property
tests, visual gallery sweep, no-firebase bundle assert, and for duo the
emulator callable/rules negative tests. `registry-ci` + `factory-ci` guard the
registry entry and the generator itself.

When the app is built and you're ready to deploy/store it, use the
**ship-game** skill.
