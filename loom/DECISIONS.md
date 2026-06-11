# DECISIONS

Log of implementation decisions, per the plan's cross-cutting rules. Newest at the bottom.

## 2026-06-09 — M0

- **three pinned exact at 0.184.0** (`@types/three@0.184.1`), per the plan's "pin Three.js per milestone" risk mitigation. Vite 8, TypeScript 5.8, pnpm workspace.
- **One root `tsconfig.json` drives typecheck** for `packages/*` and `content/` (no project references). `@loom/runtime` resolves via tsconfig `paths` + a Vite alias in `engine-app/vite.config.ts` — the alias is what lets `content/` scenes (which live outside any package) import the runtime.
- **Vite HMR error overlay disabled** (`server.hmr.overlay: false`): a compile error must never paint over the Output window. Compile errors are withheld by Vite (previous module keeps running); runtime throws are contained by `SceneHost.setScene` try/catch.
- **M0 error containment boundary:** TS/parse errors and `build()` throws are contained. A scene whose *shader* fails at GPU compile time after a successful build() is not yet contained — that's part of NFR-2 work in M1's per-instance containment.
- **Validation is screenshot-based** (Playwright + pngjs): reading a WebGL/WebGPU canvas via `drawImage` returns black without `preserveDrawingBuffer`, so acceptance checks sample composited page screenshots instead. Headless Chromium has no WebGPU adapter → automated runs exercise the WebGL2 fallback path; WebGPU is verified manually in desktop Chrome.
- **Validation artifacts committed** under `loom/artifacts/` as evidence for each milestone run.

## 2026-06-09 — M1

- **Kernel is pull-based with per-frame memoization.** `Signal.get(f)`/`Events.poll(f)` memoize on `f.frame`. Consequence: stateful ops (lag, envelope, divide, quantize, onset detectors) must be pulled every frame or they miss time — instances guarantee this because every CPU signal reaches the GPU through a registered uniform updater that runs each frame. Documented as a contract, not a bug.
- **`TexNode.color` is strictly `Node<"vec4">`.** Looser unions (float/vec3) fight @types/three conversion overloads and push casts into every effect. Sources normalize to vec4 once.
- **Effects own pass ordering.** A stateful effect (feedback) returns `[...input.passes, ownPass]` — topological order falls out of composition; the Instance just runs the list. No graph scheduler until one is actually needed.
- **Feedback render targets are fixed 1280×720 half-float.** Per-instance sizing belongs to M3 (Stage/panes); resolution-independent history would complicate the first stateful pass for no M1 payoff.
- **Synthetic test-audio mode lives in AudioBus** (`?audio=test`, also the automatic fallback when getUserMedia fails). Scheduled kick + offbeat hats feed the same AnalyserNode path as the mic, so validation and demos exercise the real analysis code. This is a stopgap for M5 fixtures (record/replay InputBus traces), not a replacement.
- **BPM is manual (set via `?bpm=` / tap on `t`)** per plan; beat tracking from audio is explicitly post-v1.
- **Onset detection** = threshold + rising edge + refractory + re-arm-below-threshold, per detector instance (each `ctx.audio.onset()` call gets independent state/options). Spectral-flux fanciness deferred until kicks feel missed in practice.
- **Validation scripts fail fast if Vite exits early** (port collision) — an aborted run once left an orphan server and the next run silently validated against its stale module graph.
- **NFR-5 rebuild semantics in `trySwap`:** build the next instance fully before disposing the old one; a failed build never touches the running instance.

## 2026-06-10 — M2

