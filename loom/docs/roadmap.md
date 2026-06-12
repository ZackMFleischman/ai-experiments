# LOOM roadmap

What's shipped, what's next. Supersedes `docs/history/implementation-plan-v1.md`
(the original M0–M9 plan, kept verbatim for the record); requirements live in
`docs/requirements-v1.md`. Rough size: S ≈ a weekend, M ≈ 2–3 weekends, L ≈ a
focused month of evenings.

## Standing stack decisions

- TypeScript everywhere, pnpm monorepo, Vite (dev server + HMR is the deploy
  mechanism); zod for metadata validation; `tsc --noEmit` as the contract gate.
- Three.js `WebGPURenderer` + TSL (WebGL2 fallback in headless validation); the
  TexNode layer compiles to fullscreen passes on top of it.
- Plain Chrome windows + a Node sidecar (WS bridge + MCP over stdio). No Electron
  in v1 — NDI is the first thing that would force a native shell, and it's out of
  scope.
- One `"globals"` pseudo-instance serves all global state (rack tunings, palettes)
  through the existing `get_manifest`/`set_param` path.
- Tuned state persists via the `loom:state` Vite middleware to `content/state/`
  (plain JSON in git).

## Shipped

| Milestone | Goal | Acceptance |
|---|---|---|
| M0 Pixels (2026-06-09) | edit→hot-render loop, never-go-black layer 1 | `validate:m0` |
| M1 Signals (2026-06-09) | pull-based kernel, InputBus, first 6 modules, NFR-2 | `validate:m1` |
| M2 Agent eyes & hands (2026-06-10) | sidecar + MCP tools, the magic-moment loop | `validate:m2` |
| M3 Stage & Console (2026-06-10) | multi-instance, human-gated commit, PANIC, cockpit | `validate:m3` |
| M4 Clean stage (2026-06-10) | pure Output, cover scaling, `set_audio`, staging UX | `validate:m4` |
| M5 Input rack (2026-06-10) | named channels, globals manifest, persistence, MIDI-learn | `validate:m5` |
| Param modulators (2026-06-10) | runtime LFO/follower attach on any param | `validate:modulators` |
| Console React+MUI rebuild (2026-06-11) | cockpit pages on React 19 + MUI 7, EngineLink | all validators |
| M6 Color & palettes — palette half (2026-06-11) | color param type, global palettes, `ctx.palette`, source switch with no rebuild | `validate:m6` |
| Console UI redesign (2026-06-11) | cohesive dense cockpit: brand, tap-BPM, "+" tile w/ live previews, drag-reorder, drop-to-commit, agent commit armed by default, resizable drawer, swatch palettes | `validate:m3`/`m4` (updated) |

Details: `DECISIONS.md` (rationale), `docs/history/agent-updates-m0-m6.md`
(build diary), git history.

## Remaining

### Housekeeping (S) — small items, can land alongside anything

In order (the scene cull comes first — the group pass shouldn't touch scenes
about to die):

1. **Scene cull:** delete `hello`, `pulse-glitch`, and `vinyl` (keep `pulse`
   — every validator pins it as its live scene, so it stays as the test
   workhorse — and `vinyl-zoom`). Dependencies to unwind: m3 asserts `hello`
   appears in `availableScenes`; the module-authoring/scene-composition
   skills cite `pulse-glitch` as the `pulseRings` extraction example — sweep
   docs/skills mentions of the dead scenes (`CATALOG.md` regenerates itself).
2. **Param-group pass:** go through each surviving scene and rename params to
   dotted prefixes where grouping helps — the Console already renders
   `a.b` paths as collapsible accordions (`ParamPanel.tsx`); this is purely a
   content/ naming refactor.
3. **Modulator default = 20 s:** the Console mod popover seeds new modulators
   at 4 beats (`ModPopover.tsx` — rate `"4"`, unit `"beats"`, plus the `|| 4`
   fallback); change the default to 20 **seconds**. Runtime needs no change
   (it requires an explicit period).
4. **Bigger thumbnails:** instance tiles render their preview at 2× the
   current size.

