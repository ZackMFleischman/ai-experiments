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

## 2026-06-10 — roadmap v1.1 (post-M3 design review)

A design pass on "how the instrument is actually used" produced requirements R6–R9 (requirements-v1.md §11) and reshaped the plan: old M4 split across new M5 (MIDI/bindings/values) and M7 (panels/save-as); old M5→M7, M6→M8, M7→M9. Nothing dropped; `validate:m*` numbering continues unbroken. The decisions:

- **Quick wins are their own mini-milestone (M4 "Clean stage")**, not folded into the next big one: pure output + aspect fix + staging UX are performer-visible in a weekend, every later milestone's Console work builds on the resulting page structure, and bundling would couple a trivial validator to a large one.
- **One "globals" mechanism for all global state.** Input-channel tunings (M5) and palettes (M6) register on a single global Manifest served as pseudo-instance `"globals"` through the existing `get_manifest`/`set_param` dispatch. Console widgets, MCP, and MIDI-learn reach globals with zero new param machinery — the alternative (bespoke commands per subsystem) would triple the protocol surface for no expressiveness.
- **MIDI folds into the input-rack milestone (M5)** instead of shipping first as old-M4: the rack drawer is MIDI's natural UI surface and InputBus its home; building MIDI-learn before the rack exists would mean building a binding panel twice.
- **Input channels are code-defined** (`content/inputs.ts`, hot-reloaded), Console-*tuned* — not Console-created. Code is the substrate (Principle: everything authored is text in git), the agent can grow the rack, and the protocol stays read/tune-only. Revisit only if mid-set channel creation with a mouse turns out to be a real need.
- **Global-vs-local input semantics: trims, not overrides.** A channel's detection meaning (band, threshold, decay) is owned globally; consumers get an auto-declared multiplicative trim param. A differently-detected kick is a new named channel (`kickTight`) — local threshold overrides would fork the meaning of a name and make the rack lie.
- **Palettes are 5 anonymous ordered stops + a ramp**, two global slots (primary/secondary). Roles like bg/accent are documented conventions on indices — first-class named roles would lock a vocabulary into the kernel permanently. Per-instance palette choice is a live `palette.source` param resolved per frame, so switching is a `set_param`, never a rebuild.
- **Chains precede the library buildout** (M6 before M7) so all ~20 stdlib effects are written `chainParams`-compliant from day one instead of retrofitted.
- **Chain edits rebuild through NFR-5** rather than live-patching the node graph: a throwing step rejects the rebuild and previous pixels keep running — never-go-black needs no new mechanism. Cost: feedback state resets on a successful chain edit (the documented NFR-5 trade). Humans may edit the LIVE chain directly; **agent `set_chain` on the LIVE instance requires the same arming gate as `commit`** (non-live is ungated, matching the existing trust model).
- **"catalog.json" is superseded by `content/CATALOG.md`** (AST-generated, rides `pnpm typecheck`) — the M7 library milestone extends it rather than building the JSON artifact the old plan named.

## 2026-06-10 — post-v1 candidate: PANIC modes (safe scene)

