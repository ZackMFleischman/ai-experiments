import type { BuildCtx, Pass, TexNode } from "@loom/runtime";
import { lag } from "../modules/control/lag";
import { lfo } from "../modules/control/lfo";
import { colorize } from "../modules/effects/colorize";
import { feedback } from "../modules/effects/feedback";
import { flyby } from "../modules/effects/flyby";
import { glitch } from "../modules/effects/glitch";
import { kaleido } from "../modules/effects/kaleido";
import { kaleidoZoom } from "../modules/effects/kaleidoZoom";
import { levels } from "../modules/effects/levels";
import { over } from "../modules/effects/over";
import { paletteMap } from "../modules/effects/paletteMap";
import { pixelate } from "../modules/effects/pixelate";
import { transform } from "../modules/effects/transform";
import { blobs } from "../modules/sources/blobs";
import { fireflies } from "../modules/sources/fireflies";
import { image } from "../modules/sources/image";
import { mandelbrot } from "../modules/sources/mandelbrot";
import { noise } from "../modules/sources/noise";
import { noodles } from "../modules/sources/noodles";
import { osc } from "../modules/sources/osc";
import { pulseRings } from "../modules/sources/pulseRings";
import { spriteSwarm } from "../modules/sources/spriteSwarm";
import { video } from "../modules/sources/video";
import { box } from "../modules/geo/box";
import { model } from "../modules/geo/model";
import { orbitCam } from "../modules/geo/orbitCam";
import { sphere } from "../modules/geo/sphere";
import { torus } from "../modules/geo/torus";
import { render3d } from "../modules/sources/render3d";
import { blackInput, makeCtx, markerInput, type DiscoveredModule, type Harness } from "./harness";

/**
 * Required-opts registry: how to build each stdlib module minimally. Effects
 * receive the harness input so pass-ordering is observable. A module
 * discovered on disk but missing here fails the tier-1 completeness test —
 * that is the "new modules merge with their tests" rule, mechanized: add your
 * module's case (and any module-specific assertions) alongside the module.
 */
export type ModuleCase = (ctx: BuildCtx, input: TexNode) => unknown;

const ASSET = new URL("../assets/hippos/hippo1.png", import.meta.url).href;
const CLIP = new URL("../assets/test/clip.mp4", import.meta.url).href;
const CUBE = new URL("../assets/test/cube.glb", import.meta.url).href;

export const CASES: Record<string, ModuleCase> = {
  // control
  lag: (ctx) => lag(ctx, { input: ctx.input("kick"), seconds: 0.1 }),
  lfo: (ctx) => lfo(ctx, { shape: "sine", periodBeats: 4 }),
  // sources
  blobs: (ctx) => blobs(ctx, {}),
  fireflies: (ctx) => fireflies(ctx, {}),
  image: (ctx) => image(ctx, { url: ASSET }),
  mandelbrot: (ctx) => mandelbrot(ctx, {}),
  noise: (ctx) => noise(ctx, {}),
  noodles: (ctx) => noodles(ctx, { energy: ctx.input("kick") }),
  osc: (ctx) => osc(ctx, {}),
  pulseRings: (ctx) => pulseRings(ctx, { energy: ctx.input("kick") }),
  spriteSwarm: (ctx) => spriteSwarm(ctx, { url: ASSET, cols: 3, rows: 2 }),
  video: (ctx) => video(ctx, { url: CLIP }),
  render3d: (ctx) => render3d(ctx, { world: box(ctx, { spin: 0.5 }), cam: orbitCam(ctx, {}) }),
  // geo
  box: (ctx) => box(ctx, { spin: 0.5 }),
  sphere: (ctx) => sphere(ctx, { glow: ctx.input("kick") }),
  torus: (ctx) => torus(ctx, { tumble: 0.4 }),
  orbitCam: (ctx) => orbitCam(ctx, { speed: 0.5 }),
  model: (ctx) => model(ctx, { url: CUBE, spin: 0.3 }),
  // effects
  colorize: (ctx, input) => colorize(ctx, { input }),
  feedback: (ctx, input) => feedback(ctx, { input }),
  flyby: (ctx, input) => flyby(ctx, { input, urls: [ASSET] }),
  glitch: (ctx, input) => glitch(ctx, { input }),
  kaleido: (ctx, input) => kaleido(ctx, { input }),
  kaleidoZoom: (ctx, input) => kaleidoZoom(ctx, { input }),
  levels: (ctx, input) => levels(ctx, { input }),
  over: (ctx, input) => over(ctx, { input, overlay: blackInput() }),
  paletteMap: (ctx, input) => paletteMap(ctx, { input }),
  pixelate: (ctx, input) => pixelate(ctx, { input }),
  transform: (ctx, input) => transform(ctx, { input }),
};

export interface BuiltCase {
  h: Harness;
  out: unknown;
  /** The marker pass the input carried in — effects must keep it first. */
  inputPasses: readonly Pass[];
}

/** Build a discovered module through its registry case on a fresh harness. */
export function buildCase(d: DiscoveredModule): BuiltCase {
  const make = CASES[d.name];
  if (!make) throw new Error(`no test case for module "${d.name}" — add it to content/test/cases.ts`);
  const h = makeCtx();
  const { input, marker } = markerInput();
  const out = make(h.ctx, input);
  h.ctx.finalize(); // what buildInstance does after build() (palette.source)
  return { h, out, inputPasses: [marker] };
}
