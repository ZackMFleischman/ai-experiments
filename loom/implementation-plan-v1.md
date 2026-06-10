# LOOM — Implementation Plan v1.0

Companion to *Requirements v1.0*. Eight milestones, M0–M7. **Every milestone ends with a runnable instrument that is strictly more useful than the last** — no milestone is pure plumbing. Rough size: S ≈ a weekend, M ≈ 2–3 weekends, L ≈ a focused month of evenings.

## Stack decisions (made now, cheap to revisit)

- **Language/build:** TypeScript everywhere, pnpm monorepo, Vite (dev server + HMR is the deploy mechanism).
- **Render:** Three.js `WebGPURenderer` + TSL for GPU material/compute; the TexNode layer compiles to fullscreen passes/render targets on top of it. (One renderer for both 2D-effect land and later 3D land.)
- **Validation:** zod for module/scene/panel metadata; `tsc --noEmit` in watch mode as the contract gate.
- **Shell:** plain Chrome window(s) + a Node **sidecar** process (WebSocket bridge + MCP server, stdio to Claude Code). No Electron in v1 — WebMIDI, getUserMedia audio, and fullscreen-on-display all work in the browser; NDI is the first thing that would force a native shell, and it’s out of scope.
- **Repo layout:**

```
loom/
  packages/
    runtime/        # kernel: Signal, Events, Param, Module, Scene, TexNode, Stage, InputBus
    engine-app/     # Console + Output windows (Vite app)
    sidecar/        # WS bridge + MCP server
  content/
    modules/{control,sources,effects,geo,custom}/
    scenes/   panels/   fixtures/
    state/{values,bindings}/
    catalog.json    # generated
  .claude/          # CLAUDE.md + skills
```

-----

## M0 — Pixels (S)

**Goal:** the editing loop exists. A scene file hot-renders in a window.

- Scaffold monorepo; Vite app with a fullscreen-canvas Output window; WebGPURenderer up; fps meter.
- One hardcoded `defineScene` rendering a TSL fullscreen shader; `import.meta.hot` wiring so saving the scene file swaps it in-place.
- HMR rejection on throw/compile-fail → keep previous module (first brick of never-go-black).

**Shipped when:** you edit `scenes/hello.scene.ts` in any editor and the window updates in <2 s; a syntax error changes nothing on screen. *(Note: Claude Code can already drive this — “make it pink and faster” works on day one, blind.)*

## M1 — Signals (M)

**Goal:** the type kernel + the world flows in. Visuals react to music.

- `runtime`: `Signal<T>` (memoized pull, per-frame eval), `Events<T>` (onset/beat streams + gate/latch/divide/frame-quantize), `Param<T>` + manifest collection, `defineModule`/`defineScene` with zod-validated metadata, instance lifecycle (build/dispose; rebuild-on-code-change policy per NFR-5).
- `InputBus` v1: `audio` (getUserMedia device picker → AnalyserNode FFT, named bands, RMS, threshold onsets; BPM = manual tap/set for now), `time` (now, dt, beatPhase, beatEvery from set BPM).
- TexNode graph: source/effect composition compiling to ping-ponged fullscreen passes; first 6 modules to prove each contract kind: `osc`, `noise`, `lag`, `lfo`, `feedback` (stateful), `levels`.
- Per-instance error containment (NFR-2).

**Shipped when:** a kick-reactive feedback scene runs off live music; killing the file mid-edit never blanks the canvas; `pnpm typecheck` gates everything.

## M2 — Agent eyes & hands (M) ← *the magic-moment milestone*

**Goal:** the full prompt→see→self-correct→tune loop, no human code.

- Sidecar: WebSocket protocol to Engine (typed messages); session store in Engine (transport, instances, manifests).
- MCP server (stdio for Claude Code): `get_session`, `get_manifest`, `set_param`, `screenshot` (engine captures canvas → PNG over WS).
- `.claude/CLAUDE.md` (architecture map, rules: params-before-rewrites, never touch `runtime/`, signatures-first) + skills: *module-authoring*, *scene-composition*.
- Latency pass: `set_param` end-to-end <100 ms.

**Shipped when:** in one Claude Code session: “make a slow-breathing ink blob that pulses on the kick, mostly monochrome” → agent writes scene + any modules, screenshots, fixes its own mistakes, tunes params — and you watched every iteration render live.

## M3 — Stage & Console (M)

**Goal:** multiple instances, safe commits, a real cockpit.

- Stage: named slots, LIVE routing, staged candidates, frame-boundary crossfade COMMIT, PANIC (hold-frame / safe scene).
- Console window: pane grid (auto tile per instance, ✓/✗ HMR chips, click-select, double-click solo), status bar (transport/BPM/audio meter/MIDI placeholder/fps/PANIC), stage strip (live · staged · COMMIT).
- Param panel: auto-generated from selected manifest — sliders/steppers/toggles/swatches, fully mouse-operable; writes through the same path as `set_param`.
- MCP additions: `create_instance` (scene or single module + harness: fullscreen-quad | orbit-cam-later, inputs: live), `destroy_instance`, `stage`, `commit`. Output window = display-picker + fullscreen.

