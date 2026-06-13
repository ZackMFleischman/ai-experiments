import { BuildCtx, defineModule, texNode, type SignalLike, type TexNode } from "@loom/runtime";
import { float, sin, smoothstep, uv, vec3, vec4 } from "three/tsl";
import { surfaceAspect } from "../_shared";

const TAU = Math.PI * 2;

export interface SoftServeOpts {
  /** Cream tint as three 0..1 r/g/b SignalLikes (wire a color param's channels). */
  tint?: readonly [SignalLike, SignalLike, SignalLike];
  /** Coil ridges stacked up the pile. */
  coils?: SignalLike;
  /** Pour speed — the coil spirals upward as fresh cream lands (cycles/sec). */
  flow?: SignalLike;
  /** Side-to-side sway of the pile axis (uv units at the tip). */
  sway?: SignalLike;
  /** Coil depth: how bulgy the swirl silhouette is (0 = smooth cone). */
  ridge?: SignalLike;
  /** Specular sheen strength on each coil's crest. */
  gloss?: SignalLike;
  /** Pile height as a fraction of frame height. */
  height?: SignalLike;
  /** Base half-width of the pile in uv-height units. */
  width?: SignalLike;
  /** Dispenser ribbon pouring from the frame top onto the tip: 0 = none. */
  stream?: SignalLike;
  /** Wobble drive — feed a bass/kick signal so the cream shivers. */
  energy?: SignalLike;
}

/**
 * A soft-serve pile: a cone-profiled tower whose silhouette and shading are a
 * helical coil — the phase rides upward with `flow`, so the swirl forever
 * spirals up as if fresh cream keeps landing, while a wiggling dispenser
 * ribbon pours down from the frame top onto the tip. Premultiplied alpha so
 * it drops onto any backdrop via `over`. Pure (no passes), frame-clocked.
 */
export const softServe = defineModule(
  {
    name: "softServe",
    kind: "source",
    description:
      "Soft-serve ice cream pile: a swaying cone of spiraling coil ridges with a pour ribbon from the top (premultiplied alpha).",
    tags: ["ice-cream", "swirl", "spiral", "organic", "overlay", "audio-reactive"],
    example: 'softServe(ctx, { coils: 9, flow: 0.55, energy: bassSig })',
  },
  (ctx: BuildCtx, opts: SoftServeOpts = {}): TexNode => {
    const tint = opts.tint ?? [0.97, 0.8, 0.88];
    const tintU = vec3(ctx.uniformOf(tint[0]), ctx.uniformOf(tint[1]), ctx.uniformOf(tint[2]));
    const coils = ctx.uniformOf(opts.coils ?? 9);
    const flow = ctx.uniformOf(opts.flow ?? 0.55);
    const sway = ctx.uniformOf(opts.sway ?? 0.05);
    const ridge = ctx.uniformOf(opts.ridge ?? 0.55);
    const gloss = ctx.uniformOf(opts.gloss ?? 0.8);
    const height = ctx.uniformOf(opts.height ?? 0.74);
    const width = ctx.uniformOf(opts.width ?? 0.34);
    const stream = ctx.uniformOf(opts.stream ?? 0.7);
    const energy = ctx.uniformOf(opts.energy ?? 0);

    // Frame-clock time, NOT TSL `time` (wall clock) — keeps fixture replays deterministic.
    const t = ctx.uniformOf(ctx.time.now);
    const x = uv().x.sub(0.5).mul(surfaceAspect());
    const y = uv().y;

    const live = energy.mul(0.8).add(1); // audio wobble multiplies sway + coil depth
    const h = height.max(0.2);
    const yn = y.div(h).clamp(0, 1); // 0 at the base, 1 at the tip

    // Pile axis sways, anchored at the base.
    const xc = sin(yn.mul(2.6).add(t.mul(0.45))).mul(sway).mul(yn).mul(live);

    // Coil phase: crests climb the pile as t grows — the upward spiral.
    const ph = yn.mul(coils).sub(t.mul(flow)).mul(TAU);
    const wave = sin(ph);

    // Silhouette: cone profile bulged by the coil wave, rounded off at the tip.
    const profile = float(1).sub(yn).pow(0.72);
    const w = width.mul(profile).mul(wave.mul(ridge).mul(0.22).mul(live).add(1)).max(1e-4);
    const dx = x.sub(xc).abs();
    const capTop = float(1).sub(smoothstep(h.mul(0.985), h.mul(1.025), y));
    const body = smoothstep(w, w.mul(0.9), dx).mul(capTop);

    // Shading: lateral roundness, coil ridges sheared diagonally (the wrap),
    // and a glossy crest highlight.
    const nx = dx.div(w).clamp(0, 1);
    const round = float(1).sub(nx.mul(nx).mul(0.62));
    const coil = sin(ph.add(x.sub(xc).div(w).mul(0.85)));
    const shade = coil.mul(0.16).add(0.86);
    const spec = coil.max(0.0).pow(6).mul(float(1).sub(nx).max(0)).mul(gloss).mul(0.5);
    const creamCol = tintU.mul(round.mul(shade)).add(vec3(1.0, 0.98, 0.95).mul(spec));

    // Dispenser ribbon: pours DOWN from the frame top onto the tip.
    const tipX = sin(float(2.6).add(t.mul(0.45))).mul(sway).mul(live);
    const sx = tipX.add(sin(y.mul(26).add(t.mul(flow).mul(7))).mul(0.012));
    const ws = width.mul(0.14).mul(stream.clamp(0, 1)).max(1e-4);
    const above = smoothstep(h.mul(0.9), h.mul(1.02), y);
    const sBody = smoothstep(ws, ws.mul(0.55), x.sub(sx).abs()).mul(above).mul(stream.clamp(0, 1));
    const sShade = sin(y.mul(34).add(t.mul(flow).mul(9))).mul(0.12).add(0.88);
    const streamCol = tintU.mul(sShade);

    // Premultiplied composite: pile in front of the ribbon where they meet.
    const rgb = creamCol.mul(body).add(streamCol.mul(sBody).mul(float(1).sub(body)));
    const alpha = body.add(sBody.mul(float(1).sub(body))).clamp(0, 1);
    return texNode(vec4(rgb, alpha));
  },
);
