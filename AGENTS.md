# AGENTS.md

Codex instructions for the `ai-experiments` umbrella repo.

## Repo shape

This is not a single root workspace. It contains independent pnpm workspaces:

- `loom/` — active AI/live-visuals instrument.
- `hive/` — two-player Hive PWA.
- `lex/` — two-player crossword-tile-game PWA.
- `parlor/` — shared platform layer for the turn-based games.

Do not assume commands run from the repository root. Enter the relevant workspace first.
If a task is ambiguous, ask which project; assume `loom/` only when the task mentions
LOOM, visuals, scenes, modules, MCP, sidecar, live rendering, or content generation.

## Bootstrap

Install only the workspace you are working in:

```sh
cd loom && pnpm install
cd parlor && pnpm install
cd hive && pnpm install
cd lex && pnpm install
```

`loom/` uses pnpm 11; `hive/`, `lex/`, and `parlor/` use pnpm 10. When working on
`lex/`, install `parlor/` first because `lex/` consumes sibling `@parlor/*`
packages through linked workspace dependencies.

## Common commands

A root `justfile` provides convenience wrappers, but running commands from each
workspace is always acceptable.

### LOOM

```sh
cd loom && pnpm typecheck
cd loom && pnpm test
cd loom && pnpm validate
```

### HIVE

```sh
cd hive && pnpm typecheck
cd hive && pnpm test
cd hive && pnpm validate
```

### LEX

```sh
cd lex && pnpm typecheck
cd lex && pnpm test
cd lex && pnpm validate
```

### PARLOR

```sh
cd parlor && pnpm typecheck
cd parlor && pnpm test
```

## Validation matrix

| Change type | Minimum check | Stronger check |
| --- | --- | --- |
| LOOM content/module/scene | `cd loom && pnpm typecheck && pnpm test:content` | `cd loom && pnpm validate:stdlib` |
| LOOM runtime/engine/sidecar | `cd loom && pnpm typecheck && pnpm test` | Relevant `pnpm validate:*`, then `pnpm validate` |
| HIVE engine | `cd hive && pnpm typecheck && pnpm --filter @hive/engine test` | Relevant milestone validation |
| HIVE app/UI | `cd hive && pnpm typecheck && pnpm test` | Visual/UX/e2e validation |
| LEX engine/dict | `cd lex && pnpm typecheck && pnpm test` | Relevant `pnpm validate:m*` |
| PARLOR shared platform | `cd parlor && pnpm typecheck && pnpm test` | Consumer check in `hive/` or `lex/` |

## Global rules

- Do not hand-edit generated files.
- Do not commit build artifacts, validator artifacts, screenshots, or compiled dictionaries.
- Never weaken tests to pass a gate.
- Keep project boundaries intact: game packages must not leak into `parlor/`.
- For visible web-app changes, capture or inspect a screenshot when practical.
- Respect more-specific `AGENTS.md` files under project directories.

## Existing docs

The repo already has Claude-oriented guides with useful project detail. Treat them as
source material when a Codex `AGENTS.md` does not answer a question:

- `CLAUDE.md` — root overview and LOOM command list.
- `loom/.claude/CLAUDE.md` — detailed LOOM live-session/MCP workflow.
- `hive/CLAUDE.md`, `lex/CLAUDE.md`, `parlor/CLAUDE.md` — project rules.