- **PANIC armed modes: HOLD (default, today's freeze) or SAFE SCENE** — cut to a pre-built, always-warm panic instance designated by a `panic.scene.ts` pointer (the `live.scene.ts` twin). Output override, not a commit: LIVE pointer unmoved, RESUME cuts back; broken safe scene degrades PANIC to hold, never worse than today. Full requirements + phased plan in `feature-requests/panic-scene.md`.

## 2026-06-10 — post-v1 candidate: console screenshot tool

- **`screenshot_console` MCP tool** — agent eyes on the cockpit UI itself (tiles, badges, param panels), not just instance pixels. Console self-captures its DOM in-page (SVG foreignObject) and replies over a new engine→Console reverse request/response envelope (the missing direction on the BroadcastChannel link); sidecar-side headless capture is impossible (BroadcastChannel is same-browser) and CDP attach was rejected for v1 (launch-flag friction). Full plan in `feature-requests/console-screenshot.md`.

## 2026-06-10 — M4 (Clean stage)

- **`#fps` stays in the DOM, hidden, on the pure Output page.** Every validator (m0–m4) gates readiness on `/\d+ fps/` in `#fps`'s text; removing the element would break them all for zero benefit. It's `visibility: hidden` by default, `?hud=1` adds `.show`. The `#status` overlay (and `overlay.ts`) had no validator references and is deleted outright.
- **Cover scaling is CSS, not render-path code.** The Output renders at a fixed internal 1920×1080 (`?res=WxH` override; `renderer.setSize(w, h, false)` so CSS owns the on-screen size) and `#out` uses `object-fit: cover`. The browser compositor does the scaling, so all three never-go-black layers are untouched, `screenshot` returns a stable 1080p regardless of window shape, and render cost stops depending on window size. The previous resize-to-window behavior warped UV-space scenes at non-16:9 aspects.
- **`set_audio` is human-only and not an MCP tool** — an agent must not silently swap the audio source mid-set. Enforcement is doubled: the tool simply doesn't exist on the MCP surface, and dispatch refuses agent-sourced `set_audio` (same `HUMAN_ONLY` set as panic/resume). Device labels populate after mic permission, so the handler refreshes the cached device list after a successful `startMic`; a failed mic always falls back to the test signal (the instrument never goes deaf).
- **`/staged.html` rides the thumbs broadcast** rather than its own readback: the staged instance already renders to its 640×360 preview target every frame, so the page is pure consumer. Its request ids carry a per-tab random prefix — the Console shares the BroadcastChannel and plain sequential ids would resolve across tabs.

## 2026-06-10 — M5 (the input rack)

- **Channel values are computed imperatively in `InputRegistry.update(f)`, not pulled as Signals.** The engine advances every channel once per frame (after `AudioBus.update`), storing a plain number; `ctx.input(name)` returns a Signal that just reads it. This makes "meters work with no consumers" automatic, and stateful detectors/envelopes can never miss time no matter who does or doesn't pull — the M1 "stateful signals must be pulled every frame" hazard doesn't apply to the rack.
- **Onset channels re-read their tuning params every step** (threshold/decay live on the globals manifest) instead of constructing an `OnsetDetector` per options object — that's what makes a `set_param` on `inputs.kick.threshold` take effect the same frame with zero rebuild. `rise`/`refractoryMs` stay code-level opts (defaults, not rack knobs) to keep the rack legible.
- **Redefining the rack carries state forward by channel name+kind:** tuned manifest values AND detector/envelope state survive an `inputs.ts` hot reload, so growing the rack mid-set never resets its feel. A throwing `defineInputs` is caught and keeps the previous rack (never-go-black extends to inputs).
- **MIDI bindings are keyed by SCENE name, not instance id** (`BindingStore`): instance ids churn across rebuilds and sessions, while "this knob is pulse's punch" is durable. A CC writes to every running instance of the scene via `Param.setNormalized` (0..1 → range; bool flips at 0.5). `"globals"` is the pseudo-scene for rack tunings. midi_learn/midi_unbind are HUMAN_ONLY and not MCP tools (same belt-and-braces as set_audio).
- **Tuned state persists through a tiny Vite middleware** (`loom:state`: GET/POST `/loom/state/<name>` ⇄ `content/state/<name>.json`; names sanitized, JSON-validated writes). Globals → `inputs.json`, bindings → `bindings.json`, per-scene values → `values/<scene>.json` — saves debounced 400 ms engine-side. Per-scene values reapply on create/rebuild, making NFR-5's "params reapplied from tuned state" real for the first time: an HMR edit no longer resets sliders. Where a scene has several instances, last-touched wins the file.
- **`?state=off` disables tuned-state load+save; validators m0–m4 boot with it** so a performer's persisted tunings (e.g. a hot kick threshold) can never skew their assertions; validate-m5 runs with state ON (it's under test) and snapshots/restores `content/state/` around the run. validate-m2's "manifest paths" check loosened from exact-equality to subset — `ctx.input()` auto-trims legitimately grew pulse's manifest.
- **`pulse.scene.ts` consumes `ctx.input("kick"/"bass")`** with channel defaults exactly matching its old hand-rolled detector (threshold 0.22, decay 0.22, lag 0.06), so m1's luminance/onset assertions hold unchanged. Other scenes keep raw `ctx.audio` until the M7 retrofit.
- **Mocked MIDI rides the real path:** `MidiBus.inject(cc, ch, v)` (exposed as `window.__loom.midiInject`) feeds the same emit pipeline as a hardware `midimessage`, so validate-m5's learn/binding checks exercise everything but the W3C event plumbing.
- **Test-audio scheduler drops missed beats after a stall.** `startTest`'s lookahead loop used to schedule every missed kick *in the past at once* when the main thread stalled (e.g. a Playwright screenshot); the pile-up saturated the analyser and read as one giant onset that crossed even a 0.95 threshold — caught as a validate-m5 flake. `next` now fast-forwards past `currentTime` before scheduling.