- **Sidecar topology:** Claude Code spawns the sidecar over stdio (`.mcp.json`: `node --import tsx packages/sidecar/src/index.ts`); the engine dials out to `ws://localhost:7341` (`LOOM_WS_PORT` overrides) and reconnects every 2 s. Latest engine connection wins; the sidecar never blocks on a missing engine — tool calls fail fast with "engine not connected".
- **MCP via the low-level `Server` API with plain JSON-Schema tool definitions**, not `registerTool`+zod: the MCP SDK's zod lineage (v3) would couple against the project's zod v4. Tool args are validated with our own protocol schemas on both sides of the wire.
- **The WS wire contract lives in `@loom/sidecar/protocol`** (browser-safe: no Node/DOM APIs), shared with the engine via tsconfig `paths` + a Vite alias — same pattern as `@loom/runtime`.
- **Screenshots are captured inside the render loop** via same-task `canvas.toDataURL` right after `renderFrame` (the WebGL drawing buffer is invalid in later tasks without `preserveDrawingBuffer`). A screenshot request resolves on the next presented frame; a frozen instance still serves its held frame.
- **`set_param` writes through `Manifest.get(path).set(value)`** — the M1 kernel needed zero changes for M2; clamping and `param.signal()` liveness were already the contract. Instance id is fixed to `"live"` until Stage lands in M3.
- **stdout discipline:** the sidecar's stdout belongs to MCP; all sidecar logging goes to stderr.
- **`pnpm.onlyBuiltDependencies: ["esbuild"]`** in the root manifest — pnpm 10 blocks install scripts by default and tsx needs the esbuild binary.

## 2026-06-10 — content (lava scene)

- **Multi-channel TexNode packing for field sources:** `blobs` outputs its thresholded ink mask in r/b and the raw-field "core glow" (smoothstep of stacked field depth) in g, so scenes can shade blob interiors without the module dictating color. Convention for future field-like sources: pack semantic scalars into vec4 channels and document the layout in the module description. Monochrome consumers reading `.x` still work.
- **CPU-side signal composition via `new Signal((f) => ...)`** pulling several signals (param + LFO + onset envelope) is the idiom for combining reactive values into one module opt — `Signal.map` is single-input. Hoist `param.signal()` calls outside the closure (each call creates a new Signal).
- **`content/CATALOG.md` is generated, never hand-written.** `scripts/build-catalog.mjs` extracts defineModule/defineScene metadata via the TypeScript AST (importing content in Node would drag `three/webgpu` into an environment without browser globals). Auto-regen rides `pnpm typecheck` — the gate every change already runs — so the index cannot drift silently; `pnpm catalog --check` exits 1 on staleness for CI-style use.

## 2026-06-10 — M3

