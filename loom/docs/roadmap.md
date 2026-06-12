# LOOM roadmap

What's shipped, what's next. Supersedes `docs/history/implementation-plan-v1.md`
(the original M0–M9 plan, kept verbatim for the record); requirements live in
`docs/requirements-v1.md`. Rough size: S ≈ a weekend, M ≈ 2–3 weekends, L ≈ a
focused month of evenings.

## Standing stack decisions

- TypeScript everywhere, pnpm monorepo, Vite (dev server + HMR is the deploy
  mechanism); zod for metadata validation; `tsc --noEmit` as the contract gate.
  (A static `vite build` also exists for the per-PR Cloudflare Pages preview —
  "view + tweak", not the live runtime; see `docs/ci-and-preview.md`.)
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
| M6 Chains half (2026-06-12) | per-instance FX chains (`set_chain`/`save_chain`), wet/dry mix as a bindable param, insert/reorder, scene-default + restore, saved-chain composites | `validate:m6` (chain checks) |

Details: `DECISIONS.md` (rationale), `docs/history/agent-updates-m0-m6.md`
(build diary), git history.

## Remaining

### M6 chains half — SHIPPED 2026-06-12

Shipped (see the table above and `DECISIONS.md`), with scope pulled forward beyond
the original sketch: per-instance chains (`chain: ChainStep[]` on the session entry,
folded inside `buildInstance` via `ChainHost`); **enable/disable is a wet/dry
`fx.<id>.mix` float param, not a structural field** (bypass with no rebuild,
MIDI-bindable, ride on a fader); insert-anywhere + drag-reorder; `set_chain`
(full-list/idempotent, arming-gated on the LIVE chain) and `save_chain` (saved-chain
**composites** under `content/modules/effects/chains/`, one level deep); scenes may
declare a default `chain` and `restoreDefault` resets to it. Output types formalized
(`ModuleOutput`, `ChainableEffect`); `glitch`/`feedback`/`levels` carry `chainParams`.
M7 inherits the now-shipped "save as" mechanism for *scenes*; full chain
snapshot/restore across reload stays M9.

### M7 — Library & parallel build (M) *(old M5 + old-M4’s panels/save-as)*

**Goal:** the agent composes from vocabulary; subagents build in parallel; the library grows itself.

- Stdlib buildout to ~20 modules (full Control/Source/Effect list from Requirements §6, minus Geo) — every effect `chainParams`-compliant, every audio-reactive module consuming named `ctx.input(...)` channels. The library is born compatible with the rack and chains.
- `CATALOG.md` extended (chainable / inputs-consumed columns) — the AST generator already rides `pnpm typecheck`; this supersedes the old “catalog.json” line. *Library-use* skill: search catalog first, register after writing, tag conventions.
- Fixtures: record/replay InputBus traces **including input-channel values**; `create_instance({inputs: "fixture:…"})`; `screenshot({frames:[…]})` deterministic against fixtures.
- Parallel workflow proven: signatures-first convention + `tsc` gate; subagents each get a sandbox instance (own tile) with fixture input.
- Panel files (R3.5): declarative `{paramPath → widget, midi}` subsets; Console renders open panels; opening activates bindings; *panel-authoring* skill. “Save as” flows (R3.4): persist tuned scene; factor selection into a custom module. Both land here because they compose the params + bindings M5 defined, and the library is what makes saving worth it.

**Shipped when:** “build me three new scenes in parallel — glitchy, organic, geometric — using the library” lights up three tiles that converge concurrently; a brand-new custom module written today is found and reused by the agent tomorrow via the catalog; the R3.5 panel prompt produces a working bound panel; “save it as bass-tunnel” round-trips through restart. (`validate:m7`)

### M8 — Depth: Geo & particles (L) *(old M6, scope unchanged)*

**Goal:** the 3D path. Your flagship prompt works.

- `Geo` type — `GeoNode` joins `ModuleOutput`; `gltf` + primitive loaders; `render(world, cam)` bridge module (scene-in-scene render target → TexNode); `orbitCam` control module.
- `particleEmitter`: mesh-surface sampling, GPU-instanced pool via TSL compute, `rate`/`lifetime`/`turbulence` as Signals/Params; pool state under the rebuild-on-change policy.
- Harness additions for single-module sandboxes: `orbit-cam`, `chain:<scene>@<node>` (mount in situ).
- Stdlib Geo entries cataloged; *module-authoring* skill extended for Geo kind.

**Shipped when:** *“create a particle generator that spits out particles from the surface of a 3D skull, hats driving turbulence”* → agent builds it in a sandbox tile, you tweak on MIDI, and commit it through a `feedback`+`paletteMap` post chain — now via M6’s real `set_chain` mechanism instead of hand-wiring. (`validate:m8`)

### M9 — Gig hardening (M) *(old M7)*

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
