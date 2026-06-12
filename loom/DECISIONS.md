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

## 2026-06-12 — CI on GitHub Actions + Cloudflare Pages preview + PR screenshots

- **First production build target.** The standing decision was "Vite dev server =
  the deploy mechanism" (no build step). For phone-openable PR previews we added a
  static multi-page `vite build` (Output `/` + Console `/console.html` + Staged
  `/staged.html`) in `engine-app/vite.config.ts`. Dev server, HMR, and never-go-black
  are untouched — the build is a *parallel* artifact, not the live runtime. The
  static bundle is "view + tweak" only: the sidecar WS is absent and the bridge's
  reconnect loop no-ops harmlessly; live agent/MCP editing stays in the dev session.
- **Validators are now Linux-portable.** They hardcoded `--use-angle=d3d11` (Windows).
  Centralized GL flags in `scripts/_browser.mjs` (`glArgs`), chosen by platform and
  overridable with `LOOM_GL`; Linux/CI defaults to SwiftShader, the software GL that
  drives the same WebGL2 fallback the checks already assert against.
- **pnpm 11 portability.** `pnpm.onlyBuiltDependencies` (read by pnpm 10 from
  package.json) moved to `pnpm-workspace.yaml` `allowBuilds: { esbuild: true }`;
  pinned `packageManager: pnpm@11.6.0` for reproducible installs (corepack + CI).
- **Preview + screenshots ride the same deploy.** `scripts/shoot.mjs` renders scenes
  to PNG (same spawn-vite + headless-Chromium pattern as the validators, restores
  `live.scene.ts`); the preview job shoots into the deploy's `shots/` and
  `scripts/preview-comment.mjs` embeds them inline in a sticky PR comment — no git
  binaries. Durable in-diff stills go to the tracked `preview/screenshots/` when
  authoring a visual.
- Cloudflare deploy/comment steps skip gracefully until `CLOUDFLARE_API_TOKEN` +
  `CLOUDFLARE_ACCOUNT_ID` secrets exist; the build still runs so the bundle stays
  tested. Setup: `docs/ci-and-preview.md`. Gates: typecheck + unit tests green
  locally; validators run in CI (no GPU in this dev container to run them here).

## 2026-06-12 — Headless CI tuning: required gate vs advisory validators

Getting the validators green on GitHub's GPU-less runners surfaced three headless
realities (the validators were written for a real GPU + manual WebGPU checks):

