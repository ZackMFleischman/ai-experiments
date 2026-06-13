import { BuildCtx, defineModule, texNode, type SignalLike, type TexNode } from "@loom/runtime";
import { cos, float, fract, length, select, sin, smoothstep, uv, vec2, vec3, vec4 } from "three/tsl";
import type { Node } from "three/webgpu";
import { parseHex } from "../_shared";

const TAU = Math.PI * 2;

/** Candy-coated sprinkle colors — classic jimmies jar. */
const CANDY = ["#ff4f7e", "#ffd24f", "#4fd2ff", "#7dff6b", "#b06bff", "#ff8a3d", "#fff6f0"];

/** Deterministic per-sprinkle pseudo-random in [0,1) — stable across rebuilds. */
const rand = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export interface SprinklesOpts {
  /** Hard ceiling on sprinkles baked into the shader (compile-time constant). Default 48. */
  maxCount?: number;
  /** How many sprinkles are actually flying (runtime SignalLike — ride a burst envelope). */
  count?: SignalLike;
  /** Rod half-length in uv-height units. */
  size?: SignalLike;
  /** Rod radius as a fraction of its length. */
  thickness?: SignalLike;
  /** Toss cadence — flights per second per sprinkle (steady; phase-stable). */
  cadence?: SignalLike;
  /** Tumble rate multiplier while in flight. */
  spin?: SignalLike;
  /** Brightness flash on hits — feed a kick envelope. */
  burst?: SignalLike;
  /** Landing scatter radius around the frame center (uv-height units). */
  spread?: number;
  /** Overall gain. */
  brightness?: SignalLike;
  /** Output aspect ratio for CPU layout math (compile-time constant). */
  aspect?: number;
}

/**
 * Candy sprinkles tossed at the frame from every edge angle: each rod launches
 * from just outside the frame on its own staggered cycle, flies in toward a
 * scatter point near the center while tumbling, then fades as it lands. Drive
 * `count` with a kick envelope (+ a beat LFO) for bursts on a cadence, and
 * `burst` for a brightness flash on the hit. Premultiplied alpha overlay.
 */
export const sprinkles = defineModule(
  {
    name: "sprinkles",
    kind: "source",
    description:
      "Candy sprinkle rods flung in from all edges on staggered cycles, tumbling and fading as they land (premultiplied alpha).",
    tags: ["sprinkles", "particles", "confetti", "overlay", "burst", "audio-reactive", "fun"],
    example: 'sprinkles(ctx, { count: burstCountSig, burst: ctx.input("kick") })',
  },
  (ctx: BuildCtx, opts: SprinklesOpts = {}): TexNode => {
    const maxCount = opts.maxCount ?? 48;
    const aspect = opts.aspect ?? 16 / 9;
    const spread = opts.spread ?? 0.4;
    const countU = ctx.uniformOf(opts.count ?? 16);
    const size = ctx.uniformOf(opts.size ?? 0.02);
    const thickness = ctx.uniformOf(opts.thickness ?? 0.35);
    const cadence = ctx.uniformOf(opts.cadence ?? 0.5);
    const spin = ctx.uniformOf(opts.spin ?? 1);
    const burst = ctx.uniformOf(opts.burst ?? 0);
    const brightness = ctx.uniformOf(opts.brightness ?? 1);

    const p = uv().sub(vec2(0.5)).mul(vec2(aspect, 1));
    // Frame-clock time, NOT TSL `time` (wall clock) — keeps fixture replays deterministic.
    const t = ctx.uniformOf(ctx.time.now);

    let rgb: Node<"vec3"> = vec3(0);
    let cover: Node<"float"> = float(0);
    for (let i = 0; i < maxCount; i++) {
      // Launch from just outside the frame at a random edge angle; land near center.
      const a0 = rand(i, 1) * TAU;
      const sx0 = Math.cos(a0) * 1.25;
      const sy0 = Math.sin(a0) * 1.25;
      const ex = (rand(i, 2) - 0.5) * spread * aspect * 0.6;
      const ey = (rand(i, 3) - 0.5) * spread;

      // Staggered, phase-stable flight cycle: fling fast, settle, fade out.
      const pr = fract(t.mul(cadence).mul(0.7 + rand(i, 4) * 0.7).add(rand(i, 5)));
      const fly = pr.pow(0.55);
      const pos = vec2(fly.mul(ex - sx0).add(sx0), fly.mul(ey - sy0).add(sy0));
      const vis = smoothstep(float(0.0), float(0.05), pr).mul(smoothstep(float(0.985), float(0.8), pr));

      // Tumbling rod: rotate local coords, capsule distance.
      const ang = t.mul(spin).mul(0.8 + rand(i, 7) * 1.6).add(rand(i, 6) * TAU);
      const c = cos(ang);
      const s = sin(ang);
      const local = p.sub(pos);
      const qx = local.x.mul(c).add(local.y.mul(s));
      const qy = local.y.mul(c).sub(local.x.mul(s));
      const len = size.mul(0.6 + rand(i, 8) * 0.8);
      const rad = len.mul(thickness).max(1e-4);
      const d = length(vec2(qx.abs().sub(len).max(0), qy));
      const rod = smoothstep(rad, rad.mul(0.5), d);

      const [r, g, b] = parseHex(CANDY[Math.floor(rand(i, 9) * CANDY.length) % CANDY.length]!);
      const gain = rod.mul(vis).mul(select(float(i).lessThan(countU), float(1), float(0)));
      rgb = rgb.add(vec3(r, g, b).mul(gain));
      cover = cover.add(gain);
    }

    // Burst flash lifts the whole storm above its alpha for a bloomable pop.
    const flash = burst.mul(0.6).add(1).mul(brightness);
    return texNode(vec4(rgb.mul(flash), cover.clamp(0, 1)));
  },
);
