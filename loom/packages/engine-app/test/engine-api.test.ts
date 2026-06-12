// @vitest-environment happy-dom
import {
  BindingStore,
  defineModule,
  defineScene,
  Events,
  InputRegistry,
  PaletteRegistry,
  Signal,
  Stage,
  texNode,
  TimeBus,
  type AudioBusLike,
  type BuildCtx,
  type EffectRegistry,
  type PrimitiveEffectEntry,
  type TexNode,
} from "@loom/runtime";
import { vec4 } from "three/tsl";
import { describe, expect, it } from "vitest";
import { EngineApi, type EngineDeps } from "../src/engine-api";
import { SessionStore } from "../src/session";

/** The audience-safety gates and state serialization EngineApi owns — the
 * highest-value logic that previously had NO unit coverage (validators only
 * exercise the happy paths). */

const silentAudio: AudioBusLike & { mode: string; startMic(): Promise<void>; startTest(): void } = {
  rms: new Signal(() => 0),
  band: () => new Signal(() => 0),
  onset: () => new Events(() => []),
  mode: "test",
  startMic: () => Promise.resolve(),
  startTest: () => {},
};

const passInput = defineModule(
  { name: "glitch", kind: "effect", description: "x" },
  (_c: BuildCtx, opts: { input: TexNode }) => opts.input,
);
const glitch: PrimitiveEffectEntry = { name: "glitch", kind: "primitive", chainParams: [], factory: passInput };
const boom: PrimitiveEffectEntry = {
  name: "boom",
  kind: "primitive",
  chainParams: [],
  factory: defineModule({ name: "boom", kind: "effect", description: "x" }, () => {
    throw new Error("kaboom");
  }),
};
const registry: EffectRegistry = {
  get: (n) => (n === "glitch" ? glitch : n === "boom" ? boom : undefined),
  names: () => ["glitch", "boom"],
};

const scene = defineScene({
  name: "apitest",
  description: "engine-api test fixture",
  build(ctx) {
    ctx.float("speed", { default: 0.5, min: 0, max: 1 });
    ctx.bool("flag", { default: false });
    return ctx.layer("logo", texNode(vec4(0, 0, 0, 1)));
  },
});

function world() {
  const time = new TimeBus(120);
  const inputs = new InputRegistry({ audio: silentAudio });
  const palettes = new PaletteRegistry();
  const session = new SessionStore({ audio: silentAudio, time, inputs, palettes }, () => registry);
  const stage = new Stage();
  const bindings = new BindingStore();
  const scenes = new Map([[scene.name, scene]]);
  const deps: EngineDeps = {
    renderer: {} as never,
    canvas: document.createElement("canvas"),
    session,
    stage,
    audio: silentAudio,
    time,
    inputs,
    palettes,
    bindings,
    midiStatus: () => "off",
    midiDevices: () => [],
    midiRecent: () => [],
    persist: { globals() {}, palettes() {}, scene() {}, bindings() {} },
    audioDevices: () => [],
    refreshAudioDevices: () => {},
    getScenes: () => scenes,
    availableEffects: () => [{ name: "glitch", kind: "primitive" }],
    saveEffectChain: () => Promise.resolve({ path: "x" }),
    previewEffect: () => Promise.resolve("data:"),
    latestFrame: () => ({ frame: 0, now: 0, dt: 1 / 60 }),
    captureCanvas: () => Promise.reject(new Error("no canvas in tests")),
    fps: () => 60,
    rms: () => 0,
    onsetCount: () => 0,
    currentMix: () => null,
    panicInstanceId: () => null,
    panicScene: () => ({ name: "panic", status: "error", error: "none" }),
    setPanicInstance: () => {},
    fixtures: {
      record: () => Promise.reject(new Error("unused")),
      load: () => Promise.reject(new Error("unused")),
      shots: () => Promise.reject(new Error("unused")),
    },
    projects: {
      list: () => Promise.resolve([]),
      cached: () => [],
      save: () => Promise.reject(new Error("unused")),
      load: () => Promise.reject(new Error("unused")),
    },
  };
  const api = new EngineApi(deps, { agentCommitArmed: false });
  return { api, session, stage, bindings, deps };
}

const req = (type: string, args: Record<string, unknown> = {}) => ({
  id: "t",
  kind: "req" as const,
  type: type as never,
  args,
});

