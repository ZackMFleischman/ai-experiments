---
name: scene-composition
description: Use when writing or editing a LOOM scene (content/scenes/*.scene.ts) — covers defineScene, the InputBus, params as the tuning surface, and going live via live.scene.ts.
---

# Scene composition

A scene composes modules into the picture: `defineScene({ name, description, tags, build(ctx) => TexNode })` in `content/scenes/<name>.scene.ts`.

**Scenes are wiring, not shaders.** A scene's job is params + InputBus signals routed into catalog modules. If a build() grows more than a few lines of inline TSL, the visual identity belongs in a module — extract it (see module-authoring) so other scenes can reuse it, then wire it here. `pulse` and `pulse-glitch` share the `pulseRings` source this way, and the glitch treatment is its own `glitch` effect rather than shader code baked into one scene. Duplicated TSL across scenes is the smell that a module is missing.

## Shape of a good build()

```ts
build(ctx) {
  // 1. Params — the human's knobs. Honest ranges, good defaults, descriptions.
  const punch = ctx.float("punch", { default: 1.2, min: 0, max: 3, description: "kick hit strength" });

  // 2. World — pull from the InputBus, shape with control signals.
  const kick = ctx.audio.onset({ band: "bass", threshold: 0.22 });
  const kickEnv = envelopeSignal(kick, { decay: 0.22 });      // events -> signal
  const bass = lagSignal(ctx.audio.band("bass"), 0.06);       // smooth the raw band
  const beat = lfo(ctx, { shape: "sine", periodBeats: 16 });  // beat-synced drift

  // 3. Bridge CPU -> GPU once per value.
  const kickU = ctx.uniformOf(kickEnv);
  const punchU = ctx.uniformOf(punch.signal());

  // 4. Compose catalog modules: sources -> effects. Inline TSL only for one-off glue.
  const src = pulseRings(ctx, { energy: kickEnv, hue: beat });
  const trails = feedback(ctx, { input: src, amount: 0.9 });
  return levels(ctx, { input: trails, gain: bass.map((b) => 1 + b) });
}
```

`content/scenes/pulse.scene.ts` is the golden example of all four steps.

## Rules of thumb

- **Params are the contract with the human.** Anything they'll want to ride live (intensity, speed, color drift, persistence) is a `ctx.float/int/bool`, not a constant. Tune via `set_param` before touching code again.
- Audio: `ctx.audio.band("bass"|"mid"|"treble")` (smooth with `lagSignal`), `ctx.audio.rms`, `ctx.audio.onset({ band, threshold })`. Onsets are events — convert with `envelopeSignal` for visual punch.
- Time: `ctx.time.beatPhase`, `ctx.time.beatEvery(n)`, or `lfo(ctx, { periodBeats })` for beat-locked motion.
- Check `content/CATALOG.md` (generated one-line index of every module + scene) before writing inline shader code — compose existing modules first; if the look you need isn't there, add a module rather than inlining it.
- Combining several signals (e.g. `energy = kickEnv * punch + bass * 0.6`)? Build one derived signal: `new Signal((f) => kickEnv.get(f) * punchSig.get(f) + bass.get(f) * 0.6)` and pass it to a module opt — pulling it through `uniformOf` keeps every stateful input ticking.
- Scene throws at build are contained but waste an iteration: prefer typecheck-clean saves.

## Going live

`content/scenes/live.scene.ts` re-exports the active scene — switch with that one line. After saving: `get_session` (instanceError null? scene name right?) then `screenshot` to compare against intent. Iterate structure in code; converge feel with `set_param`; tell the human which knobs exist.

A brand-new `*.scene.ts` hot-registers automatically (the dev server watches `content/`). If `create_instance` still reports the scene unknown, touch `packages/engine-app/src/scenes.ts` to force the barrel glob to re-expand.
