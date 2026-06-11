import {
  BuildCtx,
  defineModule,
  texNode,
  type Pass,
  type SignalLike,
  type TexNode,
} from "@loom/runtime";
import { abs, cos, sin, step, texture, uniform, uv, vec2, vec4 } from "three/tsl";
import { SRGBColorSpace, TextureLoader } from "three/webgpu";

// The Output renders at a fixed 1920x1080 internally (CSS cover-scales it),
// so the source can assume a 16:9 picture plane.
const SCREEN_ASPECT = 16 / 9;

export interface ImagePlateOpts {
  /** Image URL — from a scene use `new URL("../assets/x.png", import.meta.url).href`. */
  url: string;
  /** Rotation in radians, counter-clockwise. Feed an integrating signal for steady spin. */
  rotate?: SignalLike;
  /** Uniform scale — 1 fits the image height to the screen height (contain-by-height). */
  scale?: SignalLike;
  /** Pre-multiplied alpha threshold under which pixels go black (0 keeps soft alpha). */
  alphaCut?: SignalLike;
}

/**
 * Flat image plate: loads a texture by URL and draws it aspect-correct on a
 * black field, with live rotation and scale. The image loads async — the
 * plate is black for the first few frames until the texture arrives.
 */
export const imagePlate = defineModule(
  {
    name: "imagePlate",
    kind: "source",
    description: "An image file drawn aspect-correct with live rotation and scale on black.",
    tags: ["image", "texture", "media", "rotate"],
    example: 'imagePlate(ctx, { url: imgUrl, rotate: angleSig, scale: 0.9 })',
  },
  (ctx: BuildCtx, opts: ImagePlateOpts): TexNode => {
    const aspect = uniform(1); // image w/h, known only after the async load
    const tex = new TextureLoader().load(opts.url, (t) => {
      aspect.value = t.image.width / t.image.height;
    });
    tex.colorSpace = SRGBColorSpace;

    const rotate = ctx.uniformOf(opts.rotate ?? 0);
    const scale = ctx.uniformOf(opts.scale ?? 1);

    // Screen-space centered coords -> inverse-rotate -> back to image UV.
    const p = uv().sub(0.5).mul(vec2(SCREEN_ASPECT, 1)).div(scale.max(0.001));
    const c = cos(rotate);
    const s = sin(rotate);
    const q = vec2(p.x.mul(c).add(p.y.mul(s)), p.y.mul(c).sub(p.x.mul(s)));
    // Flip v: texture rows are top-down while screen uv is y-up. Flipping
    // after the rotation keeps positive `rotate` = counter-clockwise.
    const iuv = vec2(q.x.div(aspect), q.y.negate()).add(0.5);

    const d = abs(iuv.sub(0.5));
    const inside = step(d.x, 0.5).mul(step(d.y, 0.5));
    const col = texture(tex, iuv);

    const pass: Pass = {
      render() {}, // no per-frame work — pass exists to own the texture's lifetime
      dispose() {
        tex.dispose();
      },
    };

    // Premultiplied alpha: rgb is already scaled by coverage, and the real
    // alpha rides along so compositors (the `over` effect) can blend it.
    return texNode(vec4(col.rgb.mul(col.a).mul(inside), col.a.mul(inside)), [pass]);
  },
);
