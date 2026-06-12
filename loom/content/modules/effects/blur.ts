import { BuildCtx, defineModule, texNode, type Pass, type SignalLike, type TexNode } from "@loom/runtime";
import { add, float, screenSize, texture, uv, vec2, vec4 } from "three/tsl";
import { HalfFloatType, MeshBasicNodeMaterial, NoBlending, QuadMesh, RenderTarget, Vector2, type WebGPURenderer } from "three/webgpu";

export interface BlurOpts {
  input: TexNode;
  /** Blur radius in pixels (0 = pass-through-soft). */
  radius?: SignalLike;
}

const WEIGHTS = [0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216]; // 9-tap gaussian

/** Sum 9 gaussian taps of `tex` along `dir` (unit axis), spaced by radius/4 px. */
function taps(tex: RenderTarget, dir: [number, number], radius: ReturnType<BuildCtx["uniformOf"]>) {
  const texel = vec2(dir[0], dir[1]).div(screenSize).mul(radius.div(4).max(0.001));
  let acc = texture(tex.texture, uv()).mul(WEIGHTS[0]!);
  for (let i = 1; i < WEIGHTS.length; i++) {
    const off = texel.mul(i);
    acc = add(acc, add(texture(tex.texture, uv().add(off)), texture(tex.texture, uv().sub(off))).mul(WEIGHTS[i]!));
  }
  return acc;
}

/**
 * Separable gaussian blur (the TD Blur TOP): input → buffer → horizontal pass
 * → vertical taps in the output expression. Two owned targets, destination-
 * sized. The building block under bloom and every soft look.
 */
export const blur = defineModule(
  {
    name: "blur",
    kind: "effect",
    description: "Separable gaussian blur with a live pixel radius.",
    tags: ["blur", "soft", "gaussian", "stateful"],
    example: 'blur(ctx, { input: src, radius: 12 })',
    chainParams: [
      { name: "radius", default: 8, min: 0, max: 60, step: 0.5, description: "blur radius (px)" },
    ],
  },
  (ctx: BuildCtx, opts: BlurOpts): TexNode => {
    const radius = ctx.uniformOf(opts.radius ?? 8);
    const rtSrc = new RenderTarget(1, 1, { type: HalfFloatType });
    const rtH = new RenderTarget(1, 1, { type: HalfFloatType });
    const destSize = new Vector2();

    const srcMaterial = new MeshBasicNodeMaterial();
    srcMaterial.colorNode = opts.input.color;
    srcMaterial.transparent = true;
    srcMaterial.blending = NoBlending;
    const srcQuad = new QuadMesh(srcMaterial);

    const hMaterial = new MeshBasicNodeMaterial();
    hMaterial.colorNode = vec4(taps(rtSrc, [1, 0], radius));
    hMaterial.transparent = true;
    hMaterial.blending = NoBlending;
    const hQuad = new QuadMesh(hMaterial);

    const pass: Pass = {
      render(renderer: WebGPURenderer) {
        const prev = renderer.getRenderTarget();
        if (prev) destSize.set(prev.width, prev.height);
        else renderer.getDrawingBufferSize(destSize);
        if (rtSrc.width !== destSize.x || rtSrc.height !== destSize.y) {
          rtSrc.setSize(destSize.x, destSize.y);
          rtH.setSize(destSize.x, destSize.y);
        }
        renderer.setRenderTarget(rtSrc);
        srcQuad.render(renderer);
        renderer.setRenderTarget(rtH);
        hQuad.render(renderer);
        renderer.setRenderTarget(prev);
      },
      dispose() {
        rtSrc.dispose();
        rtH.dispose();
        srcMaterial.dispose();
        hMaterial.dispose();
      },
    };

    const out = taps(rtH, [0, 1], radius);
    return texNode(vec4(out.rgb, out.a.add(float(0))), [...opts.input.passes, pass]);
  },
);