describe("EngineApi audience-safety gates", () => {
  it("agent set_chain on the LIVE chain throws unless armed; sandbox stays ungated", async () => {
    const { api, session, stage } = world();
    session.create(scene, "boot");
    stage.adoptLive("boot");
    session.create(scene, "sandbox");

    await expect(
      api.handleRequest(req("set_chain", { instance: "boot", steps: [{ effect: "glitch" }] }), "agent"),
    ).rejects.toThrow(/arming|arm agent commit/);
    // Humans are never gated; agent edits to a SANDBOX are free.
    await api.handleRequest(req("set_chain", { instance: "boot", steps: [{ effect: "glitch" }] }), "human");
    await api.handleRequest(req("set_chain", { instance: "sandbox", steps: [{ effect: "glitch" }] }), "agent");
    // Arming opens the live gate.
    api.agentCommitArmed = true;
    await api.handleRequest(req("set_chain", { instance: "boot", steps: [] }), "agent");
  });

  it("agent commit is gated; human-only verbs reject agents outright", async () => {
    const { api, session, stage } = world();
    session.create(scene, "boot");
    stage.adoptLive("boot");
    session.create(scene, "next");
    stage.stage("next");
    await expect(api.handleRequest(req("commit"), "agent")).rejects.toThrow(/not armed/);
    await expect(api.handleRequest(req("set_audio", { mode: "test" }), "agent")).rejects.toThrow(/human-only/);
    await expect(api.handleRequest(req("panic"), "agent")).rejects.toThrow(/human-only/);
  });

  it("a throwing chain step is rejected and the previous chain + instance survive (NFR-5)", async () => {
    const { api, session } = world();
    const e = session.create(scene, "sandbox");
    await api.handleRequest(req("set_chain", { instance: "sandbox", steps: [{ effect: "glitch" }] }), "agent");
    const instanceBefore = e.instance;
    const stepsBefore = e.chain.list().map((s) => s.id);
    await expect(
      api.handleRequest(req("set_chain", { instance: "sandbox", steps: [{ effect: "boom" }] }), "agent"),
    ).rejects.toThrow(/rejected/);
    expect(e.instance).toBe(instanceBefore); // old pixels keep running
    expect(e.chain.list().map((s) => s.id)).toEqual(stepsBefore);
    expect(e.builds).toBe(2); // create + the one good chain edit, not the bad one
  });

  it("rename refuses reserved names and protects the live instance alias", async () => {
    const { api, session, stage } = world();
    session.create(scene, "boot");
    stage.adoptLive("boot");
    for (const to of ["live", "globals", "actions"]) {
      await expect(api.handleRequest(req("rename_instance", { instance: "boot", to }), "human")).rejects.toThrow(
        /reserved/,
      );
    }
    const r = (await api.handleRequest(req("rename_instance", { instance: "boot", to: "deckA" }), "human")) as {
      instance: string;
    };
    expect(r.instance).toBe("deckA");
    expect(stage.live).toBe("deckA"); // the stage pointer followed the rename
  });
});

describe("EngineApi MIDI target resolution", () => {
  it("resolves an instance to its scene, rejects set-bindings on bool params and unknown actions", async () => {
    const { api, session, bindings } = world();
    session.create(scene, "boot");

    await api.handleRequest(req("midi_learn", { instance: "boot", path: "speed" }), "human");
    expect(bindings.learning?.scene).toBe("apitest"); // durable scene key, not the instance id

    await expect(
      api.handleRequest(req("midi_learn", { instance: "boot", path: "flag", mode: "set", value: 1 }), "human"),
    ).rejects.toThrow(/bool/);
    await expect(
      api.handleRequest(req("midi_learn", { instance: "actions", path: "live.sideways" }), "human"),
    ).rejects.toThrow(/unknown action/);
    await expect(
      api.handleRequest(req("midi_learn", { instance: "boot", path: "nope" }), "human"),
    ).rejects.toThrow(/unknown param/);
  });
});

describe("EngineApi state serialization", () => {
  it("snapshot carries the full per-instance shape", async () => {
    const { api, session, stage } = world();
    const e = session.create(scene, "boot");
    stage.adoptLive("boot");
    e.modulators.attach(e.instance.manifest, "speed", { type: "sine", periodSeconds: 2 });
    session.setChain("boot", [{ effect: "glitch" }], "logo");

    const s = api.snapshot();
    const inst = s.instances.find((i) => i.id === "boot")!;
    expect(inst.scene).toBe("apitest");
    expect(inst.status).toBe("ok");
    expect(inst.paramPaths).toContain("logo.layer.scale");
    expect(inst.modulators[0]).toMatchObject({ path: "speed", type: "sine", error: null });
    expect(inst.nodes[0]).toMatchObject({ id: "logo", parent: null });
    expect(inst.nodes[0]!.chain[0]!.effect).toBe("glitch");
    expect(typeof inst.frameMs).toBe("number");
    expect(inst.fixture).toBeNull();
    expect(s.live).toBe("boot");
  });

  it("liveStep wraps the healthy deck ring, skips pinned reserves, and is mash-safe mid-fade", () => {
    const { api, session, stage, deps } = world();
    session.create(scene, "a");
    stage.adoptLive("a");
    session.create(scene, "b");
    const p = session.create(scene, "warm");
    p.pinned = "panic";

    api.liveStep(1); // a -> b (the pinned reserve is not part of the ring)
    // liveStep commits with a 60-frame fade; finish it so live resolves.
    for (let i = 1; i <= 61; i++) stage.tick({ frame: i, now: i / 60, dt: 1 / 60 });
    expect(stage.live).toBe("b");

    api.liveStep(1); // starts the fade back to a...
    expect(stage.fading).toBe(true);
    api.liveStep(1); // ...and a mid-fade mash is ignored
    expect(stage.staged).toBe("a");
    void deps;
  });
});
