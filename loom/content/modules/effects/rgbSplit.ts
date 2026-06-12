import { BuildCtx, defineModule, texNode, type Pass, type SignalLike, type TexNode } from "@loom/runtime";
import { cos, sin, texture, uv, vec2, vec4 } from "three/tsl";
import { HalfFloatType, MeshBasicNodeMaterial, NoBlending, QuadMesh, RenderTarget, Vector2, type WebGPURenderer } from "three/webgpu";

export interface RgbSplitOpts {
  input: TexNode;
  /** Split distance in uv units (0 = off). */
  amount?: SignalLike;
  /** Split direction in radians. */
  angle?: SignalLike;
}

/**
 * Chromatic aberration on a fader: R and B sample offset along an angle while
 * G holds — `glitch` bundles a pinch of this, but the solo effect rides clean.
 */
export const rgbSplit = defineModule(
  {
    name: "rgbSplit",
    kind: "effect",
    description: "RGB channel split (chromatic aberration) with live amount + angle.",
    tags: ["rgb", "aberration", "split", "glitch", "stateful"],
    example: 'rgbSplit(ctx, { input: src, amount: kickEnv.map((k) => k * 0.02) })',
    chainParams: [
      { name: "amount", default: 0.006, min: 0, max: 0.05, step: 0.0005, description: "split distance (uv)" },
      { name: "angle", default: 0, min: -3.1416, max: 3.1416, step: 0.01, description: "split direction (radians)" },
    ],
  },
  (ctx: BuildCtx, opts: RgbSplitOpts): TexNode => {
    const amount = ctx.uniformOf(opts.amount ?? 0.006);
    const angle = ctx.uniformOf(opts.angle ?? 0);
    const rt = new RenderTarget(1, 1, { type: HalfFloatType });
    const destSize = new Vector2();

    const srcMaterial = new MeshBasicNodeMaterial();
    srcMaterial.colorNode = opts.input.color;
    srcMaterial.transparent = true;
    srcMaterial.blending = NoBlending;
    const srcQuad = new QuadMesh(srcMaterial);

    const dir = vec2(cos(angle), sin(angle)).mul(amount);
    const r = texture(rt.texture, uv().add(dir)).r;
    const g = texture(rt.texture, uv());
    const b = texture(rt.texture, uv().sub(dir)).b;

    const pass: Pass = {
      render(renderer: WebGPURenderer) {
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

    return texNode(vec4(r, g.g, b, g.a), [...opts.input.passes, pass]);
  },
);
