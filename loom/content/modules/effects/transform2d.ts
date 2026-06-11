import {
  BuildCtx,
  defineModule,
  texNode,
  type FrameCtx,
  type Pass,
  type SignalLike,
  type TexNode,
} from "@loom/runtime";
import { abs, cos, sign, sin, step, texture, uv, vec2, vec4 } from "three/tsl";
import {
  HalfFloatType,
  MeshBasicNodeMaterial,
  QuadMesh,
  RenderTarget,
  type Node,
  type WebGPURenderer,
} from "three/webgpu";

const WIDTH = 1280;
const HEIGHT = 720;
const SCREEN_ASPECT = 16 / 9;

/** A live 2D placement: every field is a signal, so transforms animate for free. */
export interface Transform2D {
  /** Center x in uv space (0..1, 0.5 = screen center). */
  x?: SignalLike;
  /** Center y in uv space (0..1, 0.5 = screen center). */
  y?: SignalLike;
  /** Rotation in radians, counter-clockwise. */
  rotate?: SignalLike;
  /** Uniform scale — 1 spans the screen height. */
  scale?: SignalLike;
  /** Mirrors horizontally when negative — feed a heading signal. */
  mirrorX?: SignalLike;
}

/**
 * The shared transform concept: maps a screen-uv point into the transform's
 * LOCAL space — centered, aspect-corrected, y-up, scale 1 spanning the screen
 * height. Sources (image) and the transform2d effect both sample through
 * this, so "attach a Transform2D" means the same thing everywhere.
 */
export function localSpace(ctx: BuildCtx, t: Transform2D = {}): (p: Node<"vec2">) => Node<"vec2"> {
  const x = ctx.uniformOf(t.x ?? 0.5);
  const y = ctx.uniformOf(t.y ?? 0.5);
  const rotate = ctx.uniformOf(t.rotate ?? 0);
  const scale = ctx.uniformOf(t.scale ?? 1);
  const mirror = ctx.uniformOf(t.mirrorX ?? 1);
  return (p) => {
    const c = p.sub(vec2(x, y)).mul(vec2(SCREEN_ASPECT, 1)).div(scale.max(0.001));
    const cs = cos(rotate);
    const sn = sin(rotate);
    return vec2(c.x.mul(cs).add(c.y.mul(sn)).mul(sign(mirror)), c.y.mul(cs).sub(c.x.mul(sn)));
  };
}

export interface Transform2dOpts extends Transform2D {
  input: TexNode;
}

/**
 * Attach a Transform2D to ANY chain: the input renders to a buffer, then is
 * re-sampled through the inverse transform — moved, spun, scaled, mirrored —
 * with transparent black outside its frame. Stateful — owns one render
 * target so it can move arbitrary upstream content (same shape as glitch).
 */
export const transform2d = defineModule(
  {
    name: "transform2d",
    kind: "effect",
    description: "Moves/rotates/scales/mirrors any input as a layer (live Transform2D).",
    tags: ["transform", "layout", "layer", "stateful"],
    example: 'transform2d(ctx, { input: src, x: 0.3, scale: 0.5, rotate: spinSig })',
  },
  (ctx: BuildCtx, opts: Transform2dOpts): TexNode => {
    const rt = new RenderTarget(WIDTH, HEIGHT, { type: HalfFloatType });

    const srcMaterial = new MeshBasicNodeMaterial();
    srcMaterial.colorNode = opts.input.color;
    const srcQuad = new QuadMesh(srcMaterial);

    const l = localSpace(ctx, opts)(uv());
    const suv = l.div(vec2(SCREEN_ASPECT, 1)).add(0.5);
    const d = abs(suv.sub(0.5));
    const inside = step(d.x, 0.5).mul(step(d.y, 0.5));
    const s = texture(rt.texture, suv);

    const pass: Pass = {
      render(renderer: WebGPURenderer, _f: FrameCtx) {
        const prev = renderer.getRenderTarget();
        renderer.setRenderTarget(rt);
        srcQuad.render(renderer);
        renderer.setRenderTarget(prev);
      },
      dispose() {
        rt.dispose();
        srcMaterial.dispose();
      },
    };

    return texNode(vec4(s.rgb.mul(inside), s.a.mul(inside)), [...opts.input.passes, pass]);
  },
);
