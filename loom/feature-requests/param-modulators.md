# Feature request: param modulators (attachable LFOs and friends)

Status: implemented 2026-06-10 (branch `worktree-param-modulators`; acceptance: `pnpm validate:modulators`) · Requested: 2026-06-10

## Summary

Today a param is a static knob: the human drags a slider (Console) or the agent calls
`set_param`, and the value stays put until somebody touches it again. This feature makes any
param **modulatable**: attach a *modulator* — an LFO, ramp, random walk, stepper — to a single
param of a single instance, and the engine animates that param continuously between a chosen
minimum and maximum over a chosen period. Sliders come alive: "bounce `trail` between 0.7 and
0.92 on a sine every 8 beats" becomes a two-click gesture instead of riding the fader by hand.

This is distinct from the existing `lfo` *control module*: modules wire modulation at **build
time, in code**, and changing them means editing the scene. Modulators attach at **run time,
per instance, with zero code changes**, from the Console or MCP — the live-performance layer on
top of the same math.

## Motivation

- Humans have two hands; a scene has six knobs. Modulators let a performer set-and-forget
  motion on several params and keep their hands for the ones that matter right now.
- Agents iterate on *feel* via `set_param` today, but "make it breathe" currently requires a
  code edit (bake an LFO into the scene). With modulators the agent can audition motion
  non-destructively and only graduate it into scene code once it's part of the identity.
- It deepens the instrument without touching scene contracts: params remain the only write
  surface, modulators are just another writer.

## Concepts

- **Modulator** — a small config object `{ type, rate, range, ...typeOpts }` attached to one
  `(instanceId, paramPath)` pair. At most one modulator per param (v1).
- **Carrier wave** — every numeric modulator computes a normalized `w(t) ∈ [0, 1]` each frame;
  the engine maps it into the target sub-range and writes through the existing
  `Manifest.get(path).set(value)` path (so clamping, int-rounding, and uniform liveness all
  come for free).
- **Range** — `[lo, hi]` chosen by the user *within* the param's declared `[min, max]`
  (defaults to the full range). The param's declared range stays the source of truth; a
  modulator can never escape it.
- **Rate** — either `periodSeconds` or `periodBeats` (beat-synced via TimeBus, so tap-tempo
  retunes every synced modulator at once). Plus `phase` (0..1 offset) so two modulators can be
  staggered.

## Modulator catalog

Applicability by param type. `enum` does not exist yet (`ParamType` is `float | int | bool`);
the column documents the intended behavior so the modulator vocabulary is ready when a
choice/radio param type lands.

| Modulator | Carrier | float | int | bool | enum (future) |
|---|---|---|---|---|---|
| **sine** | smooth bounce lo↔hi | ✓ | ✓ (rounded) | via threshold | — |
| **triangle** | linear back-and-forth at constant rate | ✓ | ✓ (rounded) | via threshold | — |
| **ramp** | rise lo→hi, snap back (saw; `direction: up\|down`) | ✓ | ✓ (rounded) | — | — |
| **square** | alternate lo/hi with `duty` (0..1) | ✓ | ✓ | ✓ (true/false per half) | alternate two choices |
| **random** | sample-and-hold: new uniform value in [lo,hi] each interval | ✓ | ✓ | ✓ (coin flip) | random choice each interval |
| **drift** | smoothed random walk (lagged S&H, `smooth` seconds) | ✓ | ✓ (rounded) | — | — |
| **cycle** | step through values in order, one step per interval (`order: forward\|reverse\|pingpong\|random`) | over an explicit value list | lo..hi stepwise | true/false toggle | **cycle all choices after a delay** (the radio-group case) |
| **audio** | follow a band/RMS: `band: bass\|mid\|treble\|rms` mapped lo..hi with `smooth` | ✓ | ✓ (rounded) | via threshold | — |

Notes:
- "via threshold" = the numeric carrier is compared against `threshold` (default 0.5) to
  produce the bool. Spec'd but **cut from v1 scope** to keep the matrix small; v1 ships bool
  support only for `square`, `random`, `cycle` (the natural toggles).
- `int` + `cycle` is the step-sequencer: `slices` stepping 4→8→16→32 on bar boundaries.
- `float` + `cycle` takes an explicit `values: number[]` list (not a quantized lo..hi) — it
  doubles as a chord/palette sequencer and stays honest about which values you'll land on.
- `audio` overlaps with what scenes do natively via `ctx.audio`; it earns its place because it
  needs no code edit and detaches cleanly. Same InputBus, same analyser — no new audio path.

## Requirements

### Functional