- **Force WebGL2 by hiding `navigator.gpu`.** Chrome 148 headless exposes a
  software WebGPU adapter regardless of flags (`--disable-features=WebGPU` etc.
  don't stick), so `WebGPURenderer` picked WebGPU and rendered blank-white or hung
  the screenshot. A Playwright init script (`forceWebGL2`, `scripts/_browser.mjs`)
  defines `navigator.gpu` as undefined → three falls back to the WebGL2 backend the
  assertions are calibrated for. Chromium GL flags only choose SwiftShader as the
  WebGL2 *provider*.
- **`LOOM_RES=640x360` in CI.** Software WebGL2 can't render heavy scenes
  (pho-nebula's multi-pass feedback) at 1080p fast enough for the compositor to
  hand Playwright a frame; the shot times out. A `resQuery` (gated on `LOOM_RES`)
  drops the internal render res for CI only — local hardware keeps full fidelity.
- **Headless audio/MCP-readback are flaky.** The synthetic `AudioContext` yields
  only a couple of analysable kicks (onset detectors can't re-arm), and the MCP
  `screenshot` tool's `readRenderTargetPixelsAsync` returns no image under software
  GL. Rather than weaken the suite further or change `engine-app`, CI splits:
  **required gate** = typecheck + unit + build + **m0** (deterministic HMR /
  never-go-black smoke); **advisory** (non-blocking) = m1–m6 + modulators. They
  still run every PR for signal but don't gate merge. Full acceptance stays a
  real-GPU / manual exercise, exactly as the validators were designed.

## 2026-06-11 — Raw-MIDI monitor in the session snapshot (first real-controller debugging)

A nanoKONTROL2 in a non-default mode (relative knob ticks, non-CC faders) looked
simply "dead" to MIDI-learn: the engine acts on Control Change only and dropped
everything else without a trace, making the failure undiagnosable from inside
LOOM. `MidiBus` now keeps the last 16 raw messages — including the traffic it
ignores, minus realtime keepalives (clock/active-sensing) — surfaced as
`midi.recent` in the session snapshot (`.default([])` keeps older engines
parseable) and as a live monitor dialog behind the Console header's MIDI status.
The engine still *acts* on CC only; the monitor is eyes, not new routing.
Hardware lesson for the books: constant repeated CC values or pitch-bend faders
mean the controller needs a factory reset to CC mode, not an engine fix.

## 2026-06-11 — SHIPPED: MIDI button bindings (modes + actions pseudo-scene)

Bindings carry mode absolute/set/cycle (rising-edge for buttons): set
accumulates radio groups, cycle wraps ints / flips bools (Param.cycle —
renamed from step() in review: collided with the RangedSpec step slider
hint), and pseudo-scene "actions" (live.next/live.prev) steps LIVE through
ok tiles via stage/commit as a human gesture (mash-safe; clobbers a pending
staged candidate by design). Gates: typecheck, unit (154), validate-m5 34/34,
full pnpm validate. Stumble: validator waitFor treats falsy as "not yet" —
never return a flipped bool from a poll. Spec:
docs/superpowers/specs/2026-06-11-midi-button-bindings-design.md.
## 2026-06-11 — Stdlib tests & robustness SHIPPED

- **Real BuildCtx, not a mock**: the roadmap asked for a mock BuildCtx, but the real one
  is already GPU-free (its only three import is `uniform` from three/tsl) — so the
  content/ test root (`loom/vitest.config.ts`, happy-dom for TextureLoader''s DOM Image)
  builds modules with the REAL BuildCtx over mock/real buses (FakeAudioBus, real
  TimeBus/InputRegistry-with-the-actual-rack/PaletteRegistry). `ProbeCtx` records every
  uniform a module registers; finiteness over those probes is total NaN detection for
  CPU-side signals.
- **Coverage is automatic**: `import.meta.glob` discovery sweeps every module file;
  tier-1 (kind↔folder, metadata, output shape, `[...input.passes, own]` via a marker
  pass, honest ranges incl. no degenerate min==max) and tier-2 (param-extremes sweep,
  60 frames per setting, black-input builds for effects) run per discovered module. A
  module without a `cases.ts` entry fails the completeness test — "new modules merge
  with their tests" is mechanical, not policy.
- **Golden patterns as tests**: no `audio.onset(` in modules OR scenes (named rack
  channels only, R6.4). The scan immediately caught `lava` and `mandelbloom` re-detecting
  kick locally — both converted to `ctx.input("kick")`.
- **Ship-gate self-test**: deliberately broken modules (NaN at a param extreme, dropped/
  reordered input passes, malformed metadata, dishonest ranges) are provably caught.
- **Tier-3 smoke render** (`validate:stdlib`): every module hot-swaps into the live
  engine in a generated sandbox scene (effects over osc, controls driving osc) and must
  render non-black with a clean console; appended to `pnpm validate`.
- Gates: typecheck; `pnpm test` = 312 tests (168 package + 144 content); full
  `pnpm validate` = 162 checks across 9 suites, all green. Spec + plan under
  `docs/superpowers/`.

## 2026-06-12 — Better panic button (PANIC modes: hold | safe scene)

Implements `feature-requests/panic-scene.md`. PANIC gains an armed mode: **hold**
(freeze the last frame, unchanged default) or **scene** (hard-cut to a warm,
always-rendering safe scene). Gates run: `pnpm typecheck`, unit tests (runtime
144, sidecar 24, engine-app 7), `validate:panic`.

- **Runtime stays minimal (NFR-2).** Stage adds one directive mode
  (`panic-scene`, carrying the panic instance id + the untouched live id) and a
  `panic(mode, panicId?)` signature; `held: boolean` became `panicState: "hold"
  |"scene"|null`. Scene-panic is an output override — the LIVE pointer never
  moves (FR-4), so RESUME is just "clear panic" with no bookkeeping. Re-press
  only escalates hold→scene; scene→hold is a no-op (FR-6). Everything else
  (warm-instance lifecycle, compositor leg, fallback) lives in engine-app.
- **Worst case = today.** A broken/absent safe scene routes to hold (FR-7); a
  render-throw in the panic instance freezes it → the compositor skips it →
  hold (FR-8). Never worse than the pre-feature behavior.
- **Deviation from the spec's resolved-decision #1 (designation via
  `panic.scene.ts` pointer, *not* a Console picker), at the user's request:**
  the SAFE target is now a **movable designation over existing instances** — the
  ⛑ SAFE marker and scene-panic routing point at whichever instance the human
  picks from the Console (`set_panic_instance`, human-only), exactly like LIVE /
  STAGED are instance pointers. `panic.scene.ts` builds the boot-default safe
  instance (id `"panic"`, the initial designation + guaranteed fallback);
  picking any other instance moves the designation (and destroy/rename
  protection) to it with no rebuild. Persisting the designated instance's scene
  name lets the boot default reflect it across a restart (instance ids are
  ephemeral). The "pick any instance / multiple named safe scenes" item moves
  from out-of-scope to shipped.
- **Trust tiers unchanged.** `panic`/`resume`/`arm_panic_mode`/`set_panic_instance`
  are human-only (Console); agents only observe via `get_session`
  (`panicMode`/`panicActive`/`panicScene` + the `pinned:"panic"` instance) and
  are told to stop touching the live path while `panicActive` is non-null.

## M6 chains half — per-instance post-effect chains (2026-06-12)

- **Enable/disable is a wet/dry `fx.<id>.mix` float param, not a structural
  field.** Every step is always built; the fold wraps it as
  `mix(input.rgb, effect.rgb, mix)`. So toggling/fading an effect is a plain
  `set_param` (no rebuild, MIDI-bindable, ridable on a fader) and bypassed steps
  keep their passes running — stateful history (feedback) stays warm. Structural
  edits (add/remove/reorder/insert) rebuild; mix rides don't.
- **Chains are runtime data on the session `Entry` (a `ChainHost`), folded inside
  `buildInstance` before `finalize()`.** A throwing step throws the whole build →
  NFR-5 rejects it and the previous chain + pixels keep running. No new
  never-go-black mechanism. Mirrors `ModulatorHost`: instance-scoped, survives
  rebuilds, reseeded with carry-forward by stable step id (`<effect>-<n>`).
- **`set_chain` is full-list/idempotent** (the whole desired step list) so
  add/remove/reorder/insert are one verb. Agent edits to the LIVE chain need the
  same arming gate as `commit`; sandbox edits are ungated. Humans (Console) are
  never gated. `restoreDefault` resets to the scene's declared `chain`.
- **Saved chains are composite effects: data, one level deep.** `save_chain`
  writes `content/modules/effects/chains/<name>.chain.json` (a `loom:effects` Vite
  middleware, sibling to `loom:state`); the effects barrel globs them alongside
  code primitives. A composite folds its inner primitives, namespaced
  `fx.<id>.<inner>.<param>`. A composite may not contain a composite (cycle guard).
- **Chain knob values live in the chain data (session-lived), not
  `values/<scene>.json`** — `fx.*` is filtered out of per-scene persistence. Full
  chain snapshot/restore across reload stays M9.
- **Scenes may declare a default chain** (`defineScene({ chain: [...] })`), seeded
  at create and restorable; scene-code HMR updates the stored default but never
  clobbers a chain the user/agent has since edited (same rule as tuned params).
- **SHIPPED:** runtime `ChainHost` + fold (`chain.ts`), `meta.chainParams` on
  `glitch`/`feedback`/`levels`, engine-app effects barrel + `set_chain`/`save_chain`
  + Console FX-chain panel (cards, drag-reorder, insertion points, mix faders,
  picker, save-as, restore). Gates: typecheck + unit (runtime `chain.test.ts`,
  sidecar protocol) + production build green. `validate:m6` chain checks added but
  **not run here** — this sandbox is egress-blocked from Playwright's browser and
  the substituted system Chromium can't do the WebGL readback (the palette half's
  first screenshot times out too); run it on a real-GPU/CI browser.

## Layers — named nodes, per-node rigs & chains (2026-06-11)

- **`ctx.layer(name, tex)` is the one new BuildCtx primitive.** It folds a
  uniform-driven rig (`<name>.layer.x/y/scale/rotate/opacity`, identity defaults,
  2D affine + opacity through one RT pass mirroring `transform`'s mechanics —
  `set_param` never rebuilds) and the node's FX chain via a session-injected
  `foldNode` hook. Explicit-only: unwrapped nodes cost nothing. Duplicate /
  reserved / malformed names throw (NFR-5 contains them).
- **Parentage is detected via marker passes**: wraps register bottom-up; an outer
  wrap claims any not-yet-parented node whose rig pass is in its input's pass
  list. Works through pass-merging composition (`over`).
- **Per-node chains are `ChainHost`s with a path prefix** (`<node>.fx` vs root
  `fx`) in an `Entry.nodeChains` map, lazily created on first `set_chain {node}`;
  node chains have no scene default (restoreDefault clears). Same NFR-5 + arming
  semantics as root.
- **Node-chain wet/dry preserves the INPUT's alpha** (root keeps M6's lock-to-1):
  most stdlib effects emit alpha 1, which would make a chained overlay-node
  full-frame opaque. Consequence: node FX recolor within the node's silhouette;
  silhouette-expanding FX (feedback halos) belong inside the wrap or on the root.
  Revisit by auditing effect alpha propagation if it pinches.