## 2026-06-10 — M5 follow-up: WebMIDI permission UX (first hardware run)

- **Chrome ≥124 gates ALL WebMIDI behind a permission prompt, and the engine requests it from the Output window — a bare projector page nobody clicks.** First real-hardware run (nanoKONTROL2): the prompt was never granted, `requestMIDIAccess` rejected, and `MidiBus.init` swallowed it silently — "no access" and "no devices" were indistinguishable (`MIDI —`). Fixes: `MidiBus.status` ("off"/"ready") with idempotent, retryable `init()` (a ready bus never re-prompts); the engine retries on pointer gestures and watches `navigator.permissions` for the midi grant; the Console header shows "MIDI: connect" (clickable) when off, and clicking any M learn button without access primes `requestMIDIAccess()` **from the Console window** — the grant is per-origin, so the engine page inherits it and re-attaches via the permission watcher. Same shape as the audio autoplay escape hatch (resume on gesture + mode surfaced in the snapshot).
## 2026-06-10 — Param modulators SHIPPED (design refinements vs the feature request)

- **Phase is a dt-accumulator, not wall-clock or beat-count derived.** Each evaluator advances
  `phase += f.dt / periodSec` only when evaluated; the engine simply skips the modulator pass
  while the stage directive is `hold`. FR-10 (PANIC pauses, RESUME continues without a
  catch-up jump) falls out structurally — no pause bookkeeping anywhere. Consequence:
  `ModulatorBus` is `{ bpm(): number; audio? }` rather than the sketched beats Signal;
  `periodBeats` converts to seconds from live BPM per frame, so tap-tempo retunes every
  synced modulator at once (FR-5) and a PANIC'd beat clock can't replay into a jump.
- **`ModulatorHost` lives in `@loom/runtime`, not the engine.** The per-instance state machine
  (attach/replace/clear, per-frame tick with FR-9 containment, FR-4 reattach-after-rebuild
  with orphan flagging and fix-forward recovery) is fake-clock unit-tested against a
  `ManifestLike` slice; `SessionStore` just owns one host per entry and calls
  `tickModulators(f)` before compositing. The engine only schedules and stores (NFR-2).
- **Spec validation is engine-side** (the dispatch is the protocol boundary, matching every
  other command): the wire carries the modulator as an opaque JSON object; the runtime's
  strict zod `ModulatorSpec` rejects unknown keys/typos with real errors.
- **`cycle` on ints accepts an explicit `values` list too** (the 4→8→16→32 slices case);
  without one it steps the integer lattice of [lo, hi].
- **Acceptance is `pnpm validate:modulators`** — the `validate:m*` numbering stays reserved
  for roadmap milestones. m3/m4's expected MCP tool lists grew by the two new tools (their
  intent — exactly-these-tools, no `set_audio` for agents — is preserved).

## 2026-06-11 — Feature request: Console screenshot for agents (post-v1 candidate)

- **`screenshot_console` MCP tool** — agent eyes on the cockpit UI itself. Existing `screenshot` can't reach a sibling tab; CDP attach is the likely winner. Full analysis + candidate approaches in `feature-requests/console-screenshot.md`.

## 2026-06-11 - Image/transform building blocks (image, Transform2D, transform2d)

- **`image` replaces `imagePlate`**: the base image source only loads/draws (aspect-correct,
  upright, premultiplied alpha); placement is an attached `Transform2D`, not baked-in opts.
- **`Transform2D` is a concept, not just a module**: a plain interface of live signals
  (x/y/rotate/scale/mirrorX) plus the shared `localSpace()` mapper in
  `content/modules/effects/transform2d.ts`. Sources sample through it directly (no render
  target, no resolution loss); the `transform2d` effect module wraps the same mapper around
  an owned RT for transforming arbitrary TexNode chains (glitch-shaped).
