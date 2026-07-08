# AGENTS.md — loom/

LOOM is an AI-driven live-visuals instrument. Agents write typed TypeScript; the
engine hot-renders it while a human may be watching the output.

## Start here

- Read `README.md` for quickstart and the doc map.
- Read `docs/architecture.md` before changing `packages/`.
- Read `DECISIONS.md` when touching an unfamiliar subsystem; append short entries for
  non-obvious decisions or milestone-level shipped work.
- For live visual-session workflow details, use `.claude/CLAUDE.md` as source
  material even when running under Codex.

## Commands

Run commands from `loom/`:

```sh
pnpm install
pnpm dev
pnpm sidecar
pnpm typecheck
pnpm test
pnpm test:content
pnpm validate
pnpm validate:stdlib
```

`pnpm typecheck` regenerates `content/CATALOG.md` before running TypeScript. Do not
hand-edit that file.

## Codex/MCP notes

- Start from `loom/` when using the LOOM MCP sidecar.
- `.mcp.json` launches `packages/sidecar/src/index.ts` through `tsx`.
- If MCP tools are unavailable, fall back to `pnpm typecheck`, `pnpm test`, targeted
  validator scripts, and browser screenshots for visible changes.
- Prefer sandbox/staged work over directly changing the live output when a human may
  be watching.

## Hard rules

- Preserve the "never go black" safety model: bad edits, build errors, or render
  throws must not blank the live output.
- `content/` is normal agent territory. Changes under `packages/*` are engine work and
  need extra care.
- Do not hand-edit generated files such as `content/CATALOG.md`.
- Do not commit `artifacts/` or validator screenshots.
- New modules need a `content/test/cases.ts` entry.
- Keep `three` pinned exactly unless explicitly asked to upgrade it.
- Prefer params and manifests for feel/tuning changes; edit code when structure needs
  to change.