- **Manifest stays flat** — paths encode the tree; modulators, MIDI-learn, tuned
  persistence work on layer params unchanged. `get_manifest`/`get_session` gain
  `nodes: [{id, parent, chain}]`; the Console renders node groups (⬚, parent
  annotation) each with its own FX chain. MIDI e2e intentionally not re-validated
  (path-generic, m5 covers the mechanics).
- **SHIPPED:** runtime `layer.ts` + `BuildCtx.layer` + ChainHost prefix; session
  nodeChains + `set_chain` node arg; Console node sections; `vinyl-zoom` (dive/
  logo/hippos) + `pho-nebula` (bowl/garnish/badge) wrapped. Gates: typecheck,
  pnpm test (353), `validate:layers` 22/22, full `pnpm validate` green.

## Projects — set lists (2026-06-11)

- **A project is the serialized instance set**: per instance `{scene, values,
  modulators, root chain, per-node chains}` in tile order + which one was live,
  written to `content/state/projects/<name>.json` through the existing
  `loom:state` middleware (set lists live in git, NFR-4). Chain knob values ride
  in the chain data, never in `values` (same rule as per-scene persistence).
- **Loading is audience-safe**: every instance builds into a sandbox via a new
  `SessionStore.create(def, id, init)` seed path (chains + values fold into
  build #1 — no rebuild storm); the Stage is never touched. The pre-load
  instances cull only after a commit FROM the loaded set lands (fade complete;
  deferred-cull check in the render loop). Ids are kept when free, `~n`-suffixed
  when taken — loading twice is legal.
- **Per-instance values override per-scene tuned defaults** at load (two
  differently-tuned instances of one scene can coexist in a project).
- **Trust tiers**: `load_project`/`list_projects` are ungated (loading is free);
  agent `save_project` needs arming like commit (it writes a repo file). The
  Console has a load switcher + save dialog (tile order captured from the grid);
  the engine caches the project list for the snapshot, `loom:state-list` lists
  the directory so git-dropped files appear too.
- Projects save/load deliberately IGNORE `?state=off` — explicit user actions,
  not ambient persistence (validators still snapshot/restore content/state).
- **SHIPPED:** engine `ProjectStore` + deferred cull (main.ts), session init
  seeding, 3 MCP tools, Console header control, `validate:projects` 23/23,
  engine-app `projects.test.ts` round-trip; full gate green.

## M9 — Video sources (2026-06-11)

- **`video` module mirrors `image`** (same localSpace placement, premultiplied
  alpha, contain-by-height): an HTMLVideoElement + three `VideoTexture`, muted
  by default. `speed`/`scrubbing`/`scrub`/`loop` are **SignalLike opts** (the
  module-authoring rule: params live in scenes, modules take Signals) — scenes
  wire them to params, so set_param retimes/scrubs with no rebuild. The element
  is driven CPU-side in the module's pass, fully guarded: a missing/unsupported
  clip stays transparent, never throws the build.
- **`loom:media` middleware** serves repo-EXTERNAL files (`/loom/media?p=<abs>`)
  with HTTP Range support (video seeks need 206); confined to roots registered
  in `content/state/media-roots.json` (read per request, hot-editable; 403
  outside). `mediaUrl(absPath)` in video.ts builds the URL. M10's asset
  explorer grows on this registration.
- **Asset reality**: the artist .mov loops are MJPEG (Chrome can't decode) — the
  Beeple .mp4s play directly; `Videos/transcoded/` holds h264 transcodes of two
  loops (ffmpeg, not in repo). A committed 23 KB testsrc2 clip
  (content/assets/test/clip.mp4) makes the validators machine-independent.
- `beeple-wall` scene: two video decks (city + kaleido-folded tunnel) with
  speed/scrub params, layer-wrapped, kick-driven levels.
- **SHIPPED:** video module + cases.ts entry (tier-1/2 swept), stdlib smoke
  covers it, `validate:m9` 14/14 (play/freeze/scrub/loop with no rebuild, M4
  cover checks on a video source, Range/403/404 middleware, external clip e2e).

## Fixtures — deterministic input traces (2026-06-11)

- **A fixture is the rack's POST-DETECTOR values, one row per frame**
  (`content/state/fixtures/<name>.json`: name/bpm/channels/frames) — replay
  needs no audio, no detectors, no timing luck. `record_fixture` captures the
  live rack in the render loop; `create_instance({inputs:"fixture:<name>"})`
  replays it through a `FixturePlayer` (an `InputProvider` — `ctx.input` is
  late-bound, so scenes change not at all).
- **`screenshot({frames:[…]})` is a deterministic offline pass**: the entry's
  scene is REBUILT against the trace on a virtual clock (frame 0, dt 1/60, own
  TimeBus at the trace's bpm, silent audio), with its tuned values + chains +
  modulator specs mirrored, stepped to each requested frame and read back.
  Same fixture + frames → byte-identical PNGs, every call, across instances.
  The live entry is never touched (builds counter unchanged).
- **TSL `time` is banned from content/** (golden-pattern scan): it reads the
  renderer's WALL clock, bypassing the frame clock — the one nondeterminism
  the first validator run caught (7 modules migrated to
  `ctx.uniformOf(ctx.time.now)`). Frame-clock time also means a virtual clock
  can pause/step scenes — groundwork M11/M12 want anyway.
- **SHIPPED:** runtime `FixturePlayer`/`InputProvider` (+ unit tests), session
  fixture entries (rebuild-safe), record/replay/shots in main.ts, MCP
  `record_fixture` + extended `create_instance`/`screenshot`,
  `validate:fixtures` 11/11. Tool-surface assertions moved (m3/m4/m5/modulators).

## M7 — Geo (2026-06-11)

- **GeoNode/CamNode join ModuleOutput** (`{object: Object3D}` / `{camera}`,
  runtime geo.ts): geo modules return scene-graph fragments, never pixels.
  The `render3d` bridge (a SOURCE) owns a Scene + default hemi/key lights +
  an MSAA HalfFloat RT sized to the destination, renders world+cam per frame,
  returns a TexNode — so meshes flow through chains, layers and 2D effects
  unchanged. Transparent clear by default (composites over anything).
- **Primitives** (box/sphere/torus over a shared `_primitive` helper) carry
  live spin/tumble/glow/scale via ctx.updaters (frame-clock — deterministic
  under fixtures). `orbitCam` integrates speed (rad/s) the same way.
- **`model` loads glTF AND FBX** (the user's hippo is FBX; three's loaders,
  fflate bundled). Loaded materials are NORMALIZED to MeshStandardMaterial
  (color + diffuse map): FBX phong with layered textures threw inside the
  WebGL backend and froze the instance (NFR-2 caught it; the readback of the
  never-written preview target was the visible symptom). Async load into a
  placeholder group, bbox recenter + height-normalize; missing files stay
  empty, never throw. Path-style `/loom/mediafs/<rootIdx>/<rel>` route added
  so FBX relative textures resolve (query-style ?p= URLs can't).
- **Per-instance frame-time HUD** (pulled forward): Instance.frameMs (EMA of
  CPU submit cost) in get_session + Console tiles; screenshot metadata gains
  fps. The perf early-warning meter before M8 particle pools.
- Harness: stdlib smoke mounts geo modules through render3d + orbitCam; a
  committed 1.5 KB cube.glb (scripts/make-test-glb.mjs) keeps model checks
  machine-independent; validate-m7's FBX checks run only where the local
  hippo exists. The roadmap's `chain:<scene>@<node>` mount idea is covered by
  validate-layers' per-node chain checks — not built separately.
- **M8 validation strategy (decided up front, per the roadmap risk)**: the
  particle pool ships with a CPU-sim + instanced-rendering base path that
  runs (and validates) on the WebGL2 fallback; TSL-compute is the WebGPU
  upgrade path, verified manually in desktop Chrome. Headless SwiftShader
  WebGPU stays off the table (_browser.mjs hides navigator.gpu for known
  blank-render reasons).
- **SHIPPED:** 6 geo modules + render3d, mediafs route, frameMs/fps HUD,
  geo-rave + hippo3d scenes (eyes-on stills verified), `validate:m7` 11/11
  incl. FBX hippo render, contract tests grown a geo branch.

## M8 — Particles (2026-06-11)

- **CPU sim over a GPU-instanced pool** (the validation strategy decided at M7):
  struct-of-arrays state, swap-with-last culling, spawn-debt accumulator,
  InstancedMesh of unit octahedra with emissive standard material — runs and
  VALIDATES on the WebGL2 fallback everywhere. TSL-compute is the WebGPU
  upgrade path (post-v1), behind the same module surface.
- **Surface sampling via MeshSurfaceSampler**, lazily acquired so async models
  (the hippo FBX) emit the moment their geometry arrives; sampling happens in
  the surface's WORLD space, so spinning/scaling the host mesh steers the
  emission live. Velocity launches along the world normal.
- **Determinism, hard-won twice**: (1) `instanceMatrix` needs
  `DynamicDrawUsage` — without it the WebGL backend re-uploaded the buffer
  only inside the rAF loop, freezing offline fixture passes (giant
  identity-matrix octahedron as the tell); (2) `MeshSurfaceSampler` defaults
  to `Math.random` — `setRandomGenerator(seededPrng)` (runtime API,
  @types/three omits it) makes replays byte-identical (cross-call diff
  mean=0, max=0). Also: offline fixture stepping now BINDS the destination
  RT before each renderFrame — destination-sized passes (render3d/transform/
  rigs) were sizing off the live loop's leftover target.
- render3d dropped MSAA (resolve also misbehaved outside rAF; full-res live
  render keeps edges fine).
- `hippo-swarm` scene IS the flagship prompt on this rig's own model:
  particles off the hippo's surface, hats driving turbulence
  (`turbulence: hats × chaos`), kick punching the key light; the validator
  commits the swarm through a feedback+paletteMap chain via the REAL
  set_chain. Eyes-on still verified.
- **SHIPPED:** particleEmitter module + case + stdlib smoke, hippo-swarm
  scene, `validate:m8` 9/9 (emission, motion, no-rebuild rides, turbulence
  whip, chain commit, byte-identical fixture replay, frame-time HUD).

## Stdlib burndown complete — 33 TD-inspired modules + 8 showcase scenes (2026-06-12)

- **The whole docs/stdlib-burndown.md list shipped in one pass** (M11's §6
  coverage worklist): 6 controls (envelope/remap/spring/sampleHold/gate/
  counter), 8 sources (solid/gradient/shape/checker/voronoi/plasma/text/
  webcam), 15 effects (blur/threshold/bloom/mixer/displace/hsv/mirror/tile/
  echo/key/posterize/invert/rgbSplit/vignette/crt), 4 geo (plane/tube/
  pointCloud/displaceGeo) — 63 modules total in the catalog, every effect
  chainParams-eligible, every module cases.ts-swept (381 content tests) and
  smoke-rendered (validate:stdlib 64/64, now with Chromium's fake camera for
  the webcam smoke).
- **`mix` landed as `mixer`** — TSL's `mix` import would shadow it everywhere.
  Like `over`, `mixer`/`displace`-with-map are scene-composition effects (two
  TexNode inputs; chains carry one), but `displace` doubles as a chain step
  with a built-in fractal-noise displacer.
- All time-driven modules integrate on the frame clock (no TSL `time`, the
  scan enforces it); stateful CHOPs (envelope/spring/sampleHold/gate/counter)
  document the pull-every-frame contract; geo vertex writers (displaceGeo/
  pointCloud) carry the M8 DynamicDrawUsage lesson.
- **Echo's ring buffer stores frames at 640×360** (24 max) — ghosting doesn't
  need 1080p and VRAM dies fast at full res.
- 8 showcase scenes (neon-bloom, deck-mixer on two live Beeple decks,
  warp-room, camera-ghost, type-strobe, plasma-wall, rutt-etra, spring-rave),
  all layer-wrapped, all rack-driven, eyes-on stills verified.

## M11 — Library & parallel build (2026-06-12)

- **Catalog columns**: the AST generator now marks ⛓chainable (declares
  `chainParams` → FX-picker/set_chain eligible) and ⚡inputs (named rack
  channels consumed, scanned from `ctx.input("…")` calls). Reality check the
  columns encode: modules take SignalLike opts BY DESIGN, so ⚡ lives on scene
  lines; two-input effects (`mixer`, `over`) are correctly not chainable.
- **library-use skill**: search-catalog-first, compose-before-writing,
  register-after-writing (metadata/tags/chainParams/cases.ts), and the
  parallel-build recipe (own tile + fixture input + independent files +
  signatures-first).
- **Parallel proof, run for real**: three subagents concurrently wrote
  static-haunt (glitchy) / biolume (organic) / prism-array (geometric) from
  the library only — zero file collisions, types-only coordination, all
  typecheck-green on first convergence; one human-pass default tune
  (static-haunt's strobe squared so decaying kicks don't sit half-inverted).
- **`validate:m11`**: catalog columns asserted; a module written MID-RUN
  hot-registers into the catalog + availableEffects with no reload (the
  "found tomorrow" loop); the 3 subagent scenes build healthy; three
  fixture-driven sandboxes create CONCURRENTLY and run healthy on a shared
  trace. The roadmap's stale CI section corrected: PR/push CI (typecheck +
  tests + build + Pages preview) has existed all along; validators stay
  local-on-real-GPU by documented decision.

## Spring cleaning (2026-06-12)

- **content/modules/_shared.ts** is the new shared plumbing (deliberately
  outside the kind folders so discovery never sweeps it): `bufferPass()` —
  the buffer-the-input-and-resample skeleton previously copy-pasted across 9
  effects (transform/mirror/tile/rgbSplit/crt/displace/blur/bloom/pixelate,
  with hooks for idle gates, sibling targets and extra quad passes);
  `surfaceAspect()` (moved from transform) and `parseHex()`. History-keeping
  effects (feedback/echo/glitch) intentionally keep FIXED-size buffers and
  stay custom.
- **GPU-side `16/9` is gone**: gradient/checker/plasma/voronoi/shape/vignette
  now use `surfaceAspect()` — modules track whatever surface they render to.
  CPU-layout modules (fireflies/blobs/spriteSwarm/pulseRings) keep an explicit
  `aspect` opt by necessity (JS math can't read a shader node).
- **`integrateSignal(rate, {wrap})` joins the runtime** (the `integrate()`
  helper every scene kept re-writing); `wrap` fixes a real float-precision
  hazard in hour-long sets. Scenes + module phase accumulators migrated.
- **engine-app readback.ts** unifies the three readRenderTargetPixelsAsync→
  canvas→dataURL copies (engine-api, main, fixture shots); SessionStore's
  create/swap share `reapplyValues`.
- **Test gaps closed** (the review's top tier): engine-api.test.ts (agent
  live-chain arming, commit gating, NFR-5 chain revert keeps the instance,
  reserved-name renames, MIDI target resolution incl. bool/action rejects,
  snapshot shape, liveStep wrap/mash-guard) and content behavior.test.ts
  (control CHOPs do what they claim: envelope asymmetry, spring overshoot,
  gate hysteresis, counter edge+wrap, sampleHold, remap curves) +
  integrateSignal unit tests. engine-app's vitest config gained the runtime/
  protocol aliases (value imports need them; type-only imports had hidden it).
- **Docs/skills debt from the review**: architecture tool count (17),
  ci-and-preview validator list (17 suites), module-authoring gains the M7/M8
  gotchas (DynamicDrawUsage, sampler seeding, material normalization,
  bufferPass/surfaceAspect guidance), scene-composition gains the fixtures
  iteration loop, library-use gains the composite-depth rule, and a NEW
  validator-authoring skill encodes the isolation contract + flake patterns.
- **Module packs** (third-party module/scene repos) sketched in
  feature-requests/module-packs.md and added to the post-v1 horizon.
- Follow-up left open: the ~800 lines of copied validator boilerplate
  (check/waitForServer/waitFor/spawn) want a shared scripts/_validate.mjs —
  mechanical but touches all 17 suites at once; do it as its own change.

## Expandable slider ranges (2026-06-12)

TouchDesigner-style live-editable param ranges: a module's declared
`{min,max}` is now a *default* baseline the performer can widen/narrow at
runtime, not a hard wall.

- **`Param` owns a mutable effective range** (`param.ts`): float/int params
  init `lo`/`hi` from the declared spec and keep an immutable `declaredLo/Hi`
  baseline. Clamp, `setNormalized` (MIDI), and `cycle` all read the live
  range. `setRange`/`resetRange` re-clamp the current value; numeric clamping
  moved out of the per-spec closure into `Param.clamp` so it tracks edits.
  `toJSON` carries `defaultRange` ONLY when overridden — keeps the default
  manifest shape (and its golden test) untouched and doubles as the UI's
  "is overridden" flag.
- **Persistence mirrors values**: `Manifest.rangeOverrides()`/`applyRanges()`
  → per-scene `state/ranges/<scene>.json` and global `state/input-ranges.json`.
  Ranges are reapplied BEFORE values on every build (SessionStore.reapplyValues
  / boot load) so a bound widened to hold an out-of-range value survives HMR
  and restart. Only divergent paths are written (clean files; reset drops out).
- **`set_param_range` is Console-only** (in the RequestType enum + engine
  dispatch, NOT an MCP tool): widening the author's declared range is a human
  power-tool, same spirit as MIDI-learn living in the Console. Labelled ints
  (toggles) and bool/color are rejected — only plain sliders have a range.
- **UX** (`RangePopover.tsx`, opened from a ⟷ button and the now-clickable
  value readout): exact min/max fields, ⊟/⊞ halve/double (symmetric ranges
  expand both ways, else anchor at min), a value field that widens the range
  to swallow an out-of-bounds number, and reset-to-default. The ⟷ button and
  value tint warning when the range is overridden.
- Gates: typecheck + `pnpm test` (387) green. Browser acceptance suites
  (validate:m5/m6) not run — this environment's egress blocks Playwright's
  browser download; they exercise the rack/param widgets touched here and
  should be run where a browser is available.
