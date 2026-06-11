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

  // 2. World — consume named input-rack channels (content/inputs.ts).
  const kickEnv = ctx.input("kick");                          // bass onsets -> tuned envelope
  const bass = ctx.input("bass");                             // lagged bass energy
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
- **Audio reactivity goes through the input rack**: `ctx.input("kick"|"hats"|"bass"|"energy")` — named channels defined in `content/inputs.ts`, tuned once globally (manifest instance `"globals"`: `inputs.kick.threshold`, …), consumed late-bound (retuning never rebuilds your scene). Each `ctx.input` auto-declares an `input.<name>.amount` trim param. **Trims, not overrides** — if you need a differently-detected kick, add a new named channel to `content/inputs.ts` (e.g. `d.onset("kickTight", …)`); don't retune `kick` to fit one scene.
- Raw bus access (`ctx.audio.band/rms/onset` + `lagSignal`/`envelopeSignal`) still exists for experiments, but a detection idiom worth keeping belongs in the rack where the human can tune and meter it (Console drawer on `i`).
- Time: `ctx.time.beatPhase`, `ctx.time.beatEvery(n)`, or `lfo(ctx, { periodBeats })` for beat-locked motion.
- Check `content/CATALOG.md` (generated one-line index of every module + scene) before writing inline shader code — compose existing modules first; if the look you need isn't there, add a module rather than inlining it.
- Combining several signals (e.g. `energy = kickEnv * punch + bass * 0.6`)? Build one derived signal: `new Signal((f) => kickEnv.get(f) * punchSig.get(f) + bass.get(f) * 0.6)` and pass it to a module opt — pulling it through `uniformOf` keeps every stateful input ticking.
- Scene throws at build are contained but waste an iteration: prefer typecheck-clean saves.

## Going live

`content/scenes/live.scene.ts` re-exports the active scene — switch with that one line. After saving: `get_session` (instanceError null? scene name right?) then `screenshot` to compare against intent. Iterate structure in code; converge feel with `set_param`; tell the human which knobs exist.

A brand-new `*.scene.ts` hot-registers automatically (the dev server watches `content/`). If `create_instance` still reports the scene unknown, touch `packages/engine-app/src/scenes.ts` to force the barrel glob to re-expand.
