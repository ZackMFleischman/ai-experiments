import { BuildCtx, defineModule, texNode, type Pass, type SignalLike, type TexNode } from "@loom/runtime";
import { abs, cos, sign, sin, step, texture, uniform, uv, vec2, vec4 } from "three/tsl";
import { SRGBColorSpace, TextureLoader } from "three/webgpu";

const SCREEN_ASPECT = 16 / 9;

export interface FlybyOpts {
  input: TexNode;
  /** One sprite per image URL (transparent PNGs read best). */
  urls: string[];
  /** Sprite half-height as a fraction of screen height. */
  size?: SignalLike;
  /** Flight speed multiplier (0 freezes the flock mid-air). */
  speed?: SignalLike;
  /** Flock opacity 0..1 — fade them in for the drop. */
  opacity?: SignalLike;
}

/**
 * A flock of image sprites swooping around the screen on top of any input.
 * Each sprite roams its own Lissajous path (deterministic per index), tilts
 * into the motion and mirrors to face its heading. Composites premultiplied-
 * over; the flight phase integrates a speed signal, so retuning speed never
 * teleports the flock.
 */
export const flyby = defineModule(
  {
    name: "flyby",
    kind: "effect",
    description: "Image sprites (logos, critters) flying around the screen over any input.",
    tags: ["sprites", "overlay", "composite", "fun"],
    example: 'flyby(ctx, { input: chain, urls: hippoUrls, size: 0.16, speed: 0.6 })',
  },
  (ctx: BuildCtx, opts: FlybyOpts): TexNode => {
    const size = ctx.uniformOf(opts.size ?? 0.16);
    const opacity = ctx.uniformOf(opts.opacity ?? 1);

    // Integrate speed into a phase so live speed changes never jump positions.
    const speed = opts.speed ?? 0.6;
    const phase = uniform(0);
    ctx.updaters.push((f) => {
      phase.value += (typeof speed === "number" ? speed : speed.get(f)) * f.dt;
    });

    const textures = opts.urls.map((url) => {
      const aspect = uniform(1);
      const tex = new TextureLoader().load(url, (t) => {
        aspect.value = t.image.width / t.image.height;
      });
      tex.colorSpace = SRGBColorSpace;
      return { tex, aspect };
    });

    let acc = opts.input.color;
    textures.forEach(({ tex, aspect }, i) => {
      // Deterministic per-sprite path constants (golden-angle scattered).
      const o1 = i * 2.39996, o2 = i * 4.71239 + 1.3, o3 = i * 1.61803;
      const s1 = 0.55 + 0.4 * ((i * 0.618) % 1);
      const s2 = 0.45 + 0.4 * ((i * 0.382) % 1);

      const cx = sin(phase.mul(s1).add(o1)).mul(0.42).add(0.5);
      const cy = sin(phase.mul(s2).add(o2)).mul(0.33).add(0.5);
      const tilt = sin(phase.mul(s1 * 0.7).add(o3)).mul(0.3);
      const bob = sin(phase.mul(s2 * 1.7).add(o1)).mul(0.15).add(1);
      const heading = sign(cos(phase.mul(s1).add(o1))); // mirror to face travel

      const l = uv().sub(vec2(cx, cy)).mul(vec2(SCREEN_ASPECT, 1)).div(size.mul(bob).max(0.001));
      const ct = cos(tilt);
      const st = sin(tilt);
      const lr = vec2(l.x.mul(ct).add(l.y.mul(st)).mul(heading), l.y.mul(ct).sub(l.x.mul(st)));
      const iuv = vec2(lr.x.div(aspect), lr.y.negate()).add(0.5);

      const d = abs(iuv.sub(0.5));
      const inside = step(d.x, 0.5).mul(step(d.y, 0.5));
      const s = texture(tex, iuv);
      const sa = s.a.mul(inside).mul(opacity);
      acc = vec4(s.rgb.mul(sa).add(acc.rgb.mul(sa.oneMinus())), sa.add(acc.a.mul(sa.oneMinus())));
    });

    const pass: Pass = {
      render() {}, // no per-frame work — owns the textures' lifetime
      dispose() {
        for (const { tex } of textures) tex.dispose();
      },
    };

    return texNode(acc, [...opts.input.passes, pass]);
  },
);
