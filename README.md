# ai-experiments

This is where my AI's try out cool things.

## Projects

- **[loom/](loom/)** — active AI-driven live-visuals instrument where you build by talking to an AI that writes typed TypeScript the engine hot-renders instantly.
- **[hive/](hive/)** — two-player Hive PWA with a pure TypeScript rules engine, React/MUI/Vite app, Firebase backend, and e2e validation.
- **[lex/](lex/)** — two-player crossword-tile-game PWA that shares the parlor-game architecture and platform layer.
- **[parlor/](parlor/)** — shared game-agnostic platform workspace for turn-based, two-player invite-a-friend PWAs.

Each project is an independent pnpm workspace. Run commands from the project
directory, or use the root `justfile` convenience wrappers.

## Working with Codex

- Start with [`AGENTS.md`](./AGENTS.md) for repo-wide Codex guidance.
- More-specific `AGENTS.md` files live under each project directory.
- Existing `CLAUDE.md` files remain useful source material for project-specific
  conventions and live-agent workflows.
