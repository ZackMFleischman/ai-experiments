import { defineScene, envelopeSignal, lagSignal, Signal, texNode } from "@loom/runtime";
import { mix, smoothstep, vec3, vec4 } from "three/tsl";
import { lfo } from "../modules/control/lfo";
import { feedback } from "../modules/effects/feedback";
import { levels } from "../modules/effects/levels";
import { blobs } from "../modules/sources/blobs";

/**
 * Slow-breathing ink-blob lava lamp. A 16-beat LFO breathes the blob radius,
 * kick onsets swell it sharply and flash the core, a 64-beat LFO drifts the
 * lava hue between ember and magenta, and feedback smears it all into ink.
 */
export default defineScene({
  name: "lava",
  description: "Slow-breathing ink-blob lava lamp; blobs swell and glow on the kick.",
  tags: ["audio-reactive", "organic", "lava-lamp"],
  build(ctx) {
    const size = ctx.float("size", { default: 0.11, min: 0.05, max: 0.28, description: "base blob radius" });
    const breathe = ctx.float("breathe", { default: 0.22, min: 0, max: 0.6, description: "slow breathing depth" });
    const pulse = ctx.float("pulse", { default: 0.5, min: 0, max: 1.5, description: "kick swell strength" });
    const speed = ctx.float("speed", { default: 0.35, min: 0.05, max: 2, description: "blob drift speed" });
    const wobble = ctx.float("wobble", { default: 0.05, min: 0, max: 0.15, description: "ink edge wobble" });
    const trail = ctx.float("trail", { default: 0.72, min: 0.5, max: 0.93, description: "ink smear persistence" });

    const kick = ctx.audio.onset({ band: "bass", threshold: 0.22 });
    const kickEnv = envelopeSignal(kick, { decay: 0.3 });
    const bass = lagSignal(ctx.audio.band("bass"), 0.08);
    const breatheLfo = lfo(ctx, { shape: "sine", periodBeats: 16 });
    const hueDrift = lfo(ctx, { shape: "sine", periodBeats: 64 });

    // Blob radius = base * (1 + slow breath + kick swell), composed on the CPU.
    const sizeS = size.signal();
    const breatheS = breathe.signal();
    const pulseS = pulse.signal();
    const radius = new Signal(
      (f) =>
        sizeS.get(f) *
        (1 + (breatheLfo.get(f) - 0.5) * breatheS.get(f) + kickEnv.get(f) * pulseS.get(f) * 0.5),
    );

    const field = blobs(ctx, {
      count: 7,
      size: radius,
      speed: speed.signal(),
      wobble: wobble.signal(),
      softness: 0.3,
    });

    const kickU = ctx.uniformOf(kickEnv);
    const hueU = ctx.uniformOf(hueDrift);

    const body = smoothstep(0.1, 0.9, field.color.x);
    const glow = field.color.y;
    const inkDark = vec3(0.008, 0.006, 0.04);
    const lavaEdge = vec3(0.18, 0.005, 0.025);
    const lavaCore = mix(vec3(0.9, 0.18, 0.02), vec3(0.7, 0.03, 0.25), hueU);
    const lava = mix(lavaEdge, lavaCore, glow);
    const rgb = mix(inkDark, lava, body).add(lavaCore.mul(glow).mul(kickU.mul(0.9)));
    const src = texNode(vec4(rgb, 1), field.passes);

    const trails = feedback(ctx, { input: src, amount: trail.signal(), zoom: 1.0 });
    return levels(ctx, {
      input: trails,
      gain: bass.map((b) => 1 + b * 0.35),
      gamma: 1.1,
    });
  },
});