- **Why two paths**: a generic TexNode transform must rasterize first (a node graph cannot be
  re-evaluated at shifted UVs), but image sources can sample their texture anywhere - forcing
  everything through RTs would cost a pass per sprite. `flyby` composes 5 sprites as
  `image`+`Transform2D`+`over` with zero extra passes.
- **Shader-build gotcha (repeat offender)**: TSL `mix(1.0, node, node)` with a plain JS number
  as the FIRST arg builds a shader that silently fails to compile - the instance reports ok
  but its render target never gets written (screenshot errors with "reading 'format'").
  Wrap leading literals: `mix(float(1), ...)`.

## 2026-06-11 - Unified Transform: 2D and 3D tilt in one concept (no Transform3D split)

- **One interface, not two**: `Transform` (transform.ts, replacing transform2d.ts) adds
  rotateX/rotateY/perspective to the 2D fields. A plane under rigid 3D transform +
  pinhole projection is a homography - closed-form inverse - so sources still sample
  through `localSpace()` with no render target; absent fields reduce exactly to the old
  affine path. Every consumer keeps a single attachment point.
- **Per-layer perspective** (anchored at the layer center, CSS-style) rather than one
  global camera: tilt reads the same anywhere on screen, which is what compositing wants.
- **Cramer instead of `inverse(mat3)`**: TSL's matrix inverse isn't guaranteed on the
  WGSL backend; cross/dot are universal.
- **Scope line**: this stays a 2.5D compositor transform. Real geometry/camera work
  (the reserved `geo` module kind) should use three's scene graph, with the compositor
  Transform moving that rendered layer like any other image.
- **Derivative-poisoning gotcha**: guarding invalid uv regions with a huge sentinel
  (mix to 1e6) or number-FIRST TSL args (step(0.0, node)) collapses texture sampling to
  the lowest mip everywhere (giant mosaic). Guard by adding a SMALL node-first offset:
  `local.add(behind.mul(10))`.

## 2026-06-11 — Console + Staged pages rebuilt on React + MUI

The cockpit pages outgrew hand-rolled DOM diffing (console.ts was ~800 lines of
querySelector bookkeeping). Both pages are now React 19 + @mui/material 7 apps
under `packages/engine-app/src/ui/`, with a framework-free `EngineLink` class
(unit-tested) owning the BroadcastChannel protocol. Deliberate choices:
- **No @vitejs/plugin-react.** Vite's esbuild compiles .tsx natively
  (`"jsx": "react-jsx"` in tsconfig.base.json); vite.config.ts is unchanged, so
  the scenes HMR path — never-go-black layer 1 — is provably untouched. Editing
  a cockpit .tsx full-reloads the cockpit tab only; the Output window doesn't care.
- **The validator DOM contract is preserved** (.tile[data-id], #commit, #panic,
  data-path on the real input, data-learn text M/···/cc<N>, .rackfill inline
  width, body.disconnected). One validator change: validate-m3 writes the slider
  through HTMLInputElement's prototype value setter because React dedupes direct
  .value writes (and waits with state:"attached" since MUI's range input is
  visually hidden).
- The Output window (index.html + src/main.ts) stays vanilla on purpose: it is a
  pure projector surface; a React tree there buys nothing and risks the render loop.

## 2026-06-11 — M6 global color palettes (palette half)

Two global 5-stop palettes (`primary`/`secondary`) live on a `PaletteRegistry`
in `@loom/runtime`, served through the existing `"globals"` pseudo-instance by
merging the registry's manifest with the input rack's, routed by path prefix
(`palette.*` → palettes, else rack). Scenes consume via `ctx.palette.color(i)`
(vec3 stop uniform), `ctx.palette.ramp(t)` (256×1 `DataTexture` gradient), and
`ctx.palette.own([...5])` (scene-default stops). Decisions:

- **`color` is a kernel param type** (`Param<string>`, `"#rrggbb"`). Its clamp
  **throws** on a non-hex value rather than silently coercing — `set_param`
  surfaces a clean error to agents. Because a corrupt persisted value would then
  throw at boot, all three state-restore paths (`main.ts` inputs + palettes
  loops, `SessionStore.applyTuned`) wrap each `param.set` in try/catch and keep
  the code default on failure.
