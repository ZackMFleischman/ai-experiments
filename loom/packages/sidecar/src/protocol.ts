import { z } from "zod";

/**
 * The WS wire contract between sidecar and engine. The sidecar sends `req`
 * envelopes; the engine answers each with exactly one `res` envelope carrying
 * the same id. Shared by both sides (the engine imports this file through the
 * `@loom/sidecar/protocol` alias), so keep it free of Node and DOM APIs.
 */

export const DEFAULT_WS_PORT = 7341;

/**
 * The full engine command vocabulary. The MCP sidecar exposes the agent
 * subset; panic/resume/set_transport/arm_agent_commit are human-only and
 * reachable only from the Console (BroadcastChannel uses these same
 * envelopes — one dispatch in the engine serves both).
 */
export const RequestType = z.enum([
  "get_session",
  "get_manifest",
  "set_param",
  "modulate_param",
  "clear_modulation",
  "screenshot",
  "create_instance",
  "destroy_instance",
  "stage",
  "unstage",
  "commit",
  "panic",
  "resume",
  "set_transport",
  "set_audio",
  "arm_agent_commit",
  "midi_learn",
  "midi_unbind",
]);
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

export const ModulateParamArgs = z.object({
  instance: z.string().default("live"),
  path: z.string().min(1),
  /** Spec JSON — validated engine-side against @loom/runtime's ModulatorSpec (FR-11). */
  modulator: z.record(z.string(), z.unknown()),
});
export type ModulateParamArgs = z.infer<typeof ModulateParamArgs>;

export const ClearModulationArgs = z.object({
  instance: z.string().default("live"),
  path: z.string().min(1),
});
export type ClearModulationArgs = z.infer<typeof ClearModulationArgs>;

export const CreateInstanceArgs = z.object({
  scene: z.string().min(1),
  id: z.string().min(1).optional(),
});
export type CreateInstanceArgs = z.infer<typeof CreateInstanceArgs>;

export const CommitArgs = z.object({
  durationFrames: z.number().int().min(0).max(600).default(60),
});
export type CommitArgs = z.infer<typeof CommitArgs>;

export const ArmAgentCommitArgs = z.object({ armed: z.boolean() });
export type ArmAgentCommitArgs = z.infer<typeof ArmAgentCommitArgs>;

export const TransportArgs = z.object({
  bpm: z.number().positive().optional(),
  tap: z.boolean().optional(),
});
export type TransportArgs = z.infer<typeof TransportArgs>;

export const SetAudioArgs = z.object({
  mode: z.enum(["mic", "test"]),
  deviceId: z.string().optional(),
});
export type SetAudioArgs = z.infer<typeof SetAudioArgs>;

/**
 * MIDI-learn target: a param path on an instance (resolved to its scene
 * engine-side — bindings are durable across instance churn) or on "globals".
 */
export const MidiTargetArgs = z.object({
  instance: z.string().default("live"),
  path: z.string().min(1),
});
export type MidiTargetArgs = z.infer<typeof MidiTargetArgs>;

// ---- results (produced by the engine, consumed by MCP clients) ----

export const InstanceStatus = z.enum(["ok", "frozen", "rejected"]);
export type InstanceStatus = z.infer<typeof InstanceStatus>;

export const AudioDevice = z.object({ id: z.string(), label: z.string() });
export type AudioDevice = z.infer<typeof AudioDevice>;

/** A persisted MIDI binding (shape mirrors @loom/runtime's BindingSchema). */
export const MidiBinding = z.object({
  cc: z.number(),
  ch: z.number().nullable(),
  scene: z.string(),
  path: z.string(),
});
export type MidiBinding = z.infer<typeof MidiBinding>;

export const MidiStatus = z.object({
  /** "off" = no WebMIDI access yet (Chrome gates it behind a permission). */
  status: z.enum(["off", "ready"]),
  devices: z.array(z.string()),
  /** Armed MIDI-learn target, or null. */
  learning: z.object({ scene: z.string(), path: z.string() }).nullable(),
});
export type MidiStatus = z.infer<typeof MidiStatus>;

export const ModulatorSummary = z.object({
  path: z.string(),
  type: z.string(),
  /** Non-null = detached: eval threw or the param vanished on rebuild. */
  error: z.string().nullable(),
});
export type ModulatorSummary = z.infer<typeof ModulatorSummary>;

export const InstanceInfo = z.object({
  id: z.string(),
  scene: z.string(),
  status: InstanceStatus,
  error: z.string().nullable(),
  paramPaths: z.array(z.string()),
  modulators: z.array(ModulatorSummary),
});
export type InstanceInfo = z.infer<typeof InstanceInfo>;

export const SessionSnapshot = z.object({
  // Live-instance views (kept flat for M2 compatibility and quick reads).
  scene: z.string().nullable(),
  instance: z.string().nullable(),
  instanceError: z.string().nullable(),
  paramPaths: z.array(z.string()),
  // Stage (M3)
  instances: z.array(InstanceInfo),
  live: z.string().nullable(),
  staged: z.string().nullable(),
  /** Crossfade progress 0..1, or null when not fading. */
  mix: z.number().nullable(),
  panicked: z.boolean(),
  agentCommitArmed: z.boolean(),
  availableScenes: z.array(z.string()),
  // World
  audioMode: z.string(),
  audioDevices: z.array(AudioDevice),
  /** Input-rack channel values (live meters), tuned via instance "globals". */
  inputs: z.record(z.string(), z.number()),
  midi: MidiStatus,
  bindings: z.array(MidiBinding),
  bpm: z.number(),
  rms: z.number(),
  onsetCount: z.number(),
  fps: z.number(),
  frame: z.number(),
});
export type SessionSnapshot = z.infer<typeof SessionSnapshot>;

export const CreateInstanceResult = z.object({
  instance: z.string(),
  scene: z.string(),
  paramPaths: z.array(z.string()),
});
export type CreateInstanceResult = z.infer<typeof CreateInstanceResult>;

export const ParamDescriptor = z.looseObject({
  type: z.enum(["float", "int", "bool"]),
  value: z.union([z.number(), z.boolean()]),
  default: z.union([z.number(), z.boolean()]),
  /** Active modulator config, or null when the param is hand-driven (FR-8). */
  modulator: z.record(z.string(), z.unknown()).nullable().optional(),
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

export const ModulateParamResult = z.object({
  instance: z.string(),
  path: z.string(),
  modulator: z.record(z.string(), z.unknown()),
});
export type ModulateParamResult = z.infer<typeof ModulateParamResult>;

export const ClearModulationResult = z.object({
  instance: z.string(),
  path: z.string(),
  cleared: z.boolean(),
});
export type ClearModulationResult = z.infer<typeof ClearModulationResult>;

export const ScreenshotResult = z.object({
  mime: z.literal("image/png"),
  base64: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frame: z.number(),
});
export type ScreenshotResult = z.infer<typeof ScreenshotResult>;
