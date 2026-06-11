# LOOM

LOOM is a live-visuals instrument where the primary way you build is by talking to
an AI: you describe a visual, a control, or a behavior; agents write typed
TypeScript into a repo; the engine hot-renders it the moment it's saved; you steer
with words, mouse, and MIDI until it feels right; you save it, and the library
grows.

**Status:** M0–M6 (palette half) shipped. Remaining to v1: M6 chains, M7 library
buildout, M8 geo/particles, M9 gig hardening — see [the roadmap](./docs/roadmap.md).

## Quickstart

```sh
pnpm install
pnpm dev          # Output window on http://localhost:5173/
```

- **Output** (`/`) — the projector surface. `?audio=test` for synthetic
  kick/hats when no mic is around (also the automatic fallback); `?hud=1` shows
  the fps readout; `?bpm=120` sets tempo (or tap `t`).
- **Console** (`/console.html`) — the human cockpit: instance tiles, param
  panel, input-rack drawer (`i`), MIDI-learn, COMMIT/PANIC.
- **Staged** (`/staged.html`) — big preview of the staged candidate, for a
  second display.
- **Agent session** — start Claude Code from `loom/` so `.mcp.json` loads the
  MCP sidecar; the agent gets eyes (`screenshot`, `get_session`) and hands
  (`set_param`, `create_instance`, `stage`, …). Commits to the live output stay
  human-gated unless armed in the Console.

`pnpm typecheck` is the contract gate (it also regenerates `content/CATALOG.md`);
`pnpm test` runs unit tests; `pnpm validate:m*` are the milestone acceptance
checks. The full command list is in the root `CLAUDE.md`.

## Documentation map

| Doc | What it answers |
|---|---|
| [docs/requirements-v1.md](./docs/requirements-v1.md) | What LOOM is — spirit, concepts, functional/non-functional requirements, the agent contract |
| [docs/architecture.md](./docs/architecture.md) | How it's built — layout, kernel contracts, never-go-black, validation approach |
| [docs/roadmap.md](./docs/roadmap.md) | What's shipped and what's next |
| [DECISIONS.md](./DECISIONS.md) | Why — append-only decision log; grep it when touching an unfamiliar subsystem |
| [.claude/CLAUDE.md](./.claude/CLAUDE.md) | The in-session visuals-agent guide (MCP tools, rules, workflow) |
| [content/CATALOG.md](./content/CATALOG.md) | Generated index of every module and scene |
| docs/history/ | Archived originals: the v1 implementation plan, the M0–M6 build diary |
