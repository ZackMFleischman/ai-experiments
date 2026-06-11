import { Signal, defineScene, envelopeSignal, lagSignal } from "@loom/runtime";
import { lfo } from "../modules/control/lfo";
import { feedback } from "../modules/effects/feedback";
import { glitch } from "../modules/effects/glitch";
import { levels } from "../modules/effects/levels";
import { pulseRings } from "../modules/sources/pulseRings";

/**
 * Glitched pulse: the same pulseRings identity as the pulse scene, run
 * through the glitch effect (slice tears, kick-driven RGB split, scanlines)
 * before feedback smears the tears into datamosh streaks.
 */
export default defineScene({
  name: "pulse-glitch",
  description: "Pulse's kick-reactive rings, datamoshed: slice tearing, kick-driven RGB split, scanline flicker.",
  tags: ["audio-reactive", "feedback", "glitch"],
  build(ctx) {
    const punch = ctx.float("punch", { default: 1.2, min: 0, max: 3, description: "kick hit strength" });
    const trail = ctx.float("trail", { default: 0.86, min: 0.5, max: 0.97, description: "feedback persistence" });
    const drift = ctx.float("drift", { default: 1.012, min: 0.98, max: 1.06, description: "trail zoom drift" });
    const glitchAmt = ctx.float("glitch", { default: 0.6, min: 0, max: 1, description: "overall glitch amount" });
    const slices = ctx.float("slices", { default: 28, min: 4, max: 80, description: "horizontal tear band count" });
    const split = ctx.float("split", { default: 0.5, min: 0, max: 1, description: "RGB channel separation" });

    const kick = ctx.audio.onset({ band: "bass", threshold: 0.22 });
    const kickEnv = envelopeSignal(kick, { decay: 0.22 });
    const burst = envelopeSignal(kick, { decay: 0.4 });
    const bass = lagSignal(ctx.audio.band("bass"), 0.06);
    const punchSig = punch.signal();
    const energy = new Signal(
      (f) => kickEnv.get(f) * punchSig.get(f) + bass.get(f) * 0.6 + 0.06,
    );

    const rings = pulseRings(ctx, { energy, hue: lfo(ctx, { shape: "sine", periodBeats: 16 }) });
    const torn = glitch(ctx, {
      input: rings,
      amount: glitchAmt.signal(),
      burst,
      slices: slices.signal(),
      split: split.signal(),
    });
    const trails = feedback(ctx, { input: torn, amount: trail.signal(), zoom: drift.signal() });
    return levels(ctx, {
      input: trails,
      gain: bass.map((b) => 1 + b * 0.7),
      gamma: 1.15,
    });
  },
});
