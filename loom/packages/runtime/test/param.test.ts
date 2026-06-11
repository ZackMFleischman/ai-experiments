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
});
