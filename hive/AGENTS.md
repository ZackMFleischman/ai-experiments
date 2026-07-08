# AGENTS.md — hive/

HIVE is a two-player PWA of the board game Hive. It is an independent pnpm
workspace; nothing here relates to `loom/`.

## Read before work

1. `DESIGN.md` for architecture and frozen public surfaces.
2. `IMPLEMENTATION.md` for the build protocol and milestone gates.
3. `CLAUDE.md` for the detailed project-specific rules.

## Commands

Run commands from `hive/`:

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

- The UI renders engine verdicts; it must not compute rules.
- `@hive/engine` stays zero-dependency, pure TypeScript, and deterministic.
- Firebase imports belong only in the documented sync/functions areas.
- Shared platform code comes from `@parlor/web`; `parlor/AGENTS.md` governs shared
  platform edits.
- Never weaken tests to pass a gate.
- Do not commit `artifacts/`.
- For visual tasks, run the visual gate and inspect the output before calling the task
  done.