- **FR-1** A modulator can be attached to / detached from any param of any instance at run
  time, from both surfaces: Console (param panel UI) and MCP (agent tools). Attach replaces
  any existing modulator on that param (one per param).
- **FR-2** Modulated values write through `Manifest.get(path).set(value)` — clamped to the
  param's declared range, ints rounded, GPU uniforms stay live. No second write path.
- **FR-3** Modulator state is per **instance**, not per scene: two instances of `pulse` can
  carry different modulators on `trail`. State lives in the engine's `SessionStore` entry, not
  in the `Instance` (which is rebuilt on HMR).
- **FR-4** Modulators survive an HMR rebuild of their instance: after rebuild, each stored
  modulator re-attaches if its path still exists in the new manifest; orphans are dropped and
  reported in `get_session`.
- **FR-5** Rates support `periodSeconds` or `periodBeats` (mutually exclusive). Beat-synced
  modulators track TimeBus BPM changes (manual BPM / tap) immediately.
- **FR-6** Range `[lo, hi]` validates against the param spec (`min ≤ lo ≤ hi ≤ max`) at attach
  time with a clear error; defaults to the full declared range.
- **FR-7** While a param is modulated, direct writes (`set_param`, Console slider drag) are
  **rejected** with an error naming the modulator and the detach gesture. Owning is explicit;
  no silent tug-of-war between a slider and an LFO. (Relative/"depth around manual base" mode
  is future work, see §Out of scope.)
- **FR-8** `get_manifest` includes each param's active modulator config (or null);
  `get_session` includes a per-instance modulator summary. The Console renders a visible
  indicator on modulated params and animates the slider thumb with the live value (read-only).
- **FR-9** Modulator evaluation is contained: an evaluation error detaches the modulator,
  flags it in `get_session`, and never interrupts rendering (the param simply stays at its
  last value). Never-go-black extends to never-freeze-the-loop.
- **FR-10** PANIC pauses modulation (the held frame stays truly held); RESUME continues with
  phase advanced as if paused (no jump-catch-up burst). During a crossfade commit, modulators
  on *both* instances keep running.
- **FR-11** Modulator configs are plain serializable JSON (zod-validated at the protocol
  boundary) so they can ride the existing WS/BroadcastChannel envelopes unchanged.

### Non-functional

- **NFR-1** Per-frame cost is one closure call + one `set` per active modulator; tens of
  active modulators must not move the frame budget (no allocation in the per-frame path).
- **NFR-2** Modulator math lives in `@loom/runtime` (pure, fake-clock unit-testable, reusing
  `lfoSignal`/`lagSignal` where shapes overlap); the engine app only schedules and stores.
  Runtime changes get human review per repo policy.
- **NFR-3** Adding a new modulator type is one file + one zod variant + one row in the
  Console's type picker — no protocol redesign.

## Surfaces

### Console