**Shipped when:** agent stages a candidate; you audition it in a tile, drag its sliders, hit COMMIT; the projector crossfades; PANIC works; nothing the agent does can touch LIVE without you.

## M4 — Hands on hardware (M)

**Goal:** MIDI, bindings, panels, saving. The instrument becomes playable.

- WebMIDI in the InputBus (`cc`, `notes`, `pads` as Signals/Events); device status in the status bar.
- MIDI-learn in the param panel; bindings persist to `state/bindings/`; tuned values save to `state/values/` and reapply on instance build.
- “Save as” flows (agent-mediated): persist tuned scene; factor selection into a custom module.
- Panel files: declarative `{paramPath → widget, midi}` subsets; Console renders open panels; opening activates bindings. *Panel-authoring* skill.

**Shipped when:** the exact prompt — *“give me a UI panel for erraticness, color palette, sliders for tessellation count and bass-kick strength, and when it’s open, map it to my MIDI controller”* — produces a working bound panel; knobs feel instant; “save it as bass-tunnel” round-trips through restart.

## M5 — Library & parallel build (M)

**Goal:** the agent composes from vocabulary; subagents build in parallel; the library grows itself.

- Stdlib buildout to ~20 modules (full Control/Source/Effect list from Requirements §6, minus Geo).
- `catalog.json` generator (script + on-save watcher) from module metadata; *library-use* skill: search catalog first, register after writing, tag conventions.
- Fixtures: record/replay InputBus traces; `create_instance({inputs: "fixture:…"})`; `screenshot({frames:[…]})` deterministic against fixtures.
- Parallel workflow proven: signatures-first convention + `tsc` gate; subagents each get a sandbox instance (own tile) with fixture input.

**Shipped when:** “build me three new scenes in parallel — glitchy, organic, geometric — using the library” lights up three tiles that converge concurrently; a brand-new custom module written today is found and reused by the agent tomorrow via the catalog.

## M6 — Depth: Geo & particles (L)

**Goal:** the 3D path. Your flagship prompt works.

- `Geo` type; `gltf` + primitive loaders; `render(world, cam)` bridge module (scene-in-scene render target → TexNode); `orbitCam` control module.
- `particleEmitter`: mesh-surface sampling, GPU-instanced pool via TSL compute, `rate`/`lifetime`/`turbulence` as Signals/Params; pool state under the rebuild-on-change policy.
- Harness additions for single-module sandboxes: `orbit-cam`, `chain:<scene>@<node>` (mount in situ).
- Stdlib Geo entries cataloged; *module-authoring* skill extended for Geo kind.

**Shipped when:** *“create a particle generator that spits out particles from the surface of a 3D skull, hats driving turbulence”* → agent builds it in a sandbox tile, you tweak on MIDI, commit it through a `feedback`+`paletteMap` post chain.

## M7 — Gig hardening (M)

**Goal:** trust it in a dark room.

- Session snapshot/restore (crash recovery of transport, slots, open panels, values).
- Perf budget: frame-time HUD per instance; `screenshot` metadata includes fps so agents self-police; document a perf-check step in the commit skill.
- 90-minute soak test on fixtures (memory/VRAM stability, HMR churn).
- A starter set: 8–10 tagged, tuned scenes in the repo; a one-page performer cheatsheet; the §9 magic test executed clean, timed, from fresh clone.

**Shipped when:** you play a real (or fully simulated) 60+ minute set: agent staging looks between tracks, you committing and riding knobs, zero output interruptions. **This is v1.**

-----

## Cross-cutting rules

- Every milestone merges with: typecheck green, the previous milestones’ demos still passing (keep them as scripted checks where possible), and CLAUDE.md/skills updated to match reality — stale conventions poison every future agent session.
- `runtime/` changes get human review; `content/` is agent territory.
- Keep a `DECISIONS.md` log; future-you and future-agents both read it.

## Risks & mitigations

|Risk                                              |Mitigation                                                                                                                                    |
|--------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|
|WebGPU/TSL instability or driver pain             |Pin Three.js version per milestone; smoke-test scene in CI; WebGL2 fallback is a last-resort fork of the TexNode compiler, not a day-one cost.|
|HMR semantics fight the instance model            |NFR-5 rebuild-on-change keeps it trivial; revisit only after v1.                                                                              |
|Browser audio latency/quality (Analyser smoothing)|Acceptable for v1 reactivity; AudioWorklet onset/BPM is a contained M5+ upgrade inside InputBus.                                              |
|Agent writes sprawling untyped code               |zod-validated metadata + skills with golden examples + catalog-first rule; reject via tsc, not vibes.                                         |
|Scope creep (this conversation’s natural hazard)  |§8 out-of-scope list is load-bearing. New ideas go to `DECISIONS.md` as post-v1 candidates.                                                   |

## Post-v1 horizon (ordered candidates)

1. Embedded perform-mode chat pane (Claude Agent SDK client on the existing MCP/WS boundary)
1. NDI out (forces the Electron/native-shim decision)
1. AudioWorklet beat tracking + look-ahead quantization
1. OSC in/out (GrandMA3 says hello)
1. Generative-video source module (Mirage-class / StreamDiffusion as a TexNode source)
1. Pop-out OS-window panes; multi-display layouts
1. Embeddings over the catalog when flat JSON stops scaling