- **`setNormalized` is a no-op on color params** — a 0..1 CC has no honest color
  mapping. A MIDI CC bound to a stop is a harmless no-op; binding `palette.source`
  (an int) to a knob is the point.
- **`labels` meta on ranged specs** (`int`/`float`): an array of value names that
  the Console renders as a `ToggleButtonGroup` instead of a slider. Generic
  int-selector affordance; first user is `palette.source`.
- **`palette.source` is an int param 0..2** (primary/secondary/own), declared in
  a new `BuildCtx.finalize()` hook that `buildInstance` calls after `build()` —
  deferred so its default can honor whether the scene called `own()` (own→2,
  else→0). Ints keep MIDI-learn, `cycle` modulators, and number-typed persistence
  working for free. Switching source is a plain `set_param`, resolved per frame
  by one updater that re-tints uniforms / re-uploads the ramp only when the
  resolved stops actually change — **never a rebuild** (R7.2).
- **"own" falls back to primary** live when a scene selected source=own but never
  declared `own()` stops — keeps the 3-way switch total.
- **Modulators reject color params** at attach (their evaluators produce numbers).
- **`builds` counter per session entry** (1 on create, ++ per successful rebuild),
  exposed in `get_session` instances and `window.__loom` — validators assert
  "no rebuild" against it (M6 needs it twice; the chains half will reuse it).
- Palette tunings persist to `content/state/palettes.json` via the `loom:state`
  middleware. Stop roles (0 bg · 1 edge · 2/3 core · 4 accent) are documented
  convention, not kernel vocabulary (R7.1).
- **`gradient` scene** added as the minimal `ramp()` consumer (and the validator's
  ramp target); `lava` converted to `ctx.palette` stops with an `own()` default
  reproducing its original ink/ember look.
- **`unstage` added as an MCP tool** (agent surface 10→11): clearing the staged
  candidate is as safe as staging, and agents auditioning palette/source variants
  need to drop a candidate without a human. The four tool-surface validator
  assertions (m3/m4/m5/modulators) gained `"unstage"`.

## 2026-06-11 — Docs refactor: one source of truth per fact, one doc per audience

- **`docs/architecture.md` is now THE architecture doc**; root `CLAUDE.md` slimmed to orientation + commands + the never-go-black paragraph + a doc map (the old "read 4 docs before work" list cost ~88KB of context per session). `loom/.claude/` stays the complete, self-sufficient surface for visuals agents.
- **`implementation-plan-v1.md` → `docs/roadmap.md`** (shipped table + remaining milestones); original archived in `docs/history/`. `requirements-v1.md` moved to `docs/` unchanged.
- **`agent-updates.md` retired** (archived as `docs/history/agent-updates-m0-m6.md`): milestone ships are now ≤6-line SHIPPED entries here — one log, not two. Durable gotchas distilled into the skills.
- **`artifacts/` gitignored** — supersedes the M0 "validation artifacts committed as evidence" decision; the evidence is the validator's pass/fail output, screenshots are regenerable local scratch.
- **`loom:catalog` Vite plugin**: the dev server regenerates `content/CATALOG.md` on every module/scene save (debounced, failures logged and swallowed), closing the gap where live sessions never run `pnpm typecheck` and the library's search surface went stale exactly when agents needed it.
- Spec: `docs/superpowers/specs/2026-06-11-docs-refactor-design.md`. The in-flight `m6-color-chains` worktree predates this layout — on rebase, redirect its doc steps (ship entry → DECISIONS, guide edits → new paths).

## 2026-06-11 — mandelbloom palette showcase SHIPPED

- **The `mandelbrot` source module absorbed the dive animation** (optional `glide` lag on
  cx/cy + `dive`/`depth`/`baseScale` ping-pong zoom integrator) instead of a separate
  `mandelDive` module — one abstract source covers both the static renderer and the
  self-diving case. The no-`dive`/`glide` path is byte-identical, so existing callers are
  unaffected; `mandelbrot.scene.ts` was refactored onto it, deleting its duplicated integrator.
- **New `paletteMap` effect** (`content/modules/effects/paletteMap.ts`): maps input luminance
  through the **global** palette ramp (`ctx.palette.ramp`), the palette-native sibling of
  `colorize` (which only knows the cosine PALETTES presets). Any scene using it auto-declares
  `palette.source`.
