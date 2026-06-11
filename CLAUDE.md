# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository

`ai-experiments` is an umbrella repo. The active project is **`loom/`** — LOOM, an AI-driven live-visuals instrument: you describe visuals in natural language, agents write typed TypeScript, and the engine hot-renders it the moment the file is saved.

Read in this order before substantive work in `loom/`:
1. `loom/requirements-v1.md` — what LOOM is (concepts, functional/non-functional requirements, the agent contract)
2. `loom/implementation-plan-v1.md` — how it's built (stack, M0–M9 milestone roadmap, cross-cutting rules; v1.1 reshaped M4+ after M3 shipped)
3. `loom/DECISIONS.md` — implementation decision log (newest at bottom); add an entry when you make a non-obvious decision
4. `loom/agent-updates.md` — append-only progress log; append a dated entry when you ship milestone-level work

## Commands

All commands run from `loom/` (pnpm workspace):

```
pnpm install            # install (uses pnpm workspaces)
pnpm dev                # start the engine app (Vite dev server, Output window)
pnpm sidecar            # start the MCP/WS sidecar standalone (Claude Code spawns it via .mcp.json)
pnpm typecheck          # regenerates content/CATALOG.md, then tsc --noEmit over packages/* and content/ — the contract gate
pnpm catalog            # regenerate content/CATALOG.md alone (--check exits 1 if stale)
pnpm test               # unit tests in all packages (vitest: runtime + sidecar)
pnpm validate:m0        # M0 acceptance: Playwright + headless Chromium HMR checks
pnpm validate:m1        # M1 acceptance: signals/audio-reactivity/containment checks
pnpm validate:m2        # M2 acceptance: MCP client e2e (agent tools + latency)
pnpm validate:m3        # M3 acceptance: stage/commit/PANIC loop via MCP + Console
pnpm validate:m4        # M4 acceptance: pure output, cover scaling, set_audio, staging UX
pnpm validate:modulators # param-modulator acceptance: attach/clear via MCP, FR-4/5/7/10 behavior
```

Validators pin `pulse` as their live scene (restoring the real one afterwards) and run their sidecars on isolated ports — safe to run while a live session is up.

Run a single test file:

```
pnpm --filter @loom/runtime exec vitest run test/signal.test.ts
```

Milestone work merges only with typecheck green, unit tests green, and all prior `validate:m*` scripts still passing.

## Architecture

### Layout

- `loom/packages/runtime` (`@loom/runtime`) — the kernel: Signal, Events, Param/Manifest, Module/Scene definitions, TexNode, BuildCtx, Instance, InputBus (TimeBus/AudioBus). Unit-tested in Node with a fake clock. **Changes here get human review.**
- `loom/packages/engine-app` — the Vite app, three pages: the Output window at `/` (render loop, multi-instance `SessionStore`, `Compositor` for crossfades, HMR via the eager scenes barrel `scenes.ts`, sidecar bridge), the Console cockpit at `/console.html` (instance tiles with drag-to-stage, scene picker to spawn library instances, audio-source picker, auto param panel, COMMIT/PANIC), and `/staged.html` (big preview of the staged instance with COMMIT/unstage) — both sibling pages talk to the engine over `BroadcastChannel("loom")`. The Output is a pure projector surface: no overlay (`?hud=1` reveals the fps readout — the element stays in the DOM, validators gate on its text), fixed 1920×1080 internal render (`?res=WxH`) scaled with CSS `object-fit: cover` (never warped). One `EngineApi` dispatch serves agent (WS) and human (channel) commands, source-tagged: agent `commit` requires arming (Console toggle or `?agentCommit=1`), `panic`/`resume`/`set_audio`/`arm_agent_commit` are human-only. Instance ids: boot instance is `"boot"`; `"live"` is an alias resolving to whatever the Stage routes to output.
- `loom/packages/runtime`'s `Stage` is the audience-safety core: LIVE changes only via `commit()` (frame-boundary crossfade; PANIC holds the last frame and cancels fades). Instances render exactly once per frame to a directive-chosen destination (canvas, crossfade leg, or preview target).
- `loom/packages/sidecar` — agent surface: MCP server over stdio (10 tools: `get_session`, `get_manifest`, `set_param`, `modulate_param`, `clear_modulation`, `screenshot`, `create_instance`, `destroy_instance`, `stage`, `commit`) bridged to the engine over WebSocket (port 7341; `LOOM_WS_PORT` + `?ws=` override for isolation). The wire contract is `@loom/sidecar/protocol` (browser-safe, shared with the engine via tsconfig path + Vite alias). The sidecar's stdout belongs to MCP — log to stderr only. `loom/.mcp.json` registers it; `loom/.claude/` holds the in-engine agent rules and skills (start LOOM agent sessions from `loom/`).
- `loom/content/` — scenes and modules. **This is agent territory.** `content/` lives outside any package; it imports `@loom/runtime` via tsconfig `paths` plus a matching Vite alias in `engine-app/vite.config.ts`. One root `tsconfig.json` drives typecheck for everything (no project references).
- `loom/scripts/validate-m*.mjs` — screenshot-based acceptance checks; artifacts committed under `loom/artifacts/` as milestone evidence.
- `loom/content/scenes/live.scene.ts` — one-line re-export of the boot scene (instance id `live`). Every scene file is HMR-watched through the barrel; instances rebuild only when their own scene's module identity changes.

