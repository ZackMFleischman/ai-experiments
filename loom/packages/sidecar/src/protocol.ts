import { z } from "zod";

/**
 * The WS wire contract between sidecar and engine. The sidecar sends `req`
 * envelopes; the engine answers each with exactly one `res` envelope carrying
 * the same id. Shared by both sides (the engine imports this file through the
 * `@loom/sidecar/protocol` alias), so keep it free of Node and DOM APIs.
 */

export const DEFAULT_WS_PORT = 7341;

export const RequestType = z.enum(["get_session", "get_manifest", "set_param", "screenshot"]);
export type RequestType = z.infer<typeof RequestType>;

export const RequestMsg = z.object({
  id: z.string().min(1),
  kind: z.literal("req"),
  type: RequestType,
  args: z.record(z.string(), z.unknown()).default({}),
});
export type RequestMsg = z.infer<typeof RequestMsg>;

export const ResponseMsg = z.discriminatedUnion("ok", [
  z.object({ id: z.string().min(1), kind: z.literal("res"), ok: z.literal(true), result: z.unknown() }),
  z.object({ id: z.string().min(1), kind: z.literal("res"), ok: z.literal(false), error: z.string().min(1) }),
]);
export type ResponseMsg = z.infer<typeof ResponseMsg>;

// ---- per-request args (validated engine-side; M2 has a single "live" instance) ----

export const InstanceArgs = z.object({ instance: z.string().default("live") });
export type InstanceArgs = z.infer<typeof InstanceArgs>;

export const SetParamArgs = z.object({
  instance: z.string().default("live"),
  path: z.string().min(1),
  value: z.union([z.number(), z.boolean()]),
});
export type SetParamArgs = z.infer<typeof SetParamArgs>;

// ---- results (produced by the engine, consumed by MCP clients) ----

export const SessionSnapshot = z.object({
  scene: z.string().nullable(),
  instance: z.string().nullable(),
  instanceError: z.string().nullable(),
  audioMode: z.string(),
  bpm: z.number(),
  rms: z.number(),
  onsetCount: z.number(),
  fps: z.number(),
  frame: z.number(),
  paramPaths: z.array(z.string()),
});
export type SessionSnapshot = z.infer<typeof SessionSnapshot>;

export const ParamDescriptor = z.looseObject({
  type: z.enum(["float", "int", "bool"]),
  value: z.union([z.number(), z.boolean()]),
  default: z.union([z.number(), z.boolean()]),
});
export const ManifestResult = z.object({
  instance: z.string(),
  params: z.record(z.string(), ParamDescriptor),
});
export type ManifestResult = z.infer<typeof ManifestResult>;

export const SetParamResult = z.object({
  instance: z.string(),
  path: z.string(),
  value: z.union([z.number(), z.boolean()]),
});
export type SetParamResult = z.infer<typeof SetParamResult>;

export const ScreenshotResult = z.object({
  mime: z.literal("image/png"),
  base64: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frame: z.number(),
});
export type ScreenshotResult = z.infer<typeof ScreenshotResult>;
