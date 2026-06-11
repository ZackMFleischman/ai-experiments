import { BuildCtx, defineModule, texNode, type SignalLike, type TexNode } from "@loom/runtime";
import { cos, float, luminance, mix, smoothstep, uniform, vec4 } from "three/tsl";
import { Vector3 } from "three/webgpu";

const TAU = Math.PI * 2;

/** Inigo Quilez cosine palette: color(t) = a + b*cos(TAU*(c*t + d)). */
export interface PalettePreset {
  name: string;
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
  d: [number, number, number];
}

/** The shared palette library — index into this with colorize's `palette` opt. */
export const PALETTES: PalettePreset[] = [
  { name: "rainbow", a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0.0, 0.33, 0.67] },
  { name: "sunset", a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0.0, 0.1, 0.2] },
  { name: "ocean", a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 0.5], d: [0.8, 0.9, 0.3] },
  { name: "neon", a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [2, 1, 0], d: [0.5, 0.2, 0.25] },
  { name: "fire", a: [0.7, 0.4, 0.2], b: [0.3, 0.4, 0.2], c: [2, 1, 1], d: [0.0, 0.25, 0.25] },
  { name: "ice", a: [0.5, 0.5, 0.6], b: [0.4, 0.4, 0.5], c: [1, 0.7, 0.4], d: [0.55, 0.6, 0.7] },
];

export interface ColorizeOpts {
  input: TexNode;
  /** Fractional index into PALETTES — 1.5 is halfway between presets 1 and 2; wraps. */
  palette?: SignalLike;
  /** Phase offset added to t — animate to scroll colors along the gradient. */
  shift?: SignalLike;
  /** How many palette cycles span the 0..1 luminance range (banding density). */
  bands?: SignalLike;
  /** 1 keeps near-black input black (masks the palette); 0 colors everything. */
  preserveBlack?: SignalLike;
}

/**
 * Maps input luminance through an animatable cosine palette (IQ-style).
 * The palette coefficients are lerped on the CPU each frame from the shared
 * PALETTES presets, so a drifting `palette` signal morphs hues smoothly.
 * Stateless — works on the node graph directly, no render target.
 */
export const colorize = defineModule(
  {
    name: "colorize",
    kind: "effect",
    description: "Luminance-to-color mapping through animatable cosine palettes (PALETTES presets).",
    tags: ["color", "palette", "gradient", "grade"],
    example: 'colorize(ctx, { input: src, palette: driftSig, bands: 2, shift: 0.1 })',
  },
  (ctx: BuildCtx, opts: ColorizeOpts): TexNode => {
    const a = uniform(new Vector3());
    const b = uniform(new Vector3());
    const c = uniform(new Vector3());
    const d = uniform(new Vector3());

    const pal = opts.palette ?? 0;
    ctx.updaters.push((f) => {
      const p = typeof pal === "number" ? pal : pal.get(f);
      const n = PALETTES.length;
      const i0 = ((Math.floor(p) % n) + n) % n;
      const i1 = (i0 + 1) % n;
      const fr = p - Math.floor(p);
      const e = fr * fr * (3 - 2 * fr); // ease so integer indices hold steady
      for (const [u, key] of [
        [a, "a"],
        [b, "b"],
        [c, "c"],
        [d, "d"],
      ] as const) {
        const lo = PALETTES[i0]![key];
        const hi = PALETTES[i1]![key];
        u.value.set(
          lo[0] + (hi[0] - lo[0]) * e,
          lo[1] + (hi[1] - lo[1]) * e,
          lo[2] + (hi[2] - lo[2]) * e,
        );
      }
    });

    const shift = ctx.uniformOf(opts.shift ?? 0);
    const bands = ctx.uniformOf(opts.bands ?? 1);
    const preserve = ctx.uniformOf(opts.preserveBlack ?? 1);

    const t = luminance(opts.input.color.rgb);
    const phase = t.mul(bands).add(shift);
    const col = a.add(b.mul(cos(phase.mul(c).add(d).mul(TAU))));
    const mask = mix(float(1), smoothstep(0.0, 0.02, t), preserve);

    return texNode(vec4(col.mul(mask), 1), opts.input.passes);
  },
);