- Each param row gains a small **∿ button**. Click → popover: type picker, rate (seconds ⇄
  beats toggle), range mini-slider (two-thumb, bounded by the param's range), per-type extras
  (duty, smooth, order, band), and Detach.
- Active modulator: row shows a tinted ∿ badge, the slider thumb animates with the live value
  and rejects drags (tooltip: "modulated — detach to take over").
- A small phase-reset affordance ("retrigger") on the badge restarts the wave at `lo` —
  useful to land a ramp on a drop.

### MCP (agent)

Two new tools, mirrored through the same `EngineApi` dispatch as everything else:

- `modulate_param { instance?, path, modulator: { type, periodSeconds|periodBeats, phase?, lo?, hi?, ...typeOpts } }`
  → attaches/replaces; returns the validated config.
- `clear_modulation { instance?, path }` → detaches; no-op success if none.

Both are **agent-allowed without arming, including on the LIVE instance** — they're
clamped, reversible, and the same trust tier as `set_param`, which is already allowed on
live. Arming stays reserved for `commit` (replacing what the audience sees wholesale).

## Implementation plan

Phased so every step lands green on `pnpm typecheck` + unit tests + `validate:m0..m3`.

### Phase 1 — runtime: the modulator kernel (`packages/runtime`, human-reviewed)

1. `src/modulator.ts`: `ModulatorSpec` (zod discriminated union over `type`),
   `createModulator(spec, paramMeta) → (f: FrameCtx, bus: { beats: Signal<number>, audio?: AudioBusLike }) => number | boolean`.
   Pure functions; carrier shapes reuse `lfoSignal` math (sine/triangle/square already exist
   there in spirit; ramp/random/drift/cycle are new, all ~10 lines each).
   `random`/`drift`/`cycle` keep their state in the closure — same pattern as `lagSignal`.
2. Validation helpers: range-vs-spec check, period exclusivity, per-type opt schemas.
3. Unit tests with the fake clock: shape correctness at known phases, beat-sync follows a BPM
   change, S&H holds between intervals, cycle order modes, pause/resume phase math (FR-10),
   bool/int coercions, eval-throw containment contract.

### Phase 2 — engine: storage + scheduling (`packages/engine-app`)

1. `SessionStore` entry gains `modulators: Map<paramPath, ModulatorRuntime>` (spec + compiled
   fn + paused-phase bookkeeping). Survives instance rebuild; re-validate paths against the
   new manifest after `rebuild` (FR-4).
2. Render loop (before `compositor.render`): for each non-held instance, evaluate each
   modulator and `Manifest.get(path).set(value)` inside a try/catch that detaches + records
   the error (FR-9). Directive `hold` skips evaluation and accumulates paused time (FR-10).
3. `EngineApi`: `modulate_param` / `clear_modulation` handlers (source-tagged like the rest);
   `set_param` gains the modulated-param rejection (FR-7); `get_manifest`/`get_session`
   responses extended (FR-8).
4. `window.__loom` gains per-instance modulator state for validation scripts.

### Phase 3 — protocol + sidecar (`packages/sidecar`)

1. `protocol.ts`: request/response envelopes for the two new commands + extended session and
   manifest payload types (browser-safe, shared both directions as today).
2. MCP server: the two tools with JSON-Schema definitions (low-level `Server` API, matching
   the existing 8), wired through the WS bridge. Unit tests beside the existing tool tests.

### Phase 4 — Console UI (`packages/engine-app`, console page)

1. Param row ∿ button + popover (vanilla DOM like the rest of the Console), two-thumb range
   input, type-specific fields driven by one declarative descriptor per type (NFR-3).
2. Animated read-only thumb for modulated params (the param panel already rAF-polls values
   for agent writes — reuse that path); badge + retrigger.

### Phase 5 — acceptance (`scripts/validate-m4.mjs` or extend m3)

- Attach a sine to `pulse.punch` via MCP → screenshot luminance oscillates with the period.
- `set_param` on the modulated path errors; after `clear_modulation` it succeeds.
- HMR-rebuild the instance → modulator still attached (FR-4); rename the param in a scratch
  scene → orphan reported.
- PANIC freezes the modulated value; RESUME continues without a jump (FR-10).
- BPM change retunes a `periodBeats` modulator (FR-5).
- Eval-throw containment: a deliberately broken spec detaches and the loop keeps ticking.

Estimated size: runtime ~200 lines + tests; engine ~150; protocol/sidecar ~120; console ~200.

## Edge cases & interactions

- **Commit/crossfade**: both legs tick normally (FR-10); nothing special — modulators write
  CPU-side before either leg renders.
- **`live` alias**: `modulate_param { instance: "live" }` resolves at dispatch like every
  other command; the modulator sticks to the resolved instance id (it does not follow the
  live pointer after a commit).
- **destroy_instance**: modulators die with the instance (they live in the SessionStore entry).
- **Validators**: m1/m2 assert specific param values on `pulse`; they must `clear_modulation`
  defensively or (simpler) rely on fresh instances having none — fresh instances never have
  modulators, so no change needed.
- **Two writers, one param**: prevented by design (FR-7 + one-modulator-per-param). The known
  trap this avoids: a slider drag fighting a 60 Hz writer looks like a broken slider.
- **`int` rounding cadence**: a slow sine on an int param produces visible steps — correct,
  documented, and exactly what `cycle` formalizes.

## Out of scope (this request) — future candidates

- **Relative/depth mode** (modulate ±depth around the manually set base value, manual writes
  move the base live) — strictly additive; needs FR-7 loosened per-mode.
- **Enum/choice param type** itself (the `cycle`/`random` enum column activates when it lands).
- **Modulating modulators** (rate-of-rate), modulator presets/banks, cross-param linking
  (macro knobs), MIDI/OSC input as a modulator source.
- **Recording/automation lanes** (timeline playback of param gestures).
- Persisting modulators across engine restarts (session save/restore is its own feature).

## Resolved decisions

1. **No arming for `modulate_param`, even on LIVE** — clamped + reversible puts it in
   `set_param`'s trust tier; arming stays unique to `commit`.
2. **`cycle` on floats uses an explicit `values: number[]` list** — doubles as a
   chord/palette sequencer; quantized lo..hi adds nothing a value list can't express.
3. **Per-param control only in v1** — no global modulator transport; a master mute is cheap
   to add later if performing demands it.
