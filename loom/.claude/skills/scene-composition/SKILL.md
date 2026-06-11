---
name: scene-composition
description: Use when writing or editing a LOOM scene (content/scenes/*.scene.ts) — covers defineScene, the InputBus, params as the tuning surface, and going live via live.scene.ts.
---

# Scene composition

A scene composes modules into the picture: `defineScene({ name, description, tags, build(ctx) => TexNode })` in `content/scenes/<name>.scene.ts`.

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

  // 4. Compose: sources -> effects, TSL for custom shading.
  const src = texNode(vec4(...));                  // or osc(ctx, ...), noise(ctx, ...)
  const trails = feedback(ctx, { input: src, amount: 0.9 });
  return levels(ctx, { input: trails, gain: bass.map((b) => 1 + b) });
}
```

`content/scenes/pulse.scene.ts` is the golden example of all four steps.

## Rules of thumb

- **Params are the contract with the human.** Anything they'll want to ride live (intensity, speed, color drift, persistence) is a `ctx.float/int/bool`, not a constant. Tune via `set_param` before touching code again.
- Audio: `ctx.audio.band("bass"|"mid"|"treble")` (smooth with `lagSignal`), `ctx.audio.rms`, `ctx.audio.onset({ band, threshold })`. Onsets are events — convert with `envelopeSignal` for visual punch.
- Time: `ctx.time.beatPhase`, `ctx.time.beatEvery(n)`, or `lfo(ctx, { periodBeats })` for beat-locked motion.
- Check `content/CATALOG.md` (generated one-line index of every module + scene) before writing inline shader code — compose existing modules first.
- Scene throws at build are contained but waste an iteration: prefer typecheck-clean saves.

## Going live

`content/scenes/live.scene.ts` re-exports the active scene — switch with that one line. After saving: `get_session` (instanceError null? scene name right?) then `screenshot` to compare against intent. Iterate structure in code; converge feel with `set_param`; tell the human which knobs exist.
