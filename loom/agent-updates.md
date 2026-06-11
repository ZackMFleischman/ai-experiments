# Agent build log

Append-only progress log, newest entries at the bottom. Basic beats only; details live in commits and `DECISIONS.md`.

## 2026-06-09 20:10 — M0 started

- Read requirements + implementation plan. Scope for M0: pnpm monorepo, Vite engine-app, WebGPURenderer + fps meter, hardcoded `defineScene` TSL scene, HMR hot-swap with error rejection.
- Branch: `claude/add-docs-loom-folder-8s4ox5` (M0 here; M1 will be cut onto its own branch per Zack's instruction).

## 2026-06-09 20:30 — M0 scaffold complete, typecheck green

- Monorepo: `loom/` root with `packages/runtime` (minimal `defineScene` + `SceneOutput` contract) and `packages/engine-app` (Vite app: fullscreen canvas, `WebGPURenderer`, `QuadMesh` fullscreen pass, fps meter).
- `content/scenes/hello.scene.ts`: animated TSL rings scene.
- HMR: `import.meta.hot.accept` on the scene file in `main.ts`; `SceneHost.setScene` try/catches `build()` and keeps the previous scene on any throw. Vite error overlay disabled so compile errors can't paint the Output window.
- Pinned `three@0.184.0` (exact, per plan risk table). One type fix: `colorNode` must be the typed node union from `NodeMaterial["colorNode"]`, not base `Node`.
- `pnpm typecheck` green. Playwright + Chromium installed for automated visual validation (will also serve M1).

## 2026-06-09 20:42 — M0 SHIPPED: 10/10 automated acceptance checks pass

- `pnpm validate:m0` (scripts/validate-m0.mjs) spins up Vite + headless Chromium and asserts the plan's "shipped when" end-to-end:
  - initial scene renders non-black (avg luminance 137)
  - editing the scene file hot-swaps in **102 ms** (plan budget: <2 s)
  - solid-green edit visibly lands on screen (center pixel rgb(0,255,0))
  - syntax error → screen unchanged, no reload, no error overlay
  - `build()` that throws → scene rejected, previous scene stays live
  - restoring the file hot-swaps the original back in
- Screenshots of each state saved to `loom/artifacts/m0-*.png` for inspection.
- Caveats: headless Chromium has no WebGPU adapter, so the automated run exercised three's WebGL2 fallback; desktop Chrome gets WebGPU. First pixel-sampling attempt via canvas `drawImage` read black (no `preserveDrawingBuffer`) — switched to decoding Playwright screenshots with pngjs.
- Next: commit M0, cut a new branch, build M1 (Signals).

## 2026-06-09 20:45 — M1 started on branch `claude/loom-m1-signals`

- M0 committed (`1ffa145`). New branch cut per Zack's overnight instruction; M1 = type kernel + InputBus + TexNode graph + 6 stdlib modules + per-instance containment.
- Kernel is pull-based and frame-memoized (`Signal.get(frame)` / `Events.poll(frame)`) so it unit-tests in Node with a fake clock. Wrote the tests first (TDD): 43 tests across signal/events/param/module/time/onset/control — red, then implementation, then green on the first full run.
- Added a synthetic audio mode (`?audio=test`: scheduled WebAudio kick + offbeat hats through the same AnalyserNode path as the mic) so audio reactivity is validatable headlessly and demoable without mic permission.

## 2026-06-09 21:00 — M1 SHIPPED: 19/19 browser checks + 43/43 unit tests + M0 regression 10/10

- `packages/runtime` is now the real kernel: `Signal`/`Events` (gate/latch/divide/frame-quantize), `Param`+`Manifest` (zod-validated, clamped, serializable), `defineModule`/`defineScene` with zod metadata, `BuildCtx` (manifest collection + Signal→GPU-uniform bridging), `Instance` (NFR-2: render-time throws freeze the instance, engine keeps running), `TimeBus` (BPM set/tap, beatPhase, beatEvery), `AudioBus` (mic or test signal → FFT bands bass/mid/treble, RMS, threshold+refractory onset detection).
- First 6 modules in `content/modules/`: `osc`, `noise`, `lag`, `lfo` (beat-synced), `feedback` (ping-pong render targets, the first stateful GPU pass), `levels`.
- `content/scenes/pulse.scene.ts`: the "shipped when" scene — kick onsets punch ring brightness through an envelope, lagged bass rides gain, 16-beat LFO drifts palette, feedback drags trails. `live.scene.ts` re-exports the active scene (one-line switch).
- `pnpm validate:m1` proves end-to-end: onsets ~2/s from synthetic kicks, luminance pulses with the kick (spread 33.6), HMR swap 102 ms, syntax error/build-throw/render-throw all keep pixels alive — the render-throw case freezes the instance while the engine loop keeps ticking (NFR-2), exactly per spec.
- Stumbles worth knowing: (1) an aborted validation run left an orphaned Vite holding the port and the next run silently talked to the stale server — scripts now fail fast if Vite exits early; (2) `@types/three` wants `Node<"vec4">` discipline, so `TexNode.color` is typed vec4-only, which is honestly the right contract anyway.
- Param manifest exists and collects (`punch`, `trail`, `drift` on pulse) but has no UI/MCP surface yet — that's M2/M3 per plan.

## 2026-06-10 16:45 — M0+M1 merged to main; M2 started on branch `claude/loom-m2-agent-eyes`

- Cleaned up branches: all work now on `main` (GitHub default), old claude/* branches deleted. Root `CLAUDE.md` written for future sessions.
- M2 scope: sidecar (WS bridge + MCP server over stdio), 4 agent tools (`get_session`, `get_manifest`, `set_param`, `screenshot`), `loom/.claude/` conventions + 2 skills, `validate:m2`.

## 2026-06-10 17:00 — M2 SHIPPED: 14/14 MCP e2e checks, set_param median 1.3 ms (budget 100 ms)

- New `packages/sidecar`: `protocol.ts` (zod wire contract, shared with the engine via alias), `Broker` (request/response correlation, timeouts, clean engine-not-connected errors — 17 unit tests, TDD), `index.ts` (MCP low-level Server on stdio + ws server on 7341, stderr-only logging).
- Engine: `bridge.ts` WS client (2 s auto-reconnect, hooks pattern, a throwing hook becomes an ok:false response); screenshots captured same-task after render (`toDataURL`, no preserveDrawingBuffer needed); `FpsMeter.current` exposed; session formalizes the `window.__loom` debug surface.
- Agent surface: `.mcp.json` (spawns sidecar via `node --import tsx`), `.claude/CLAUDE.md` (rules: params-before-rewrites, never touch packages/, signatures-first, trust-the-net-verify-with-eyes), skills `module-authoring` + `scene-composition` pointing at golden examples (`osc`, `feedback`, `pulse.scene`).
- `pnpm validate:m2` proves the loop end-to-end as a real MCP client: 4 tools listed, clean error with no engine, session/manifest reflect pulse, set_param round-trip 1.3 ms median + clamps + visibly steers pixels (bright extreme lum 146 vs dark 102), screenshot returns the real canvas, defaults restored.
- Kernel untouched: M1's Manifest/Param/uniformOf contract was already sufficient for live param writes — M2 is pure surface.
- Not yet proven: the human-witnessed magic-moment session (ink-blob prompt in a live Claude Code session) — needs a desktop run with `pnpm dev` + this branch's `.mcp.json`.

## 2026-06-10 18:00 — M2 magic moment witnessed; M3 started on branch `claude/loom-m3-stage-console`

- Zack ran the live session: agent produced `blobs` + `lava.scene` (contract-clean) and pulled the M5 catalog forward (`build-catalog.mjs` riding `pnpm typecheck`). M2 shipped-when criterion is fully met.
- Review caught: leaving `lava` live broke m1/m2 validators (they asserted pulse). Fixed first: validators pin pulse and restore the real scene; validation sidecars use an isolated WS port (`?ws=`/`LOOM_WS_PORT`) so a live Claude Code session can never collide with a validation run.
- M3 scope: Stage state machine (runtime, TDD), multi-instance engine + crossfade compositor, `/console.html` cockpit over BroadcastChannel, 4 new MCP tools with human-gated commit, `validate:m3`.

## 2026-06-10 18:25 — M3 SHIPPED: 24/24 e2e checks; stage/commit/PANIC loop proven

- `Stage` in `@loom/runtime` (11 unit tests): frame-boundary crossfades with mix in (0,1) exclusive, duration-0 hard cuts, PANIC cancels in-flight fades, `adoptLive` for boot only.
- Engine: `SessionStore` registry + per-instance 640×360 preview targets, `Compositor` (single/crossfade/hold; instances render exactly once per frame), eager-glob scenes barrel so HMR rebuilds only instances whose def identity changed, `EngineApi` as the single dispatch for bridge (agent) + Console channel (human).
- Console (`/console.html`, vanilla DOM): tile grid with ~6.6 fps JPEG thumbnails (async GPU readback), ✓/✗ chips, LIVE/STAGED badges, click-select/dblclick-solo, auto param panel (rAF-throttled writes), BPM/tap/RMS/fps status bar, big PANIC, stage strip with COMMIT + agent-commit arm toggle.
- MCP grows to 8 tools: create_instance/destroy_instance/stage/commit — commit refuses agents until armed (Console toggle or `?agentCommit=1`); destroying LIVE is refused for everyone; panic/resume/arm are human-only at dispatch.
- `pnpm validate:m3` (24/24): candidate created+staged via MCP, slider drag writes through, blocked agent commit leaves LIVE untouched, human COMMIT crossfades never-black (mid-fade lum 165) and promotes, PANIC holds pixels (rgb drift 0.00 over 500 ms) while frames tick 145→191, LIVE destroy refused, `?agentCommit=1` path commits end-to-end.
- Stumble worth knowing: the first console render bug was a self-destroying selector (badge class toggled away then queried) — tiles now use stable `*-badge` classes with a `show` modifier.
- Not yet proven manually: human auditioning in a real browser (drag sliders, watch the projector crossfade on a second display).

## 2026-06-10 19:00 — Console polish from first human drive

- Live tile preview was black: canvas thumbnails were read outside the render task (the documented preserveDrawingBuffer pitfall, resurfaced through a new path). Render loop now mirrors the canvas into a 2D canvas same-task; validate:m3 decodes the LIVE tile thumbnail at boot and after promotion.
- "LIVE live" confusion fixed: boot instance renamed to `boot`; `"live"` is now an alias resolved at dispatch to whatever the Stage routes to output (so default-instance commands always hit what the audience sees, even after commits). Stage strip shows `id · scene`.
- Console gained a scene picker (+ instance) so the human can spawn library scenes without the agent — closes the R4.5 gap. validate:m3 now 27/27.

## 2026-06-10 19:20 — Composable content library: pulseRings + glitch modules, scene-discovery watcher fix

- New scene `pulse-glitch` shipped live (slice tearing, kick-driven RGB split, scanlines over the pulse look), then refactored with the catalog in mind: `pulseRings` (source) and `glitch` (effect, RT-resampling pattern) extracted; `pulse` and `pulse-glitch` are now thin wiring of shared modules. Catalog: 9 modules, 4 scenes.
- `loom:watch-content` Vite plugin: brand-new `*.scene.ts` files now hot-register without touching the scenes barrel (content/ is outside the app root, so the watcher never saw file adds). Verified headless.
- Skills updated (module-authoring, scene-composition): scenes-are-wiring policy, module-composing-modules, the RT-resampling effect pattern, `new Signal` combinator idiom, scene-discovery fallback. Verified by a fresh-agent planning probe (proposed a reusable `kaleido` module unprompted under time pressure).
- Gates: typecheck, 75 unit tests, validate:m0 10/10, m1 19/19, m2 14/14, m3 27/27 — all green post-refactor.
- Ops note: the Output window stopped painting mid-session (rAF throttled while occluded/minimized — frame counter froze, bridge stayed responsive). Content exonerated on both backends; window needs to be visible to resume.
