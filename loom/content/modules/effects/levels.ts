import { BuildCtx, defineModule, texNode, type SignalLike, type TexNode } from "@loom/runtime";
import { float, vec3, vec4 } from "three/tsl";

export interface LevelsOpts {
  input: TexNode;
  gain?: SignalLike;
  /** >1 brightens mids, <1 crushes. */
  gamma?: SignalLike;
  bias?: SignalLike;
}

/** Gain / bias / gamma color adjustment. */
export const levels = defineModule(
  {
    name: "levels",
    kind: "effect",
    description: "Gain, bias and gamma adjustment on an image.",
    tags: ["color", "grade"],
    example: 'levels(ctx, { input: src, gain: 1.2, gamma: 1.1 })',
  },
  (ctx: BuildCtx, opts: LevelsOpts): TexNode => {
    const gain = ctx.uniformOf(opts.gain ?? 1);
    const gamma = ctx.uniformOf(opts.gamma ?? 1);
    const bias = ctx.uniformOf(opts.bias ?? 0);
    const rgb = opts.input.color.rgb
      .mul(gain)
      .add(bias)
      .max(0)
      .pow(vec3(float(1).div(gamma.max(0.0001))));
    return texNode(vec4(rgb, 1), opts.input.passes);
  },
);
