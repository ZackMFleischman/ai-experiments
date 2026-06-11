import { describe, expect, it } from "vitest";
import {
  InstanceArgs,
  RequestMsg,
  ResponseMsg,
  SetParamArgs,
} from "../src/protocol";

describe("RequestMsg", () => {
  it("parses every request type", () => {
    for (const type of ["get_session", "get_manifest", "set_param", "screenshot"]) {
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
