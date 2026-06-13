import { describe, expect, it } from "vitest";
import { Manifest } from "../src/param";
import { F } from "./helpers";

describe("Param / Manifest", () => {
  it("declares a float param with default and range", () => {
    const m = new Manifest();
    const p = m.float("speed", { default: 0.5, min: 0, max: 2 });
    expect(p.value).toBe(0.5);
    expect(p.signal().get(F(0))).toBe(0.5);
  });

  it("set clamps to range", () => {
    const m = new Manifest();
    const p = m.float("speed", { default: 0.5, min: 0, max: 2 });
    p.set(5);
    expect(p.value).toBe(2);
    p.set(-1);
    expect(p.value).toBe(0);
  });

  it("int params round to step", () => {
    const m = new Manifest();
    const p = m.int("count", { default: 4, min: 1, max: 10 });
    p.set(3.7);
    expect(p.value).toBe(4);
  });

  it("bool params toggle", () => {
    const m = new Manifest();
    const p = m.bool("invert", { default: false });
    p.set(true);
    expect(p.value).toBe(true);
  });

  it("param signal reflects later set() calls", () => {
    const m = new Manifest();
    const p = m.float("gain", { default: 1, min: 0, max: 4 });
    const s = p.signal();
    expect(s.get(F(0))).toBe(1);
    p.set(2.5);
    expect(s.get(F(1))).toBe(2.5);
  });

  it("rejects duplicate paths", () => {
    const m = new Manifest();
    m.float("speed", { default: 0, min: 0, max: 1 });
    expect(() => m.float("speed", { default: 0, min: 0, max: 1 })).toThrow(/duplicate/i);
  });

  it("rejects a default outside the range", () => {
    const m = new Manifest();
    expect(() => m.float("bad", { default: 9, min: 0, max: 1 })).toThrow();
  });

  it("serializes to a manifest JSON shape", () => {
    const m = new Manifest();
    m.float("speed", { default: 0.5, min: 0, max: 2, description: "how fast" });
    m.bool("invert", { default: false });
    const json = m.toJSON();
    expect(json).toEqual({
      speed: {
        type: "float",
        default: 0.5,
        min: 0,
        max: 2,
        description: "how fast",
        value: 0.5,
      },
      invert: { type: "bool", default: false, value: false },
    });
  });

  it("declares a color param and normalizes hex on set", () => {
    const m = new Manifest();
    const p = m.color("tint", { default: "#FF8800" });
    expect(p.value).toBe("#ff8800"); // defaults normalize too
    p.set("#ABC"); // #rgb shorthand expands
    expect(p.value).toBe("#aabbcc");
  });

  it("color set throws on a non-hex value", () => {
    const m = new Manifest();
    const p = m.color("tint", { default: "#ffffff" });
    expect(() => p.set("red")).toThrow(/#rrggbb/);
    expect(p.value).toBe("#ffffff"); // unchanged
  });

  it("color rejects an invalid default at declare time", () => {
    const m = new Manifest();
    expect(() => m.color("bad", { default: "blue" })).toThrow();
  });

  it("setNormalized is a no-op on color params", () => {
    const m = new Manifest();
    const p = m.color("tint", { default: "#112233" });
    p.setNormalized(0.7);
    expect(p.value).toBe("#112233");
  });

  it("color serializes with type and string value", () => {
    const m = new Manifest();
    m.color("tint", { default: "#112233", description: "a tint" });
    const j = m.toJSON() as Record<string, Record<string, unknown>>;
    expect(j.tint!.type).toBe("color");
    expect(j.tint!.value).toBe("#112233");
    expect(m.values().tint).toBe("#112233");
  });

  it("int params carry labels meta through to JSON", () => {
    const m = new Manifest();
    m.int("source", { default: 0, min: 0, max: 2, step: 1, labels: ["primary", "secondary", "own"] });
    const j = m.toJSON() as Record<string, Record<string, unknown>>;
    expect(j.source!.labels).toEqual(["primary", "secondary", "own"]);
  });

  describe("editable ranges", () => {
    it("setRange widens the clamp and re-exposes the new bounds", () => {
      const m = new Manifest();
      const p = m.float("size", { default: 1, min: 0, max: 1 });
      p.set(5);
      expect(p.value).toBe(1); // clamped to the declared max
      p.setRange(0, 10);
      expect(p.range()).toEqual([0, 10]);
      p.set(5);
      expect(p.value).toBe(5); // the widened bound now holds it
    });

    it("narrowing the range re-clamps the current value", () => {
      const m = new Manifest();
      const p = m.float("size", { default: 8, min: 0, max: 10 });
      p.setRange(0, 4);
      expect(p.value).toBe(4);
    });

    it("setNormalized maps onto the live (widened) range", () => {
      const m = new Manifest();
      const p = m.float("gain", { default: 1, min: 0, max: 2 });
      p.setRange(0, 10);
      p.setNormalized(0.5);
      expect(p.value).toBe(5);
    });

    it("int ranges snap bounds to integers and keep at least two values", () => {
      const m = new Manifest();
      const p = m.int("count", { default: 2, min: 1, max: 4 });
      p.setRange(0.2, 9.8);
      expect(p.range()).toEqual([0, 10]);
      p.setRange(3, 3);
      expect(p.range()).toEqual([3, 4]);
    });

    it("toJSON carries defaultRange only once overridden, and resetRange clears it", () => {
      const m = new Manifest();
      const p = m.float("size", { default: 1, min: 0, max: 2 });
      expect((p.toJSON() as Record<string, unknown>).defaultRange).toBeUndefined();
      p.setRange(0, 20);
      expect((p.toJSON() as Record<string, unknown>).defaultRange).toEqual([0, 2]);
      expect(p.rangeOverridden).toBe(true);
      p.resetRange();
      expect(p.range()).toEqual([0, 2]);
      expect(p.rangeOverridden).toBe(false);
      expect((p.toJSON() as Record<string, unknown>).defaultRange).toBeUndefined();
    });

    it("setRange rejects non-numeric params", () => {
      const m = new Manifest();
      const b = m.bool("invert", { default: false });
      expect(() => b.setRange(0, 1)).toThrow(/no numeric range/i);
      expect(b.range()).toBeNull();
    });

    it("labelled ints are not rangeable; plain floats are", () => {
      const m = new Manifest();
      const sel = m.int("source", { default: 0, min: 0, max: 2, labels: ["a", "b", "c"] });
      const size = m.float("size", { default: 1, min: 0, max: 2 });
      expect(sel.rangeable).toBe(false);
      expect(size.rangeable).toBe(true);
    });

    it("rangeOverrides round-trips through applyRanges", () => {
      const m = new Manifest();
      m.float("size", { default: 1, min: 0, max: 2 });
      m.float("speed", { default: 1, min: 0, max: 4 });
      m.get("size")!.setRange(0, 20);
      const overrides = m.rangeOverrides();
      expect(overrides).toEqual({ size: [0, 20] });

      const m2 = new Manifest();
      m2.float("size", { default: 1, min: 0, max: 2 });
      m2.applyRanges(overrides);
      expect(m2.get("size")!.range()).toEqual([0, 20]);
    });
  });

  describe("palette-index swatches", () => {
    it("carries swatches metadata into the manifest JSON", () => {
      const m = new Manifest();
      const swatches = [
        ["#000000", "#ffffff"],
        ["#ff0000", "#00ff00", "#0000ff"],
      ];
      m.float("color.palette", { default: 0, min: 0, max: 2, swatches });
      expect((m.toJSON()["color.palette"] as { swatches?: unknown }).swatches).toEqual(swatches);
    });

    it("rejects a swatch stop that is not #rrggbb", () => {
      const m = new Manifest();
      expect(() =>
        m.float("color.palette", { default: 0, min: 0, max: 1, swatches: [["#000000", "nope"]] }),
      ).toThrow();
    });
  });
});
