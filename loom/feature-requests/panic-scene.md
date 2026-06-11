# Feature request: PANIC modes — hold the frame, or cut to a designated Panic Scene

Status: proposed (post-v1 candidate) · Requested: 2026-06-10 · Owner: unassigned

## Summary

PANIC today does one thing: hold the last presented frame (Stage skips all rendering, the
browser keeps showing what's there). That's the right reflex when the output is *good* and
something is about to ruin it. It's the wrong reflex when the output is already *bad* —
strobing garbage, a blown-out feedback loop, a frozen error frame — because holding preserves
exactly the pixels you're trying to escape.

This feature gives PANIC two modes:

- **HOLD** (current behavior, stays the default): freeze the last frame.
- **SAFE SCENE**: transition directly to a designated *Panic Scene* — a known-good,
  self-contained visual that lives warm in the engine so the escape hatch can never fail to
  open.

The human arms the mode in advance; the big red button itself stays a single click.

## Motivation

- A live performer needs an "eject to something presentable" gesture, not just "stop the
  bleeding." Holding a garbage frame in front of an audience is barely better than black.
- The safety story today covers *future* damage (compile/build/render containment) and
  *freezing* current damage (hold). Escaping to known-good pixels is the missing third leg.
- It composes with the existing recovery path: panic to the safe scene, calmly fix or rebuild
  the real scene in a sandbox tile, stage it, commit back.

## Concepts

- **Panic Scene** — the scene designated as the safe target. Designated the same way the boot
  scene is: a one-line re-export pointer, `content/scenes/panic.scene.ts` (mirrors
  `live.scene.ts`; same HMR semantics, same "don't delete it" rule).
- **Panic instance** — a dedicated, always-warm instance of the Panic Scene, built at engine
  boot and rebuilt through the normal HMR path. PANIC must never wait on (or risk) a build.
- **Armed mode** — `hold | scene`, a Console-side setting that decides what the PANIC button
  does. Executing PANIC is always one click; choosing behavior never happens mid-emergency.

## Requirements

### Functional

- **FR-1** PANIC executes the armed mode: `hold` freezes the last frame (exactly today's
  behavior, still the default); `scene` routes the panic instance to the output.
- **FR-2** Mode `scene` transitions with a **hard cut by default** (`fadeFrames: 0`). A
  configurable short fade is allowed, but the default assumes the current output is something
  you don't want on screen one frame longer than necessary — and don't want *blended* with
  the safe scene either. (Contrast with commit, where the 60-frame crossfade is the point.)
- **FR-3** The panic instance is **pre-built and warm**: built at boot alongside the boot
  instance, rebuilt on HMR when its scene's module identity changes, never disposed. PANIC
  never triggers a build.
- **FR-4** Scene-panic does **not move the LIVE pointer**. It is an output override in the
  Stage directive, not a commit: RESUME returns to whatever instance was live, with a hard
  cut (symmetry with FR-2). The audience-safety invariant "LIVE changes only via `commit()`"
  stays intact in one place.
- **FR-5** While scene-panicked, the previous live instance is not rendered (stateful passes
  pause, same as any non-rendered instance); the panic instance renders normally — it is
  alive, not a freeze-frame. The engine loop never stops.
- **FR-6** Pressing PANIC **while already panicked** re-executes the currently armed mode if
  it differs from the active one. The escalation path this enables: HOLD froze garbage →
  flip the arm to SAFE SCENE → press PANIC again → cut to safety. (Scene→hold re-press is a
  no-op; holding the safe scene is strictly worse than rendering it.)
- **FR-7** If the Panic Scene fails to build (boot or HMR), the engine **falls back to
  `hold`**: the armed-mode control shows a warning state naming the build error, and PANIC
  still works in hold mode. A broken safe scene must never make PANIC itself unsafe.
- **FR-8** If the panic instance throws at render time *during* a panic, NFR-2 containment
  applies as usual — the instance freezes its output, which degrades scene-panic into
  hold-panic. Worst case equals today's behavior, never worse.
- **FR-9** PANIC during an in-flight crossfade cancels the fade first (today's rule), then
  applies the armed mode.
- **FR-10** `panic`, `resume`, and arming the mode remain **human-only** (Console). Agents
  observe everything — `get_session` gains `panicMode` (armed), `panicActive` mode, and
  `panicScene` (name + build health) — but cannot trigger, clear, or re-arm it.
- **FR-11** The panic instance is protected from `destroy_instance` (like LIVE) and appears
  in the Console as a distinct pinned tile (badge: ⛑ or similar) so the human can see and
  pre-tune it (params work normally; it's an instance like any other).
- **FR-12** A default safe scene ships in content: self-contained, audio-independent, cheap,
  dark-but-not-black (e.g. a slow-breathing gradient). `panic.scene.ts` points at it out of
  the box.

### Non-functional

- **NFR-1** The warm panic instance costs one extra instance's memory and zero per-frame
  render cost while not panicked (instances render only when directed — already the rule).
- **NFR-2** Stage changes live in `@loom/runtime` (the audience-safety core, human-reviewed)
  and stay minimal: one new directive mode and the resume bookkeeping. Everything else is
  engine-app.
- **NFR-3** All three never-go-black layers are preserved verbatim; this feature only adds a
  fourth escape (known-good pixels) on top.

## Surfaces

### Console

- The PANIC button is unchanged: one big click, executes the armed mode.
- Next to it, a two-state segmented control: **HOLD | SAFE SCENE**, showing the safe scene's
  name under the SCENE option (read from the panic pointer). Persisted in `localStorage` so a
  reload doesn't silently re-arm a different behavior mid-show.
- Warning state on the control when the panic instance is in build-fallback (FR-7).
- The panic instance renders as a pinned tile with its param panel available.
- RESUME unchanged: one button, returns to the prior output (hard cut from scene-panic).

### MCP (agent)

No new tools. `get_session` additions only (FR-10): `panicMode`, `panicActive`
(`null | "hold" | "scene"`), `panicScene: { name, status, error }`, and the panic instance
listed among instances with a `pinned: "panic"` marker. The agent guide gains one line: if
`panicActive` is non-null, stop touching the live path and wait for the human.

## Implementation plan

Phased; every phase lands green on `pnpm typecheck`, unit tests, and `validate:m0..m3`.

### Phase 1 — content: the default safe scene

1. `content/scenes/safe.scene.ts` — slow-breathing radial gradient, no audio input, no
   feedback, ~30 lines, params: `level` (brightness), `period` (breath seconds). Composes
   existing modules where possible per the scenes-are-wiring policy.
2. `content/scenes/panic.scene.ts` — one-line re-export of `safe.scene.ts`, header comment
   marking it as the panic pointer (the `live.scene.ts` twin). Excluded from the scene picker
   list the same way `live` is (it's a pointer, not a scene of its own).

### Phase 2 — runtime: Stage modes (`packages/runtime`, human-reviewed)

1. `Stage.panic(mode: "hold" | "scene")` (default `"hold"` for back-compat). New directive
   mode `panic-scene` carrying the panic instance's id; `hold` directive unchanged.
2. Resume bookkeeping: remember prior routing, return to it on `resume()` (hard cut).
3. Re-press semantics (FR-6), fade-cancel ordering (FR-9).
4. Unit tests with the fake clock: hold unchanged, scene routes panic id, resume restores,
   re-press escalation, panic mid-crossfade cancels then applies, double-resume is a no-op.

### Phase 3 — engine: warm instance + wiring (`packages/engine-app`)

1. Boot: build the panic instance from `panic.scene.ts` next to the boot instance; register
   in `SessionStore` with a `pinned: "panic"` flag (protected from destroy, excluded from
   "is anything staged" logic).
2. HMR: accept on `panic.scene.ts` mirrors the `live.scene.ts` accept (rebuild-before-dispose;
   failed rebuild keeps the previous panic instance and only flags health — FR-7's fallback
   triggers only if there has *never* been a healthy build).
3. `EngineApi`: `panic` payload gains optional `mode`; `arm_panic_mode` joins the human-only
   command set; `get_session` extensions; `window.__loom` mirrors panic state for validators.
4. Compositor: render path for the `panic-scene` directive (it's the single-instance path
   pointed at a different id — minimal).

### Phase 4 — Console UI

1. Segmented HOLD | SAFE SCENE control + warning state + localStorage persistence.
2. Pinned panic tile with badge; PANIC button sends the armed mode.

### Phase 5 — acceptance

Extend `validate:m3` (it already owns the PANIC checks) or start `validate:m4`:
- Scene-panic cuts to safe-scene pixels within one frame boundary (screenshot delta).
- LIVE pointer unmoved during scene-panic; RESUME restores prior pixels.
- Re-press escalation hold→scene.
- Break `panic.scene.ts` (build throw) → PANIC degrades to hold, session reports fallback.
- Engine loop ticks throughout (frame counter advances in scene mode; in hold mode the
  existing check stands).

Estimated size: content ~40 lines; runtime ~80 + tests; engine ~120; console ~80; validation ~80.

## Edge cases & interactions

- **Panic Scene == live scene**: fine — separate instances, separate state.
- **Commit while scene-panicked**: refused (commit changes what the audience sees; the
  audience is seeing the panic scene; resolve the panic first). Staging remains allowed.
- **Editing `safe.scene.ts` mid-panic**: HMR rebuilds the panic instance; rebuild-before-
  dispose means the audience-facing panic output never gaps. A *failed* edit keeps the
  running panic instance (never-go-black layer 2 applies to the panic instance too).
- **Param modulators** (sibling request): modulators on the panic instance run while it
  renders; modulators on the suspended live instance pause with it — consistent with that
  spec's FR-10 ("the held frame stays truly held").
- **`live` alias during scene-panic**: still resolves to the LIVE pointer (unmoved, FR-4),
  *not* the panic instance — agent commands keep operating on the real scene being repaired,
  which is exactly what a recovery workflow wants.
- **Boot cost**: one extra build at startup; if it throws, boot completes in hold-fallback
  (FR-7) rather than failing the engine.

## Resolved decisions

1. **Designation via `panic.scene.ts` pointer file**, not a metadata tag or Console picker —
   it reuses the one designation convention the repo already has (`live.scene.ts`), is
   HMR-correct for free, and survives engine restarts without new persistence.
2. **Hard cut by default** for both entering and leaving scene-panic — emergencies shouldn't
   blend with what they're escaping; a fade option exists but is opt-in.
3. **Arm-in-advance, single-click execute** — no menu on the panic button itself; emergencies
   get muscle memory, options get a calm moment beforehand.
4. **Scene-panic is an output override, not a commit** — RESUME returns to the prior live
   instance and the "LIVE changes only via commit()" invariant keeps living in one place.

## Out of scope — future candidates

- Multiple named safe scenes with a picker (festival logo vs. blackout vs. interstitial).
- Auto-panic triggers (fps floor, sustained instance error, watchdog) — powerful but needs
  careful design to avoid false ejects mid-drop.
- A true "blackout" mode (deliberate black is a *choice*, distinct from never-go-*black* the
  failure class; likely just a `blackout` scene targeted by the pointer).
- MIDI/foot-pedal binding for PANIC (belongs to a general control-surface feature).
