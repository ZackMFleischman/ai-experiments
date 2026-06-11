import {
  BuildCtx,
  defineModule,
  texNode,
  type FrameCtx,
  type Pass,
  type SignalLike,
  type TexNode,
} from "@loom/runtime";
import { exp2, float, floor, fract, mix, screenSize, step, texture, uv, vec2 } from "three/tsl";
import {
  HalfFloatType,
  MeshBasicNodeMaterial,
  NoBlending,
  QuadMesh,
  RenderTarget,
  Vector2,
  type Node,
  type WebGPURenderer,
} from "three/webgpu";

const BASE_ROWS = 720; // finest grid — visually identity at today's resolutions
const OCTAVES = 9; // amount 1 => BASE_ROWS / 2^9 ~ 1.4 giant blocks

export interface PixelateOpts {
  input: TexNode;
  /** Mosaic amount 0..1 — 0 is a true no-op (the buffer pass is skipped). */
  amount?: SignalLike;
}

/**
 * Mosaic pixelation: the input renders to a buffer and is re-sampled on a
 * block grid whose density slides down in octaves with `amount`. Two
 * adjacent grids are crossfaded by the fractional octave, so riding the
 * slider morphs smoothly instead of stepping. At amount 0 the output is the
 * untouched input and the buffer render is skipped — zero cost until used.
 */
export const pixelate = defineModule(
  {
    name: "pixelate",
    kind: "effect",
    description: "Smooth slider-driven mosaic pixelation; free when amount is 0.",
    tags: ["pixelate", "mosaic", "retro", "stateful"],
    example: 'pixelate(ctx, { input: src, amount: 0.4 })',
  },
  (ctx: BuildCtx, opts: PixelateOpts): TexNode => {
    const amountIn = opts.amount ?? 0;
    const amount = ctx.uniformOf(amountIn);

    // Sized to match the live destination on first render — no assumed resolution.
    const rt = new RenderTarget(1, 1, { type: HalfFloatType });
    const destSize = new Vector2();

    const srcMaterial = new MeshBasicNodeMaterial();
    srcMaterial.colorNode = opts.input.color;
    // Raw RGBA write: transparent layers must keep their alpha in the buffer.
    srcMaterial.transparent = true;
    srcMaterial.blending = NoBlending;
    const srcQuad = new QuadMesh(srcMaterial);

    // Block grids one octave apart, crossfaded by the fractional level.
    const aspect = screenSize.x.div(screenSize.y);
    const level = amount.clamp(0, 1).mul(OCTAVES);
    const blockUv = (rows: Node<"float">) => {
      const n = vec2(rows.mul(aspect), rows);
      return floor(uv().mul(n)).add(0.5).div(n); // sample each block's center
    };
    const rows = float(BASE_ROWS).div(exp2(floor(level)));
    const coarse = texture(rt.texture, blockUv(rows));
    const coarser = texture(rt.texture, blockUv(rows.mul(0.5)));
    const mosaic = mix(coarse, coarser, fract(level).smoothstep(0, 1));

    // Uniform gate: identical input passthrough while the effect is idle.
    const active = step(float(1e-5), amount);
    const col = mix(opts.input.color, mosaic, active);

    const pass: Pass = {
      render(renderer: WebGPURenderer, f: FrameCtx) {
        const amt = typeof amountIn === "number" ? amountIn : amountIn.get(f);
        if (amt <= 1e-5) return; // idle: no buffer work at all
        const prev = renderer.getRenderTarget();
        if (prev) destSize.set(prev.width, prev.height);
        else renderer.getDrawingBufferSize(destSize);
        if (rt.width !== destSize.x || rt.height !== destSize.y) rt.setSize(destSize.x, destSize.y);
        renderer.setRenderTarget(rt);
        srcQuad.render(renderer);
        renderer.setRenderTarget(prev);
      },
      dispose() {
        rt.dispose();
        srcMaterial.dispose();
      },
    };

    return texNode(col, [...opts.input.passes, pass]);
  },
);
