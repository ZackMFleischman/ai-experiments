import { Signal, defineScene } from "@loom/runtime";
import { feedback } from "../modules/effects/feedback";
import { kaleido } from "../modules/effects/kaleido";
import { levels } from "../modules/effects/levels";
import { image } from "../modules/sources/image";

const IMG_URL = new URL("../assets/VinylDJHippo.png", import.meta.url).href;
const TAU = Math.PI * 2;

/** Accumulate a rate signal (units/sec) into a running total — rate changes never jump phase. */
function integrate(rate: Signal<number>): Signal<number> {
  let acc = 0;
  return new Signal((f) => {
    acc += rate.get(f) * f.dt;
    return acc;
  });
}

export default defineScene({
  name: "vinyl",
  description:
    "A vinyl record spinning at 33rpm that bumps on the kick, refracted through a slowly turning kaleidoscope.",
  tags: ["image", "kaleidoscope", "audio-reactive", "vinyl"],
  build(ctx) {
    const rpm = ctx.float("rpm", { default: 33.3, min: -78, max: 78, description: "record spin speed (rpm, negative = reverse)" });
    const size = ctx.float("size", { default: 1.4, min: 0.2, max: 2, description: "base record scale" });
    const bump = ctx.float("bump", { default: 0.16, min: 0, max: 0.6, description: "kick scale-bump amount" });
    const segments = ctx.int("segments", { default: 8, min: 2, max: 16, description: "kaleidoscope wedge count" });
    const spin = ctx.float("spin", { default: 0.04, min: -0.5, max: 0.5, description: "kaleidoscope rotation (rev/s)" });
    const kal = ctx.float("kaleido", { default: 0.9, min: 0, max: 1, description: "kaleidoscope blend (0 = raw record)" });
    const zoom = ctx.float("zoom", { default: 1.6, min: 0.5, max: 4, description: "kaleidoscope magnification into the label" });
    const trail = ctx.float("trail", { default: 0.45, min: 0, max: 0.95, description: "feedback trail persistence" });

    const kick = ctx.input("kick"); // rack channel: bass onsets -> envelope

    const rpmSig = rpm.signal();
    const sizeSig = size.signal();
    const bumpSig = bump.signal();
    const spinSig = spin.signal();
    const zoomSig = zoom.signal();

    // Records turn clockwise: negative angle in CCW-positive math.
    const recordAngle = integrate(new Signal((f) => (-rpmSig.get(f) * TAU) / 60));
    const kaleidoAngle = integrate(new Signal((f) => spinSig.get(f) * TAU));
    const scale = new Signal((f) => sizeSig.get(f) * (1 + kick.get(f) * bumpSig.get(f)));

    const record = image(ctx, { url: IMG_URL, transform: { rotate: recordAngle, scale } });
    const folded = kaleido(ctx, {
      input: record,
      segments: segments.signal(),
      rotate: kaleidoAngle,
      zoom: new Signal((f) => zoomSig.get(f) * (1 + kick.get(f) * 0.15)), // radial breathe on the kick
      amount: kal.signal(),
    });
    const trails = feedback(ctx, { input: folded, amount: trail.signal() });
    return levels(ctx, { input: trails, gain: kick.map((k) => 1 + k * 0.25), gamma: 1.05 });
  },
});
