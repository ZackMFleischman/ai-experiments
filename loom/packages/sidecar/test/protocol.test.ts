import { describe, expect, it } from "vitest";
import {
  ArmAgentCommitArgs,
  CommitArgs,
  CreateInstanceArgs,
  InstanceArgs,
  RequestMsg,
  ResponseMsg,
  SetParamArgs,
  TransportArgs,
} from "../src/protocol";

describe("RequestMsg", () => {
  it("parses every request type", () => {
    const types = [
      "get_session", "get_manifest", "set_param", "screenshot",
      "create_instance", "destroy_instance", "stage", "unstage", "commit",
      "panic", "resume", "set_transport", "arm_agent_commit",
    ];
    for (const type of types) {
      const msg = RequestMsg.parse({ id: "r1", kind: "req", type, args: {} });
      expect(msg.type).toBe(type);
    }
  });

  it("defaults args to an empty object", () => {
    const msg = RequestMsg.parse({ id: "r1", kind: "req", type: "get_session" });
    expect(msg.args).toEqual({});
  });

  it("rejects unknown types and missing ids", () => {
    expect(() => RequestMsg.parse({ id: "r1", kind: "req", type: "format_disk" })).toThrow();
    expect(() => RequestMsg.parse({ kind: "req", type: "get_session" })).toThrow();
    expect(() => RequestMsg.parse({ id: "", kind: "req", type: "get_session" })).toThrow();
  });
});

describe("ResponseMsg", () => {
  it("parses ok and error variants", () => {
    const ok = ResponseMsg.parse({ id: "r1", kind: "res", ok: true, result: { x: 1 } });
    expect(ok.ok).toBe(true);
    const err = ResponseMsg.parse({ id: "r1", kind: "res", ok: false, error: "nope" });
    expect(err.ok).toBe(false);
    if (!err.ok) expect(err.error).toBe("nope");
  });

  it("requires an error string on the failure variant", () => {
    expect(() => ResponseMsg.parse({ id: "r1", kind: "res", ok: false })).toThrow();
  });
});

describe("SetParamArgs", () => {
  it("defaults instance to live and accepts number or bool values", () => {
    const a = SetParamArgs.parse({ path: "trail", value: 0.5 });
    expect(a.instance).toBe("live");
    expect(SetParamArgs.parse({ path: "on", value: true }).value).toBe(true);
  });

  it("rejects a missing or empty path", () => {
    expect(() => SetParamArgs.parse({ value: 1 })).toThrow();
    expect(() => SetParamArgs.parse({ path: "", value: 1 })).toThrow();
  });

  it("rejects non-scalar values", () => {
    expect(() => SetParamArgs.parse({ path: "p", value: "high" })).toThrow();
    expect(() => SetParamArgs.parse({ path: "p", value: { v: 1 } })).toThrow();
  });
});

describe("InstanceArgs", () => {
  it("defaults instance to live", () => {
    expect(InstanceArgs.parse({}).instance).toBe("live");
    expect(InstanceArgs.parse({ instance: "other" }).instance).toBe("other");
  });
});

describe("M3 args", () => {
  it("create_instance requires a scene; id is optional", () => {
    expect(CreateInstanceArgs.parse({ scene: "pulse" })).toEqual({ scene: "pulse" });
    expect(CreateInstanceArgs.parse({ scene: "pulse", id: "x" }).id).toBe("x");
    expect(() => CreateInstanceArgs.parse({})).toThrow();
    expect(() => CreateInstanceArgs.parse({ scene: "" })).toThrow();
  });

  it("commit defaults to a 60-frame fade and bounds the duration", () => {
    expect(CommitArgs.parse({}).durationFrames).toBe(60);
    expect(CommitArgs.parse({ durationFrames: 0 }).durationFrames).toBe(0);
    expect(() => CommitArgs.parse({ durationFrames: -1 })).toThrow();
    expect(() => CommitArgs.parse({ durationFrames: 10_000 })).toThrow();
    expect(() => CommitArgs.parse({ durationFrames: 1.5 })).toThrow();
  });

  it("arm_agent_commit requires an explicit boolean", () => {
    expect(ArmAgentCommitArgs.parse({ armed: true }).armed).toBe(true);
    expect(() => ArmAgentCommitArgs.parse({})).toThrow();
  });

  it("set_transport takes bpm and/or tap", () => {
    expect(TransportArgs.parse({ bpm: 128 }).bpm).toBe(128);
    expect(TransportArgs.parse({ tap: true }).tap).toBe(true);
    expect(() => TransportArgs.parse({ bpm: 0 })).toThrow();
  });
});
