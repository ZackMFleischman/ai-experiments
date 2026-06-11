# LOOM architecture

How LOOM is built. This is the single source of truth — the root `CLAUDE.md` and
`loom/.claude/CLAUDE.md` carry summaries that defer here. For *what* LOOM is, read
`docs/requirements-v1.md`; for what's next, `docs/roadmap.md`; for why a decision
was made, grep `DECISIONS.md`.

## Layout

- `packages/runtime` (`@loom/runtime`) — the kernel: Signal, Events, Param/Manifest
  (including the `color` param type), Module/Scene definitions, TexNode, BuildCtx,
  Instance, InputBus (TimeBus/AudioBus/MidiBus), the input rack (`defineInputs`/
  `InputRegistry` — named tunable channels on a globals Manifest, consumed late-bound
  via `ctx.input(name)` with auto trim params), `PaletteRegistry` (two global 5-stop
  palettes consumed via `ctx.palette`), `ModulatorHost`/`ModulatorSpec` (attachable
  param modulators), and `BindingStore` (MIDI-learn bindings keyed by scene name).
  Unit-tested in Node with a fake clock. **Changes here get human review.**
- `packages/engine-app` — the Vite app, three pages: the Output window at `/`
  (render loop, multi-instance `SessionStore`, `Compositor` for crossfades, HMR via
  the eager scenes barrel `scenes.ts`, sidecar bridge), the Console cockpit at
  `/console.html` and `/staged.html` (big preview of the staged instance) — both
  React 19 + MUI sibling pages talking to the engine over `BroadcastChannel("loom")`
  via the framework-free `EngineLink` client. The Output window itself stays vanilla
  (a pure projector surface): no overlay (`?hud=1` reveals the fps readout — the
  element stays in the DOM, validators gate on its text), fixed 1920×1080 internal
  render (`?res=WxH`) scaled with CSS `object-fit: cover` (never warped). One
  `EngineApi` dispatch serves agent (WS) and human (channel) commands, source-tagged:
  agent `commit` requires arming (Console toggle or `?agentCommit=1`);
  `panic`/`resume`/`set_audio`/`arm_agent_commit`/`midi_learn`/`midi_unbind` are
  human-only. The Console has instance tiles with drag-to-stage, a scene picker, an
  audio-source picker, the auto param panel (with per-param modulator popovers and
  MIDI-learn buttons), a rack drawer on `i`, and COMMIT/PANIC.
- `packages/runtime`'s `Stage` is the audience-safety core: LIVE changes only via
  `commit()` (frame-boundary crossfade; PANIC holds the last frame and cancels
  fades). Instances render exactly once per frame to a directive-chosen destination
  (canvas, crossfade leg, or preview target).
- `packages/sidecar` — agent surface: MCP server over stdio (11 tools: `get_session`,
  `get_manifest`, `set_param`, `modulate_param`, `clear_modulation`, `screenshot`,
  `create_instance`, `destroy_instance`, `stage`, `unstage`, `commit`) bridged to the
  engine over WebSocket (port 7341; `LOOM_WS_PORT` + `?ws=` override for isolation).
  The wire contract is `@loom/sidecar/protocol` (browser-safe, shared with the
  engine via tsconfig path + Vite alias). The sidecar's stdout belongs to MCP — log
  to stderr only. `loom/.mcp.json` registers it; `loom/.claude/` holds the in-engine
  agent rules and skills (start LOOM agent sessions from `loom/`).
- `content/` — scenes, modules, and `inputs.ts`. **This is agent territory.**
  `content/` lives outside any package; it imports `@loom/runtime` via tsconfig
  `paths` plus a matching Vite alias in `engine-app/vite.config.ts`. One root
  `tsconfig.json` drives typecheck for everything (no project references).
  `content/scenes/live.scene.ts` is a one-line re-export of the boot scene. Every
  scene file is HMR-watched through the barrel; instances rebuild only when their
  own scene's module identity changes.
