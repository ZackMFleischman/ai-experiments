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

- **Want:** a `screenshot_console` MCP tool so the agent can see the Console cockpit
  (`/console.html`) the way `screenshot` shows instance pixels — needed before an agent can
  give feedback on (or iterate on) the Console UI itself.
- **Why the existing tool can't do it:** `screenshot` reads render-target/canvas pixels inside
  the Output page over the WS bridge. The Console is a sibling tab reachable only via
  `BroadcastChannel` — its DOM is not capturable from page JS (and its preview canvases are
  WebGL without `preserveDrawingBuffer`, so DOM-to-canvas hacks like html2canvas would read
  black where it matters).
- **Candidate approaches:** (a) sidecar attaches over CDP (`Page.captureScreenshot`) when
  Chrome is launched with `--remote-debugging-port` — pixel-accurate, no in-page code, but
  needs a launch flag and tab discovery; (b) a dev-only Playwright sidecar mode that owns a
  headed browser for both pages — accurate and scriptable, heavyweight; (c) Console
  self-capture via `getDisplayMedia` — permission-prompts the performer mid-set, rejected.
  (a) is the likely winner; same trust tier as `screenshot` (read-only).
