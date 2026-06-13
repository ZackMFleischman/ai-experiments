import { Signal, defineScene, integrateSignal } from "@loom/runtime";
import { parseHex } from "../modules/_shared";
import { lag } from "../modules/control/lag";
import { lfo } from "../modules/control/lfo";
import { bloom } from "../modules/effects/bloom";
import { displace } from "../modules/effects/displace";
import { kaleidoZoom } from "../modules/effects/kaleidoZoom";
import { mixer } from "../modules/effects/mixer";
import { over } from "../modules/effects/over";
import { vignette } from "../modules/effects/vignette";
import { checker } from "../modules/sources/checker";
import { gradient } from "../modules/sources/gradient";
import { softServe } from "../modules/sources/softServe";
import { sprinkles } from "../modules/sources/sprinkles";

/**
 * Soft serve forever: the swirl pours from the top and coils upward into a
 * cone while the whole parlor recedes through an endless spiral fractal
 * (kaleidoZoom run in reverse — it zooms OUT), and candy sprinkles get flung
 * in from every angle on kick bursts and beat cadences. The cream color is a
 * live color-chooser param; the backdrop is waffle-cone and cream.
 */
export default defineScene({
  name: "soft-serve",
  description:
    "Soft-serve cream pours and spirals up into a cone that recedes through an infinite spiral fractal, sprinkles bursting in from all angles over a waffle-cone backdrop.",
  tags: ["ice-cream", "kaleidoscope", "fractal", "particles", "audio-reactive"],
  build(ctx) {
    // ---- params: the human's mixing board (groups: cream / spiral / sprinkles / bg / finish)
    const colP = ctx.manifest.color("cream.color", { default: "#f7b9d7", description: "soft-serve cream color (the chooser)" });
    const coils = ctx.float("cream.coils", { default: 9, min: 4, max: 16, description: "coil ridges stacked up the pile" });
    const flow = ctx.float("cream.flow", { default: 0.55, min: -2, max: 2, description: "pour speed — the swirl spirals upward (negative reverses)" });
    const sway = ctx.float("cream.sway", { default: 0.05, min: 0, max: 0.2, description: "side-to-side sway of the pile" });
    const ridgeP = ctx.float("cream.ridge", { default: 0.55, min: 0, max: 1, description: "coil bulge depth (0 = smooth cone)" });
    const gloss = ctx.float("cream.gloss", { default: 0.8, min: 0, max: 2, description: "sheen on each coil crest" });
    const streamP = ctx.float("cream.stream", { default: 0.8, min: 0, max: 1, description: "dispenser ribbon from the top of frame" });
    const wobble = ctx.float("cream.wobble", { default: 0.7, min: 0, max: 2, description: "how hard the bass shivers the cream" });
    const dive = ctx.float("spiral.dive", { default: -0.1, min: -1, max: 1, description: "fractal zoom rate (octaves/sec; negative = zoom OUT forever)" });
    const punch = ctx.float("spiral.punch", { default: 2.5, min: 0, max: 8, description: "kick thrust outward through the spiral (octaves)" });
    const glide = ctx.float("spiral.glide", { default: 0.5, min: 0.05, max: 2, description: "kick-thrust smoothing (seconds)" });
    const segments = ctx.int("spiral.segments", { default: 7, min: 2, max: 16, description: "fractal fold wedge count" });
    const twist = ctx.float("spiral.twist", { default: 0.9, min: -3, max: 3, description: "spiral rotation per zoom octave (radians)" });
    const amount = ctx.float("sprinkles.amount", { default: 18, min: 0, max: 48, description: "baseline sprinkles in the air" });
    const burstP = ctx.float("sprinkles.burst", { default: 16, min: 0, max: 40, description: "extra sprinkles flung per kick" });
    const sprSize = ctx.float("sprinkles.size", { default: 0.02, min: 0.005, max: 0.06, description: "sprinkle rod length" });
    const cadence = ctx.float("sprinkles.cadence", { default: 0.45, min: 0.05, max: 2, description: "toss cadence (flights/sec)" });
    const waffle = ctx.float("bg.waffle", { default: 0.35, min: 0, max: 1, description: "waffle-cone grid strength in the backdrop" });
    const warp = ctx.float("bg.warp", { default: 0.04, min: 0, max: 0.2, description: "melty warp on the backdrop" });
    const glow = ctx.float("finish.bloom", { default: 0.5, min: 0, max: 2, description: "glow on sprinkles and sheen" });
    const vig = ctx.float("finish.vignette", { default: 0.55, min: 0, max: 1, description: "corner darkening" });

    // Parlor palette: cocoa bg · waffle edge · cream cores · vanilla accent.
    ctx.palette.own(["#3a2218", "#8a5a33", "#f6e7cd", "#f4b8d0", "#fff1d6"]);

    // ---- world: input rack channels
    const kick = ctx.input("kick"); // bass onsets → punchy envelope
    const bass = ctx.input("bass"); // sustained low-end weight

    // The cream color chooser → three channel signals (parsed once per change).
    let hex = "";
    let rgb: [number, number, number] = [1, 1, 1];
    const chan = (i: 0 | 1 | 2) =>
      new Signal(() => {
        if (colP.value !== hex) {
          hex = colP.value;
          rgb = parseHex(hex);
        }
        return rgb[i];
      });

    // ---- backdrop: creamy radial wash × waffle-cone grid, melted slightly
    const wash = gradient(ctx, { mode: "radial", scroll: 0.015, repeat: 1.4 });
    const cone = checker(ctx, { count: 16, line: 0.18, scroll: 0.04, colorA: "#6f4226", colorB: "#c98e54" });
    const parlor = mixer(ctx, { input: wash, b: cone, mode: "multiply", mix: waffle.signal() });
    const melted = displace(ctx, { input: parlor, amount: warp.signal(), scale: 2.2, speed: 0.18 });

    // ---- the swirl: bass shivers it, kick gives a little jolt
    const wobSig = wobble.signal();
    const shiver = new Signal((f) => bass.get(f) * wobSig.get(f) + kick.get(f) * 0.35);
    const swirl = softServe(ctx, {
      tint: [chan(0), chan(1), chan(2)],
      coils: coils.signal(),
      flow: flow.signal(),
      sway: sway.signal(),
      ridge: ridgeP.signal(),
      gloss: gloss.signal(),
      stream: streamP.signal(),
      energy: shiver,
    });

    // ---- infinite fractal: the plated cone recedes forever (negative rate =
    // zoom out); each kick thrusts it further out, lagged so the velocity
    // stays continuous instead of lurching.
    const diveSig = dive.signal();
    const punchSig = punch.signal();
    const thrust = lag(ctx, { input: kick, seconds: glide.signal() });
    const depth = integrateSignal(new Signal((f) => diveSig.get(f) - thrust.get(f) * punchSig.get(f)));
    const plated = over(ctx, { input: melted, overlay: swirl });
    const infinite = kaleidoZoom(ctx, {
      input: plated,
      zoom: depth,
      segments: segments.signal(),
      twist: twist.signal(),
    });

    // The hero cone rides crisp in front of its own infinite reflections.
    const hero = ctx.layer("cream", swirl);
    const staged = over(ctx, { input: infinite, overlay: hero });

    // ---- sprinkles: kick bursts + a slow beat cadence wave set how many fly
    const amountSig = amount.signal();
    const burstSig = burstP.signal();
    const wave = lfo(ctx, { shape: "sine", periodBeats: 4 });
    const flying = new Signal(
      (f) => amountSig.get(f) * (0.45 + 0.55 * wave.get(f)) + kick.get(f) * burstSig.get(f),
    );
    const storm = ctx.layer(
      "toppings",
      sprinkles(ctx, { count: flying, size: sprSize.signal(), cadence: cadence.signal(), burst: kick }),
    );
    const topped = over(ctx, { input: staged, overlay: storm });

    // ---- finish
    const lit = bloom(ctx, { input: topped, level: 0.65, intensity: glow.signal(), radius: 18 });
    return vignette(ctx, { input: lit, amount: vig.signal(), radius: 0.75 });
  },
});
