# AGENTS.md — lex/

LEX is a two-player crossword-tile-game PWA. It is an independent pnpm workspace and
shares platform architecture with `hive/` through sibling `parlor/` packages.

## Read before work

1. `REQUIREMENTS.md` for the numbered v1 feature inventory.
2. `DESIGN.md` for architecture and frozen surfaces.
3. `IMPLEMENTATION.md`, especially the build protocol and lessons from `hive/`.
4. `CLAUDE.md` for detailed project-specific rules.

## Bootstrap

Install `parlor/` before `lex/` when dependencies are missing because `lex/` consumes
linked `@parlor/*` packages.

## Commands

Run commands from `lex/`:

```sh
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm validate
pnpm validate:visual
pnpm validate:ux
```

Use targeted `pnpm validate:m*` commands for milestone-specific work.

## Hard rules

- The UI renders engine/dictionary verdicts; it must not compute game rules.
- `@lex/engine`, `@lex/dict`, and `@parlor/core` stay zero-dependency, pure
  TypeScript, and deterministic.
- Rack letters and bag contents are private: never expose them in public docs, logs,
  pushes, or client-visible errors.
- Game dimensions come from ruleset data, not hard-coded UI assumptions.
- `parlor/AGENTS.md` governs shared platform edits.
- Never weaken tests to pass a gate.
- Do not commit `artifacts/` or compiled dictionary outputs.
