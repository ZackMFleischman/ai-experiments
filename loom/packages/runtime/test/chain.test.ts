import { vec4 } from "three/tsl";
import { describe, expect, it } from "vitest";
import { BuildCtx } from "../src/buildctx";
import {
  ChainHost,
  type EffectEntry,
  type EffectRegistry,
  type PrimitiveEffectEntry,
} from "../src/chain";
import { defineModule } from "../src/module";
import { texNode, type TexNode } from "../src/texnode";

// Bare BuildCtx: chain params never touch audio/time, so minimal fakes suffice.
const ctx = () => new BuildCtx({} as never, {} as never);

const passInput = (ctx: BuildCtx, opts: { input: TexNode }): TexNode => opts.input;

const prim = (
  name: string,
  factory: PrimitiveEffectEntry["factory"],
  chainParams: PrimitiveEffectEntry["chainParams"] = [],
): PrimitiveEffectEntry => ({ name, kind: "primitive", chainParams, factory });

const levels = prim(
  "levels",
  defineModule({ name: "levels", kind: "effect", description: "x" }, passInput),
  [{ name: "gain", type: "float", default: 1, min: 0, max: 2 }],
);
const glitch = prim(
  "glitch",
  defineModule({ name: "glitch", kind: "effect", description: "x" }, passInput),
  [{ name: "amount", type: "float", default: 0.6, min: 0, max: 1 }],
);
const boom = prim(
  "boom",
  defineModule({ name: "boom", kind: "effect", description: "x" }, () => {
    throw new Error("kaboom");
  }),
);

function registry(...entries: EffectEntry[]): EffectRegistry {
  const m = new Map(entries.map((e) => [e.name, e]));
  return { get: (n) => m.get(n), names: () => [...m.keys()] };
}

const base = (): TexNode => texNode(vec4(0, 0, 0, 1));

describe("ChainHost.plan", () => {
  it("assigns stable <effect>-<n> ids and validates effects", () => {
    const host = new ChainHost(() => registry(glitch, levels));
    const steps = host.plan([{ effect: "glitch" }, { effect: "levels" }]);
    expect(steps.map((s) => s.id)).toEqual(["glitch-1", "levels-2"]);
    expect(steps.every((s) => s.params.mix === 1)).toBe(true);
  });

  it("throws on an unknown effect (whole edit rejected)", () => {
    const host = new ChainHost(() => registry(glitch));
    expect(() => host.plan([{ effect: "nope" }])).toThrow(/unknown effect "nope"/);
  });

  it("carries knob values forward by surviving id (reorder preserves knobs)", () => {
    const host = new ChainHost(() => registry(glitch, levels));
    host.steps = host.plan([{ effect: "glitch" }, { effect: "levels" }]);
    host.steps[0]!.params.amount = 0.9; // a live tweak captured into the step
    // Reorder: same ids, flipped order, no params sent.
    const reordered = host.plan([
      { id: "levels-2", effect: "levels" },
      { id: "glitch-1", effect: "glitch" },
    ]);
    expect(reordered.map((s) => s.id)).toEqual(["levels-2", "glitch-1"]);
    expect(reordered.find((s) => s.id === "glitch-1")!.params.amount).toBe(0.9);
  });

  it("honors an explicit mix and explicit params override", () => {
    const host = new ChainHost(() => registry(glitch));
    const [s] = host.plan([{ effect: "glitch", mix: 0.5, params: { amount: 0.2 } }]);
    expect(s!.params.mix).toBe(0.5);
    expect(s!.params.amount).toBe(0.2);
  });
});

describe("ChainHost.fold", () => {
  it("declares fx.<id>.<param> and fx.<id>.mix on the manifest", () => {
    const host = new ChainHost(() => registry(glitch));
    host.steps = host.plan([{ effect: "glitch" }]);
    const c = ctx();
    host.fold(c, base());
    expect(c.manifest.get("fx.glitch-1.amount")?.type).toBe("float");
    expect(c.manifest.get("fx.glitch-1.mix")?.type).toBe("float");
  });

  it("a throwing step throws the whole fold (NFR-5 rejects the rebuild)", () => {
    const host = new ChainHost(() => registry(glitch, boom));
    host.steps = host.plan([{ effect: "glitch" }, { effect: "boom" }]);
    expect(() => host.fold(ctx(), base())).toThrow(/kaboom/);
  });
});

describe("ChainHost value round-trip", () => {
  it("captures live values and re-applies them after a rebuild", () => {
    const host = new ChainHost(() => registry(glitch));
    host.steps = host.plan([{ effect: "glitch" }]);
    const c1 = ctx();
    host.fold(c1, base());
    c1.manifest.get("fx.glitch-1.amount")!.set(0.8);
    host.captureValues(c1.manifest);
    expect(host.steps[0]!.params.amount).toBe(0.8);

    const c2 = ctx(); // fresh build (e.g. scene HMR)
    host.fold(c2, base());
    expect(c2.manifest.get("fx.glitch-1.amount")!.value).toBe(0.6); // code default
    host.applyValues(c2.manifest);
    expect(c2.manifest.get("fx.glitch-1.amount")!.value).toBe(0.8); // tuned value restored
  });
});

describe("ChainHost.serialize", () => {
  it("emits primitive steps for save-as", () => {
    const host = new ChainHost(() => registry(glitch, levels));
    host.steps = host.plan([{ effect: "glitch", params: { amount: 0.7 } }]);
    const data = host.serialize();
    expect(data.steps).toEqual([
      { id: "glitch-1", effect: "glitch", params: { amount: 0.7 }, mix: 1 },
    ]);
  });

  it("refuses to save a chain containing a composite (one level deep)", () => {
    const composite: EffectEntry = {
      name: "combo",
      kind: "composite",
      steps: [{ id: "glitch-1", effect: "glitch", params: {} }],
    };
    const host = new ChainHost(() => registry(glitch, composite));
    host.steps = host.plan([{ effect: "combo" }]);
    expect(() => host.serialize()).toThrow(/only primitive effects/);
  });
});

describe("ChainHost composite fold", () => {
  it("namespaces inner step params under fx.<id>.<inner>.<param>", () => {
    const composite: EffectEntry = {
      name: "combo",
      kind: "composite",
      steps: [{ id: "glitch-1", effect: "glitch", params: { amount: 0.3 } }],
    };
    const host = new ChainHost(() => registry(glitch, composite));
    host.steps = host.plan([{ effect: "combo" }]);
    const c = ctx();
    host.fold(c, base());
    expect(c.manifest.get("fx.combo-1.glitch-1.amount")?.type).toBe("float");
    expect(c.manifest.get("fx.combo-1.mix")?.type).toBe("float");
  });
});
