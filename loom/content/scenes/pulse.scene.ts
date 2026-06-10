import { defineScene, envelopeSignal, lagSignal, texNode } from "@loom/runtime";
import { length, mix, sin, smoothstep, time, uv, vec2, vec3, vec4 } from "three/tsl";
import { lfo } from "../modules/control/lfo";
import { feedback } from "../modules/effects/feedback";
import { levels } from "../modules/effects/levels";
import { noise } from "../modules/sources/noise";

/**
 * M1 demo: kick-reactive ink feedback. Bass onsets punch ring brightness,
 * sustained bass rides the gain, a 16-beat LFO drifts the palette, and the
 * feedback module drags it all into trails.
 */
export default defineScene({
  name: "pulse",
  description: "Kick-reactive feedback rings with a slowly drifting palette.",
  tags: ["audio-reactive", "feedback", "demo"],
  build(ctx) {
    const punch = ctx.float("punch", { default: 1.2, min: 0, max: 3, description: "kick hit strength" });
    const trail = ctx.float("trail", { default: 0.88, min: 0.5, max: 0.97, description: "feedback persistence" });
    const drift = ctx.float("drift", { default: 1.015, min: 0.98, max: 1.06, description: "trail zoom drift" });

    const kick = ctx.audio.onset({ band: "bass", threshold: 0.22 });
    const kickEnv = envelopeSignal(kick, { decay: 0.22 });
    const bass = lagSignal(ctx.audio.band("bass"), 0.06);
    const hue = lfo(ctx, { shape: "sine", periodBeats: 16 });

    const kickU = ctx.uniformOf(kickEnv);
    const bassU = ctx.uniformOf(bass);
    const hueU = ctx.uniformOf(hue);
    const punchU = ctx.uniformOf(punch.signal());

    const p = uv().sub(vec2(0.5)).mul(vec2(16 / 9, 1));
    const d = length(p);
    const rings = sin(d.mul(26).sub(time.mul(3))).mul(0.5).add(0.5);
    const core = smoothstep(0.55, 0.0, d);
    const energy = kickU.mul(punchU).add(bassU.mul(0.6)).add(0.06);

    const grain = noise(ctx, { scale: 2.5, speed: 0.15 });
    const inkDark = vec3(0.02, 0.04, 0.09);
    const inkGlow = mix(vec3(0.1, 0.9, 0.85), vec3(0.95, 0.2, 0.9), hueU);
    const srcColor = mix(
      inkDark,
      inkGlow,
      rings.mul(core).mul(energy).add(grain.color.x.mul(0.1)),
    );
    const src = texNode(vec4(srcColor, 1), grain.passes);

    const trails = feedback(ctx, { input: src, amount: trail.signal(), zoom: drift.signal() });
    return levels(ctx, {
      input: trails,
      gain: bass.map((b) => 1 + b * 0.7),
      gamma: 1.15,
    });
  },
});
