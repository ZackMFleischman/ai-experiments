import { describe, expect, it } from "vitest";
import { BindingStore } from "../src/bindings";
import { Manifest } from "../src/param";

describe("Param.setNormalized", () => {
  it("maps 0..1 onto a float's range", () => {
    const m = new Manifest();
    const p = m.float("punch", { default: 1.2, min: 0, max: 3 });
    p.setNormalized(0.5);
    expect(p.value).toBeCloseTo(1.5);
    p.setNormalized(1);
    expect(p.value).toBe(3);
    p.setNormalized(0);
    expect(p.value).toBe(0);
  });

  it("rounds ints", () => {
    const m = new Manifest();
    const p = m.int("steps", { default: 2, min: 0, max: 9 });
    p.setNormalized(0.5);
    expect(p.value).toBe(5);
  });

  it("treats >= 0.5 as true for bools", () => {
    const m = new Manifest();
    const p = m.bool("on", { default: false });
    p.setNormalized(0.7);
    expect(p.value).toBe(true);
    p.setNormalized(0.2);
    expect(p.value).toBe(false);
  });
});

describe("Manifest.values", () => {
  it("serializes current values flat (for tuned-state persistence)", () => {
    const m = new Manifest();
    m.float("a", { default: 0.5, min: 0, max: 1 });
    m.bool("b", { default: true });
    m.get("a")!.set(0.25);
    expect(m.values()).toEqual({ a: 0.25, b: true });
  });
});

describe("BindingStore", () => {
  it("learn arms a target; the next CC becomes its binding", () => {
    const store = new BindingStore();
    store.startLearn({ scene: "pulse", path: "punch" });
    expect(store.learning).toEqual({ scene: "pulse", path: "punch" });
    const writes: unknown[] = [];
    const r = store.handleCc({ cc: 21, ch: 0, value: 0.5 }, (s, p, v) => writes.push([s, p, v]));
    expect(r.learned).toEqual({ cc: 21, ch: 0, scene: "pulse", path: "punch" });
    expect(store.learning).toBeNull();
    expect(store.bindings).toHaveLength(1);
    // the learning gesture itself also applies, so the knob takes effect at once
    expect(writes).toEqual([["pulse", "punch", 0.5]]);
  });

  it("re-learning a target replaces its previous binding", () => {
    const store = new BindingStore();
    store.startLearn({ scene: "pulse", path: "punch" });
    store.handleCc({ cc: 21, ch: 0, value: 0 }, () => {});
    store.startLearn({ scene: "pulse", path: "punch" });
    store.handleCc({ cc: 40, ch: 1, value: 0 }, () => {});
    expect(store.bindings).toEqual([{ cc: 40, ch: 1, scene: "pulse", path: "punch" }]);
  });

  it("applies CC values to every matching binding only", () => {
    const store = new BindingStore();
    store.load([
      { cc: 21, ch: 0, scene: "pulse", path: "punch" },
      { cc: 21, ch: null, scene: "globals", path: "inputs.kick.threshold" },
      { cc: 22, ch: 0, scene: "pulse", path: "trail" },
    ]);
    const writes: unknown[] = [];
    store.handleCc({ cc: 21, ch: 0, value: 0.75 }, (s, p, v) => writes.push([s, p, v]));
    expect(writes).toEqual([
      ["pulse", "punch", 0.75],
      ["globals", "inputs.kick.threshold", 0.75],
    ]);
    // ch-bound binding does not fire for another channel; ch:null does
    const writes2: unknown[] = [];
    store.handleCc({ cc: 21, ch: 3, value: 0.1 }, (s, p, v) => writes2.push([s, p, v]));
    expect(writes2).toEqual([["globals", "inputs.kick.threshold", 0.1]]);
  });

  it("startLearn on the already-learning target cancels (toggle)", () => {
    const store = new BindingStore();
    store.startLearn({ scene: "pulse", path: "punch" });
    store.startLearn({ scene: "pulse", path: "punch" });
    expect(store.learning).toBeNull();
  });

  it("unbind removes a target's bindings", () => {
    const store = new BindingStore();
    store.load([
      { cc: 21, ch: 0, scene: "pulse", path: "punch" },
      { cc: 22, ch: 0, scene: "pulse", path: "trail" },
    ]);
    expect(store.unbind({ scene: "pulse", path: "punch" })).toBe(true);
    expect(store.bindings).toEqual([{ cc: 22, ch: 0, scene: "pulse", path: "trail" }]);
    expect(store.unbind({ scene: "pulse", path: "punch" })).toBe(false);
  });

  it("round-trips through JSON and ignores malformed entries", () => {
    const store = new BindingStore();
    store.load([
      { cc: 21, ch: 0, scene: "pulse", path: "punch" },
      { nope: true },
      "garbage",
    ]);
    expect(store.bindings).toEqual([{ cc: 21, ch: 0, scene: "pulse", path: "punch" }]);
    expect(JSON.parse(JSON.stringify(store.toJSON()))).toEqual([
      { cc: 21, ch: 0, scene: "pulse", path: "punch" },
    ]);
  });
});
