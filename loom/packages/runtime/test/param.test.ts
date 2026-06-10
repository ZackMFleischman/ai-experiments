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
});