- **Validators pin their scene and isolate their sidecar port.** A performance left `lava` live and broke m1/m2's pulse assertions; a live Claude Code session holding WS 7341 killed validation sidecars. Scripts now write the pulse pin into `live.scene.ts` (restoring the real one after) and run their sidecar on a private port via `?ws=` + `LOOM_WS_PORT`.
- **Engine stays in the Output window; the Console is a sibling page** (`/console.html`) talking over `BroadcastChannel("loom")` with the same request/response envelopes as the sidecar wire — one `EngineApi` dispatch serves both, tagged by source (`agent` | `human`). Closing the Console never touches the projector, and the Console works with the sidecar/agent absent (R4.5).
- **Commit is human-gated for agents**: `commit` from the WS bridge requires the armed flag (Console toggle, or `?agentCommit=1` at engine boot for dev). Human-only types (`panic`, `resume`, `arm_agent_commit`) are refused for agents at dispatch. Destroying the LIVE instance is refused for everyone.
- **Crossfade semantics (`Stage`)**: commits start at the next frame boundary; a duration-N fade spends exactly N frames with mix in (0,1) exclusive — duration 0 is a hard cut. PANIC cancels an in-flight fade (live stays live) and holds the canvas by skipping all rendering; the browser keeps presenting the last frame (same mechanism as NFR-2 freezes).
- **Multi-scene HMR via an eager glob barrel** (`engine-app/src/scenes.ts`): every scene edit bubbles through the barrel to one hot-accept; instances rebuild only when their def's module identity changed, so editing scene A never resets scene B's feedback state. Vite still withholds syntax errors wholesale — never-go-black is unchanged at N instances. Deleting a scene file destroys its instances.
- **Instances render exactly once per frame** (stateful passes advance per render call): the Stage directive decides each instance's one destination — canvas, a full-res crossfade leg, or its 640×360 preview target.
- **Console previews are JPEG dataURLs at ~6.6 fps** read back via `readRenderTargetPixelsAsync` (BroadcastChannel can't transfer ImageBitmaps). WebGL reads come back bottom-up, WebGPU top-down — the flip keys off `renderer.backend.isWebGLBackend`. Broadcasts pause when no Console has said hello for 5 s. Upgrade path if tiles need to be smoother: window.open + MessagePort with transferable ImageBitmaps.
- **`Stage.adoptLive` exists for boot/recovery only** (fills an empty live slot); every other LIVE change goes through `commit()` — the audience-safety invariant lives in one place.
- **`"live"` is an alias, not an instance id.** The boot instance (bound to `live.scene.ts`) is id `"boot"`; commands default to `instance: "live"`, which resolves at dispatch to whatever the Stage currently routes to output. Before this, the boot instance was literally named "live", which read as "LIVE live" in the Console and silently pointed at the *old* instance after a commit.
- **The Console can spawn library scenes** (scene picker + "+ instance") — R4.5 demands the instrument work with the agent absent, and until this the human had no way to instantiate a scene without one. Goes through the same `create_instance` dispatch as the MCP tool.

## 2026-06-10 — content library refactor (pulseRings/glitch) + scene discovery

- **Visual identities live in modules, scenes are wiring.** `pulse` and `pulse-glitch` both compose `pulseRings` (source: rings/core/ink palette, grain via the `noise` module) instead of duplicating TSL; the glitch treatment is a standalone `glitch` effect. The module-authoring and scene-composition skills now state the policy: >few lines of inline TSL in a scene means a module is missing.
- **UV-warping effects must own a RenderTarget.** An effect cannot re-evaluate `input.color` at a shifted UV (it's a node graph, not a function of UV), so `glitch` renders its input into an owned RT each frame and re-samples `texture(rt.texture, warpedUv)` — three taps for the RGB split. `feedback` proved write-then-sample-same-frame is safe on both backends; `glitch.ts` is now the reference for stateless-looking-but-stateful resampling effects.
- **`loom:watch-content` Vite plugin (engine-app).** `content/` sits outside the app root, so Vite's watcher never saw NEW files there: `import.meta.glob("…/content/scenes/*")` missed additions until something else invalidated the barrel (first symptom: `create_instance` reported the freshly written `pulse-glitch` scene unknown until the barrel was touched). `server.watcher.add(contentDir)` makes add/unlink events reach Vite's glob invalidation; verified headless (new file → `hot updated: /src/scenes.ts` with no manual touch).
- **A frozen frame counter with a responsive bridge is a *window* problem, not a content bug.** Chrome stops rAF for minimized/occluded windows: `get_session` keeps answering (WS handlers run) while `frame`/`fps`/`rms` freeze and `screenshot` times out (it resolves inside the render loop). Diagnosed by exonerating the content headless (WebGL2) and headed (WebGPU) — both scenes ran clean. Recovery is desktop-side: make the Output window visible again.
- **Debug pages must pass `?ws=<isolated>`.** A throwaway repro page without it silently attached to the live session's sidecar on 7341 (same lesson the validators learned in M3, re-learned for ad-hoc scripts).

## 2026-06-10 — post-v1 candidate: param modulators

- **Attachable param modulators** (run-time LFO/ramp/random/cycle/audio-follow on any param of any instance, Console + MCP, no code edits) — fully fleshed out as requirements + phased implementation plan in `feature-requests/param-modulators.md`. Distinct from the `lfo` control module: modules modulate at build time in code; modulators attach per instance at perform time.
