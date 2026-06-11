import { describe, expect, it } from "vitest";
import { fillRamp, PALETTE_STOPS, PaletteRegistry } from "../src/palette";

describe("PaletteRegistry", () => {
  it("declares 5 color stops per palette on its manifest", () => {
    const reg = new PaletteRegistry();
    for (const source of ["primary", "secondary"] as const) {
      for (let i = 0; i < PALETTE_STOPS; i++) {
        const p = reg.manifest.get(`palette.${source}.${i}`);
        expect(p?.type).toBe("color");
      }
    }
    expect(reg.manifest.paths()).toHaveLength(PALETTE_STOPS * 2);
  });

  it("stops() reflects live set_param writes", () => {
    const reg = new PaletteRegistry();
    reg.manifest.get("palette.primary.2")!.set("#00ff00");
    expect(reg.stops("primary")[2]).toBe("#00ff00");
    expect(reg.stops("secondary")).toHaveLength(PALETTE_STOPS);
  });
});

describe("fillRamp", () => {
  it("interpolates piecewise-linearly across the stops", () => {
    const data = new Uint8Array(256 * 4);
    fillRamp(data, ["#000000", "#000000", "#ffffff", "#ffffff", "#ffffff"]);
    expect(data[0]).toBe(0); // left edge = stop 0
    expect(data[255 * 4]).toBe(255); // right edge = stop 4
    expect(data[3]).toBe(255); // alpha opaque
    // x=128 sits at t=2.008 of 4 → just past stop 2 → white
    expect(data[128 * 4]).toBeGreaterThan(250);
    // x=32 sits at t≈0.5 between two black stops → black
    expect(data[32 * 4]).toBe(0);
  });
});