(Instance rename shipped 2026-06-11: double-click the tile name; human-only
`rename_instance` command keeps session/stage/selection coherent. `boot` is
exempt — it's bound to `live.scene.ts` hot-swaps.)

### Stdlib tests & robustness (M) — unnumbered, can land incrementally

Today `pnpm test` covers `runtime` and `sidecar` only; `content/modules/` ships
with zero tests and is about to grow to ~20 modules (M11). Before that growth:

- **A vitest root for `content/`** with a mock `BuildCtx` (params, `uniformOf`,
  inputs, palette) so modules build headlessly without `three/webgpu` needing a
  GPU.
- **Per-module unit tests**, three tiers each: (1) metadata/contract — zod
  metadata parses, declared params appear in the manifest with honest ranges,
  effects return `[...input.passes, ownPass]`; (2) robustness — a param-extremes
  sweep (min/max/default of every param, zero-size input) builds without throwing
  or producing NaN in CPU-side signals; (3) smoke render — build each module in a
  headless sandbox via the existing Playwright harness and assert non-black
  pixels + no console errors.
- **Golden patterns enforced**: audio-reactive modules consume named
  `ctx.input(...)` channels (no local re-detection); sources normalize to vec4
  once; stateful effects own pass ordering. Tests encode the conventions the
  skills currently only describe.
- New modules merge with their tier-1/2 tests from day one (cross-cutting rule);
  the smoke-render harness rides the validator infrastructure, not a new one.

**Shipped when:** every existing stdlib module has tier-1/2 coverage and the
smoke-render sweep runs green in CI alongside `pnpm test`; a deliberately broken
module (NaN param range, missing pass) is caught by tests, not by eyes.

### M6 — chains half (M)

Per-instance post-effect chains: `chain: ChainStep[]` (`{ id, effect, params }`,
stable step ids) as data on the session entry, folded after the scene build
(`tex = effect(ctx, { input: tex, … })` per step — effects already own pass
ordering). **Chain edit = rebuild via NFR-5** — a throwing step rejects the rebuild
and the previous pixels keep running. Effects declare chain knobs via optional
`meta.chainParams`; step params live at `fx.<stepId>.<param>` (stable across
reorder), values stored in the chain data and re-applied after every rebuild. One
new command + MCP tool: `set_chain { instance, steps }` (full-list semantics —
attach/detach/reorder in one idempotent verb). Humans may edit the LIVE chain
directly; **agents need the arming gate to touch the LIVE chain** (non-live is
ungated). Console: collapsible FX-chain section in the param panel — step cards
with drag-reorder, "+ effect" fed by an effects barrel, per-step widgets grouped by
prefix. Output types formalized: `ModuleOutput = TexNode | Signal | Events` and a
`ChainableEffect` alias; retrofit `glitch`/`feedback`/`levels` with `chainParams`.

**Shipped when:** the chain half of `validate:m6` — `set_chain` appending glitch
makes `fx.glitch-1.*` appear in the manifest and visibly changes the preview; a
throwing chain step leaves the instance running on previous pixels; reorder
preserves knob positions. m0–m5 green.

### M7 — Geo (M) *(first half of the old Geo-&-particles L; moved ahead of the library)*

**Goal:** the 3D path opens. Meshes are first-class material.

- `Geo` type — `GeoNode` joins `ModuleOutput`; `gltf` + primitive loaders; `render(world, cam)` bridge module (scene-in-scene render target → TexNode); `orbitCam` control module.
- Harness additions for single-module sandboxes: `orbit-cam`, `chain:<scene>@<node>` (mount in situ).
- Stdlib Geo entries cataloged; *module-authoring* skill extended for Geo kind.

**Shipped when:** a gltf model loads into a sandbox tile, orbits under `orbitCam`, renders through the bridge into the TexNode chain, and commits through a post chain — all without touching the never-go-black layers. (`validate:m7`)

### M8 — Particles (M) *(second half of the old Geo-&-particles L; depends on M7’s `GeoNode`)*

**Goal:** your flagship prompt works.

- `particleEmitter`: mesh-surface sampling (off M7 geometry), GPU-instanced pool via TSL compute, `rate`/`lifetime`/`turbulence` as Signals/Params; pool state under the rebuild-on-change policy.

**Shipped when:** *“create a particle generator that spits out particles from the surface of a 3D skull, hats driving turbulence”* → agent builds it in a sandbox tile, you tweak on MIDI, and commit it through a `feedback`+`paletteMap` post chain — via M6’s real `set_chain` mechanism instead of hand-wiring. (`validate:m8`)

### M9 — Video sources (S)

**Goal:** video clips are usable exactly the way images are.

- `video` source module mirroring `sources/image.ts`: file path in, `HTMLVideoElement` → texture out as a TexNode, with `loop`/`speed`/`scrub` (and mute-by-default audio) as params.
- Accepted everywhere an image is: same cover/fit scaling, same param surface, same catalog entry shape — a scene swaps `image` for `video` and nothing else changes.

**Shipped when:** a scene plays a looping clip as its source, `set_param` scrubs/retimes it live, and the M4 cover-scaling checks pass against a video source. (`validate:m9`)

### M10 — Asset explorer (M)

**Goal:** everything you can reach for is visible in one pane.

- Left-hand explorer pane in the Console: all modules grouped by kind — control / sources / effects, TouchDesigner-style bins — fed from the generated catalog, so it’s always current.
- **External asset folders:** register additional directories (e.g. a `VJ Assets` folder) that appear alongside the module bins, listing images, videos, 3D models — anything a scene can consume. Registered folders persist in `content/state/`; listings served through the existing Vite/sidecar middleware.
- Selection/drag is the interaction model: anything in the explorer can be selected or dragged onto a tile/param wherever the engine can accept it (image/video paths into source params; scenes into the picker; models once M7 lands).

**Shipped when:** the explorer shows every cataloged module by kind plus a registered external folder; dragging a video from that folder onto a source param plays it live; the folder registration survives restart. (`validate:m10`)

### M11 — Library & parallel build (M) *(old M5 + old-M4’s panels/save-as)*

**Goal:** the agent composes from vocabulary; subagents build in parallel; the library grows itself.

- Stdlib buildout to ~20 modules (full Control/Source/Effect list from Requirements §6 — Geo/particle entries already cataloged by M7/M8) — every effect `chainParams`-compliant, every audio-reactive module consuming named `ctx.input(...)` channels. The library is born compatible with the rack and chains.
- `CATALOG.md` extended (chainable / inputs-consumed columns) — the AST generator already rides `pnpm typecheck`; this supersedes the old “catalog.json” line. *Library-use* skill: search catalog first, register after writing, tag conventions.
- Fixtures: record/replay InputBus traces **including input-channel values**; `create_instance({inputs: "fixture:…"})`; `screenshot({frames:[…]})` deterministic against fixtures.
- Parallel workflow proven: signatures-first convention + `tsc` gate; subagents each get a sandbox instance (own tile) with fixture input.
- Panel files (R3.5): declarative `{paramPath → widget, midi}` subsets; Console renders open panels; opening activates bindings; *panel-authoring* skill. “Save as” flows (R3.4): persist tuned scene; factor selection into a custom module. Both land here because they compose the params + bindings M5 defined, and the library is what makes saving worth it.

**Shipped when:** “build me three new scenes in parallel — glitchy, organic, geometric — using the library” lights up three tiles that converge concurrently; a brand-new custom module written today is found and reused by the agent tomorrow via the catalog; the R3.5 panel prompt produces a working bound panel; “save it as bass-tunnel” round-trips through restart. (`validate:m11`)

### M12 — Gig hardening (M) *(old M7)*

**Goal:** trust it in a dark room.

- Session snapshot/restore (crash recovery of transport, slots, open panels, values — **and globals tunings, palettes, chains, bindings**).
- Perf budget: frame-time HUD per instance; `screenshot` metadata includes fps so agents self-police; document a perf-check step in the commit skill.
- 90-minute soak test on fixtures (memory/VRAM stability, HMR churn, **rack-tuning and chain-edit churn**).
- A starter set: 8–10 tagged, tuned scenes in the repo **using palettes, chains, and named input channels**; a one-page performer cheatsheet; the §9 magic test executed clean, timed, from fresh clone.

**Shipped when:** you play a real (or fully simulated) 60+ minute set: agent staging looks between tracks, you committing and riding knobs, zero output interruptions. **This is v1.**

-----

## Cross-cutting rules

- Every milestone merges with: typecheck green, the previous milestones’ demos still passing (keep them as scripted checks where possible), and CLAUDE.md/skills updated to match reality — stale conventions poison every future agent session.
- `runtime/` changes get human review; `content/` is agent territory.
- Log non-obvious decisions and ≤6-line SHIPPED entries in `DECISIONS.md`; grep it when touching an unfamiliar subsystem.

## Risks & mitigations

|Risk                                              |Mitigation                                                                                                                                    |
|--------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|
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
1. PANIC safe-scene mode (`feature-requests/panic-scene.md`)
1. Console screenshot for agents (`feature-requests/console-screenshot.md`)