### The kernel (pull-based, frame-memoized)

`Signal.get(f)` / `Events.poll(f)` memoize on `f.frame` (the per-frame `FrameCtx` from `Clock.tick`). Consequence — a documented contract, not a bug: **stateful ops (lag, envelope, divide, quantize, onset detectors) must be pulled every frame or they miss time.** Instances guarantee this because every CPU signal reaches the GPU through a registered uniform updater that runs each frame (`BuildCtx.uniformOf`).

- Modules: `defineModule(meta, factory)` with zod-validated metadata (`name`, `kind: control|source|effect|geo|output`, `description`, `tags`, `example`). Factory signature: `(ctx: BuildCtx, opts) => TexNode | Signal`. Stdlib bar: ≤ ~150 lines, fully typed, one-line description + usage example — written as much for agents as for humans.
- `TexNode.color` is strictly TSL `Node<"vec4">` — sources normalize to vec4 once; looser unions fight `@types/three` overloads.
- Effects own pass ordering: a stateful effect (e.g. `feedback`) returns `[...input.passes, ownPass]`; the Instance just runs the list. No graph scheduler.
- `Param`/`Manifest`: zod-validated, clamped, serializable. Collected by `BuildCtx` at build time; written live through `set_param` (MCP) and the Console's param panel — both go through `Manifest.get(path).set(value)`.
- InputBus: `TimeBus` (BPM is manual — `?bpm=` or tap `t`; beat tracking is post-v1) and `AudioBus` (mic, or synthetic test audio via `?audio=test` — also the automatic fallback when getUserMedia fails; feeds the same AnalyserNode path as the mic).

### Never go black (the load-bearing invariant)

No agent action, compile error, or bad edit may interrupt the live output. Three containment layers, all in place:

1. **Compile/parse errors**: Vite withholds the HMR update (previous module keeps running); the Vite error overlay is deliberately disabled (`server.hmr.overlay: false`) so nothing paints over the Output window.
2. **`build()` throws** (NFR-5 in `trySwap`, `engine-app/src/main.ts`): the next instance is built fully *before* the old one is disposed; a failed build never touches the running instance.
3. **Render-time throws** (NFR-2, `Instance`): the throwing instance freezes its output; the engine loop keeps ticking.

Preserve all three properties in any change to the swap/HMR/render path.

### Validation approach

Acceptance checks are screenshot-based (Playwright + pngjs): reading a WebGL/WebGPU canvas via `drawImage` returns black without `preserveDrawingBuffer`, so checks sample composited page screenshots. Headless Chromium has no WebGPU adapter — automated runs exercise the WebGL2 fallback; WebGPU is verified manually in desktop Chrome. Validation scripts fail fast if Vite exits early (port collision) — an orphaned server once caused a run to silently validate against a stale module graph.

## Conventions

- `three` is pinned **exact** (per-milestone risk mitigation) — don't bump it casually.
- `window.__loom` in the engine app is the debug surface validation scripts (and pre-MCP agent eyes) read from; keep it updated when adding engine state.
- New ideas outside v1 scope go to `DECISIONS.md` as post-v1 candidates — the requirements' §8 out-of-scope list is load-bearing.