- `content/CATALOG.md` — generated index of every module + scene
  (`scripts/build-catalog.mjs`, AST-extracted so Node never imports `three`).
  Regenerates automatically: the `loom:catalog` Vite plugin reruns it on any
  module/scene file change while the dev server runs, and `pnpm typecheck` reruns
  it as the offline gate (`pnpm catalog --check` exits 1 on staleness). Never edit
  by hand.
- `scripts/validate-m*.mjs` — screenshot-based acceptance checks. Their screenshots
  land in `artifacts/` (gitignored local scratch); the evidence of a milestone is
  the validator's pass/fail output.

## Instance ids

The boot instance (bound to `live.scene.ts`) is `"boot"`; created ones are
`"<scene>-<n>"`. `"live"` is an **alias** resolving at dispatch to whatever the
Stage routes to output. `"globals"` is a pseudo-instance serving the input rack's
tunings **and** the palette stops through the same `get_manifest`/`set_param` path
(routed by prefix: `palette.*` → palettes, else rack).

## The kernel (pull-based, frame-memoized)

`Signal.get(f)` / `Events.poll(f)` memoize on `f.frame` (the per-frame `FrameCtx`
from `Clock.tick`). Consequence — a documented contract, not a bug: **stateful ops
(lag, envelope, divide, quantize, onset detectors) must be pulled every frame or
they miss time.** Instances guarantee this because every CPU signal reaches the GPU
through a registered uniform updater that runs each frame (`BuildCtx.uniformOf`).

- Modules: `defineModule(meta, factory)` with zod-validated metadata (`name`,
  `kind: control|source|effect|geo|output`, `description`, `tags`, `example`).
  Factory signature: `(ctx: BuildCtx, opts) => TexNode | Signal`. Stdlib bar:
  ≤ ~150 lines, fully typed, one-line description + usage example — written as much
  for agents as for humans.
- `TexNode.color` is strictly TSL `Node<"vec4">` — sources normalize to vec4 once;
  looser unions fight `@types/three` overloads.
- Effects own pass ordering: a stateful effect (e.g. `feedback`) returns
  `[...input.passes, ownPass]`; the Instance just runs the list. No graph scheduler.
- `Param`/`Manifest`: zod-validated, clamped, serializable. Collected by `BuildCtx`
  at build time; written live through `set_param` (MCP), the Console's param panel,
  and MIDI bindings — all through `Manifest.get(path).set(value)`. The `color` type
  holds `"#rrggbb"`; its clamp **throws** on non-hex (state-restore paths try/catch
  each set), `setNormalized` is a no-op on it, and modulators reject color params at
  attach. Ranged specs may carry `labels` (value names) which the Console renders as
  a toggle group instead of a slider.
- InputBus: `TimeBus` (BPM is manual — `?bpm=` or tap `t`; beat tracking is
  post-v1), `AudioBus` (mic, or synthetic test audio via `?audio=test` — also the
  automatic fallback when getUserMedia fails; feeds the same AnalyserNode path as
  the mic), and `MidiBus` (WebMIDI CC state, hot-plug;
  `window.__loom.midiInject(cc, ch, v)` feeds the same path for mocked hardware).
- The input rack: channels are code-defined in `content/inputs.ts`
  (`level`/`onset`/`cc` kinds), advanced once per frame by the engine
  (`InputRegistry.update`) so meters work with zero consumers; scenes consume with
  `ctx.input(name)` (late-bound — retune/redefine never rebuilds). Trims, not
  overrides: a differently-detected kick is a new named channel. Redefinition
  carries tuned values and detector state forward by channel name+kind; a throwing
  `defineInputs` keeps the previous rack.