- **New `mandelbloom` scene** showcases R7 palettes: exterior filaments via the ramp, a
  kick-blooming "garden" (warped noise + blobs, discrete stops) in the black interior, an
  accent-stop boundary rim for contrast, then feedback → glitch → levels. One `palette.source`
  flip (own/primary/secondary) retints the whole frame with no rebuild (verified `builds`=1).
- Gates: `pnpm typecheck` + `pnpm test` green; `pnpm validate:m6` green; eyes-on via MCP
  (retint with no rebuild; garden blooms on mic audio). Spec + plan under `docs/superpowers/`.

## 2026-06-11 — Console UI redesign SHIPPED

- **Console cockpit rebuilt for cohesion + density** (spec/plan under `docs/superpowers/`):
  LOOM wordmark; BPM readout and TAP consolidated into one tappable chip; FPS promoted to a
  first-class mono readout; output/staged open in new tabs; slim stage bar; tiles carry their
  chrome as overlays (LIVE = red ring + chip, hover-only destroy ×); drag-reorder persists to
  localStorage; param drawer resizable (240px–60vw, persisted); palettes are swatch-only with
  hex tooltips; staged instance streams at 640×360 so /staged.html shows real detail.
- **Scene picker is a ghost "+" tile**: a grid of scene cards showing each scene's *last-run
  snapshot* (`loom.scenethumbs` in localStorage, fed by every rendering tile). Hovering a card
  shows its snapshot in the tile instantly, builds a REAL sandbox instance after 250 ms, and
  swaps in live pixels when they arrive — the tile never blanks mid-swap (the v1 list flickered:
  destroy-then-create left a blank gap). Preview destroyed on close/move, never more than one
  alive; the grid hides the preview's own tile until picked.
- **Agent commit defaults ARMED** ("let the agent commit by default for now" — Zack);
  `?agentCommit=0` or the Console checkbox restores the gate. **Drop on the stage bar = stage
  + commit** (human-sourced, never gated). validate-m3/m4 acceptance moved with the behavior:
  the gate is now proven via disarm instead of via arm, drag-to-strip asserts go-live.
- Gates: typecheck, unit tests, validate m0–m6 + modulators all green (m5 flaked once on the
  envelope-drain window, clean on rerun). Eyes-on via validator + peek screenshots.

## 2026-06-11 — Console works without the Output tab visible (+ QoL batch)

- **Worker clock for hidden tabs**: browsers freeze rAF and clamp main-thread timers to
  >=1 s when a tab is backgrounded, so the Console went dead whenever the Output tab
  wasn''t showing. A dedicated-worker interval (exempt from timer throttling) drives
  `frameTick` at ~30 fps while `document.hidden`, and the console-channel state/thumb
  broadcasts moved to the same worker clocks. `__loom.clockSource` reports which clock
  drove the last frame (raf | worker).
- **/staged.html presents like the Output window**: preview fills the viewport,
  cover-scaled, under its slim header (was a small contain-fit image).
- **palette.source moved to the param drawer** (Zack: belongs with the instance''s params,
  not the sub-header). ParamPanel hoists it flat — never buried in an accordion; the
  stage bar lost its toggle; /staged keeps one (no drawer there). m6 §9 now drives the
  drawer toggle.
- **Named palette presets**: per-row dropdown in the Rack applies curated built-ins or
  user-saved palettes (5 stops, live retint via set_param); "save as…" names the current
  stops (localStorage `loom.palettepresets`, user entries shadow built-ins).
- Gates: typecheck, unit tests, full validate m0–m6 + modulators green; worker-clock
  render path proven via forced-hidden probe (clockSource=worker, thumbs streaming).

## 2026-06-11 — Roadmap restructure: depth before library, assets get milestones

