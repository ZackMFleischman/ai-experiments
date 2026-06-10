import { defineScene } from "@loom/runtime";
import { mix, sin, time, uv, vec2, vec3, vec4 } from "three/tsl";

export default defineScene({
  name: "hello",
  build() {
    const p = uv().sub(vec2(0.5));
    const d = p.length();

    const rings = sin(d.mul(40).sub(time.mul(2))).mul(0.5).add(0.5);
    const ink = vec3(0.05, 0.06, 0.12);
    const glow = vec3(0.9, 0.45, 0.95);
    const color = mix(ink, glow, rings.mul(d.oneMinus()));

    return { colorNode: vec4(color, 1) };
  },
});
