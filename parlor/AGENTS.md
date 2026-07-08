# AGENTS.md — parlor/

PARLOR is the game-agnostic platform workspace for the repo's turn-based two-player
PWA games. It is consumed by `hive/` and `lex/`.

## Read before work

- Read `README.md` first.
- Use `CLAUDE.md` for detailed project rules.
- Design rationale and the port map live in `../lex/DESIGN.md`.
- Parlor has no independent feature task list; it grows in service of a consumer task.

## Commands

Run commands from `parlor/`:

```sh
pnpm install
pnpm typecheck
pnpm test
```

When changing shared behavior, run a relevant consumer check in `hive/` or `lex/` when
practical.

## Hard rules

- Never import game packages (`@lex/*`, `@hive/*`) or reference game-specific concepts.
- `@parlor/core` stays zero-dependency, pure TypeScript, and deterministic.
- React, Firebase, and MUI are peer dependencies for web packages; consumers provide
  them.
- Firebase imports belong only in the web/server surfaces.
- Keep ported-from-hive headers on ported files.
- Breaking `@parlor/*` public interfaces requires updating consumers and docs in the
  same change.
- Never weaken tests to pass a gate.