- Zack's call: split the old Geo-&-particles L into two milestones and move them **ahead of**
  Library & parallel build — M7 Geo, M8 Particles (particles consume M7's `GeoNode`). New
  milestones: M9 video sources (clips usable exactly like images, mirroring `sources/image.ts`),
  M10 asset explorer (left Console pane: modules binned by kind, TouchDesigner-style, plus
  user-registered external folders — e.g. a VJ Assets dir — with select/drag as the interaction
  model). Library is M11, gig hardening M12.
- New ordered Housekeeping block in the roadmap: cull `hello`/`pulse-glitch`/`vinyl` scenes
  (`pulse` stays — every validator pins it as its live scene, so culling it would mean re-pinning
  six validators; Zack chose to keep it as the test workhorse), then a param-group naming
  pass over surviving scenes; Console mod-popover default becomes 20 s (was 4 beats; runtime
  has no default to change); double-click-to-rename instance tiles; 2× tile thumbnails.

## 2026-06-11 — The Output window is optional: embedded console engine

- The previous worker-clock fix only covered "Output open but backgrounded" — Zack opens
  the Console *alone*. The Console now boots an **embedded engine** in a hidden same-origin
  iframe (`/?embedded=1&audio=test`) when no engine says hello within 2.5 s.
- **Takeover protocol** (console-channel): state broadcasts carry `engineId`/`embedded`;
  an embedded engine that hears another engine''s state **stands down completely** — stops
  the render loop, the worker clocks, the WS bridge (no zombie reconnects racing
  "latest connection wins" at the sidecar), and stops answering channel requests. The
  Output window always wins; embedded peers tie-break on id. The Console follows the new
  engine seamlessly.
- Worker fallback clock now also fires on **rAF starvation** (>150 ms without a rAF tick),
  which covers offscreen-iframe throttling, not just `document.hidden`.
- Audio: AudioContexts need a user gesture the iframe never gets — the Console forwards
  its pointerdown to `iframe.__loom.resumeAudio()` (activation is visible to same-origin
  frames). Embedded boots on the test signal; switch to mic from the header picker.
- Validator consoles pin `?embed=0` — an embedded engine would dial the DEFAULT sidecar
  port and break run isolation.
- Gates: typecheck, unit tests, full validate m0–m6 + modulators green. Solo probe:
  console alone → boot tile + thumbs stream; real Output opened → embedded frame counter
  freezes, console stays connected.

## 2026-06-11 — Selection halo, name-only tiles, rename_instance, pnpm validate

- **Selection and stage status get separate visual channels**: status stays the inner
  ring (red LIVE / amber STAGED) + chip; selection is an OUTER green halo past a gap
  (Figma-style) + tinted name row — a selected live tile reads "red ring inside a green
  halo". Previously one ring served both and selection vanished on live/staged tiles.
- **Tiles show just the instance name** (scene moved to the tooltip and the param-drawer
  header, which also gained LIVE/STAGED chips). **Double-click renames inline** via a new
  human-only `rename_instance` command: `SessionStore.rename` re-keys the entry (no
  rebuild), `Stage.onInstanceRenamed` carries live/staged/fade pointers (unit-tested),
  reserved names refused, `boot` exempt (bound to live.scene.ts hot-swaps). Not an MCP
  tool — the agent tool surface is validator-pinned.
- **`pnpm validate` runs every acceptance suite** in order, stopping on first failure.
- **m5 de-flaked**: "threshold 0.95 zeroes kick onsets" raced the synthetic kick (any
  threshold < 1 can be grazed; ~1-in-3 flake). The check now also sets the kick
  envelope gain to 0 — deterministic silence, same late-binding semantics.
- Gates: typecheck, unit tests (+ new stage rename test), full `pnpm validate` green
  (139 checks). Eyes-on: selected-live halo, selected-staged halo, rename end-to-end
  (tile id, stage pointer, drawer header all follow).

## 2026-06-11 — SHIPPED: Housekeeping batch

- Scene cull (hello/pulse-glitch/vinyl; pulse kept as validator workhorse), param groups for
  fireflies/mandelbrot/mandelbloom with persisted-value key migration, 20 s modulator default
  (ModPopover seed only — runtime requires an explicit period), 2× tiles (480px columns),
  whole-top StageDropZone (strip alone was too thin; #stagestrip id kept, validator drags bubble).
- Gates: typecheck, unit tests (137+24+7), full `pnpm validate` (m0–m6 + modulators) green.
- Deviation: thumbnail capture stays 320×180 until the rename workstream's engine-api lands
  (follow-up noted in roadmap). Stumble: a parallel session edited the same console files
  mid-run — every commit used explicit path lists, no `git add -A`.