- Palettes: `primary`/`secondary` global 5-stop palettes on the globals manifest
  (`palette.primary.0` …). Scenes consume via `ctx.palette.color(i)` (vec3 stop
  uniform), `ctx.palette.ramp(t)` (256×1 DataTexture gradient), `ctx.palette.own()`
  (scene-default stops). Any use auto-declares a `palette.source` int param
  (0 primary · 1 secondary · 2 own, declared in `BuildCtx.finalize()`), resolved per
  frame — switching palettes is a plain `set_param`, **never a rebuild**. Stop roles
  (0 bg · 1 edge · 2/3 core · 4 accent) are convention, not kernel vocabulary.
- Modulators: `modulate_param` attaches a runtime LFO/stepper/follower to any
  non-color param (sine/triangle/ramp/square/random/drift/cycle/audio;
  `periodSeconds` or BPM-tracking `periodBeats`). Phase is a dt-accumulator ticked
  by the engine before compositing and skipped while the stage directive is `hold`,
  so PANIC pauses and RESUME continues without a jump. Rebuilds reattach; orphans
  are flagged in `get_session`. `set_param` on a modulated path errors —
  `clear_modulation` first.

## Never go black (the load-bearing invariant)

No agent action, compile error, or bad edit may interrupt the live output. Three
containment layers, all in place:

1. **Compile/parse errors**: Vite withholds the HMR update (previous module keeps
   running); the Vite error overlay is deliberately disabled
   (`server.hmr.overlay: false`) so nothing paints over the Output window.
2. **`build()` throws** (NFR-5 in `trySwap`, `engine-app/src/main.ts`): the next
   instance is built fully *before* the old one is disposed; a failed build never
   touches the running instance.
3. **Render-time throws** (NFR-2, `Instance`): the throwing instance freezes its
   output; the engine loop keeps ticking.

Preserve all three properties in any change to the swap/HMR/render path. The
invariant extends sideways: a throwing `defineInputs` keeps the previous rack, and
a failed rebuild (including future chain edits) keeps the previous pixels.

## State persistence

`content/state/` holds engine-written tuned state (`inputs.json`, `palettes.json`,
`bindings.json`, `values/<scene>.json`) served by the `loom:state` Vite middleware
(`GET/POST /loom/state/<name>`), saves debounced engine-side. Per-scene values
reapply on create/rebuild (NFR-5's "params reapplied from tuned state").
`?state=off` disables load+save — all validators boot with it except m5, which
tests persistence.

## Validation approach

Acceptance checks are screenshot-based (Playwright + pngjs): reading a
WebGL/WebGPU canvas via `drawImage` returns black without `preserveDrawingBuffer`,
so checks sample composited page screenshots. Headless Chromium has no WebGPU
adapter — automated runs exercise the WebGL2 fallback; WebGPU is verified manually
in desktop Chrome. Hard-won validator rules:

- Scripts fail fast if Vite exits early (port collision) — an orphaned server once
  caused a run to silently validate against a stale module graph.
- Validators pin `pulse` as their live scene (restoring the real one afterwards)
  and run their sidecars on isolated ports (`?ws=` + `LOOM_WS_PORT`) — safe to run
  while a live session is up. Ad-hoc debug pages must pass `?ws=<isolated>` too.
- Each session entry carries a `builds` counter (1 on create, ++ per successful
  rebuild) exposed in `get_session` and `window.__loom` — assert "no rebuild
  happened" against it.

## Conventions

- `three` is pinned **exact** (per-milestone risk mitigation) — don't bump it
  casually.
- `window.__loom` in the engine app is the debug surface validation scripts (and
  pre-MCP agent eyes) read from; keep it updated when adding engine state.
- New ideas outside v1 scope go to `DECISIONS.md` as post-v1 candidates (detail in
  `feature-requests/*.md`) — the requirements' §8 out-of-scope list is load-bearing.
- `DECISIONS.md` is the append-only institutional memory: add an entry when you
  make a non-obvious decision; when milestone-level work ships, append a ≤6-line
  **SHIPPED** entry (date, milestone, gates run, deviations, stumbles worth
  knowing).
