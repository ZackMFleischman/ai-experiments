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
  "set_chain",
  "save_chain",
  "preview_effect",
  "screenshot",
  "create_instance",
  "destroy_instance",
  "rename_instance",
  "stage",
  "unstage",
  "commit",
  "panic",
  "resume",
  "arm_panic_mode",
  "set_panic_instance",
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
  value: z.union([z.number(), z.boolean(), z.string()]),
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

export const RenameInstanceArgs = z.object({
  instance: z.string().default("live"),
  to: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, "letters, digits, - and _ (must start alphanumeric)"),
});
export type RenameInstanceArgs = z.infer<typeof RenameInstanceArgs>;

/** One desired chain step. `id` is omitted for a new step, kept for a surviving one. */
export const ChainStepInputSchema = z.object({
  id: z.string().min(1).optional(),
  effect: z.string().min(1),
  /** Initial knob values (sub-paths under fx.<id>); omitted = carry forward / defaults. */
  params: z.record(z.string(), z.union([z.number(), z.boolean()])).optional(),
  /** Wet/dry 0..1; omitted = carry forward or 1. */
  mix: z.number().min(0).max(1).optional(),
});
export type ChainStepInputSchema = z.infer<typeof ChainStepInputSchema>;

/**
 * Full-list chain edit (M6): the whole desired step list, so attach/detach/
 * reorder/insert are one idempotent verb. `restoreDefault` resets to the scene's
 * declared chain (ignores `steps`). Agent edits to the LIVE chain need arming.
 */
export const SetChainArgs = z
  .object({
    instance: z.string().default("live"),
    steps: z.array(ChainStepInputSchema).optional(),
    restoreDefault: z.boolean().optional(),
  })
  .refine((a) => a.restoreDefault === true || a.steps != null, {
    message: "set_chain needs steps[] (or restoreDefault: true)",
  });
export type SetChainArgs = z.infer<typeof SetChainArgs>;

/**
 * Render a candidate effect over an instance's current output for the picker
 * grid (Console-only — not an MCP tool). Returns a JPEG data URL.
 */
export const PreviewEffectArgs = z.object({
  instance: z.string().default("live"),
  effect: z.string().min(1),
});
export type PreviewEffectArgs = z.infer<typeof PreviewEffectArgs>;

/** Save the instance's current chain as a reusable composite effect (data file). */
export const SaveChainArgs = z.object({
  instance: z.string().default("live"),
  name: z
    .string()
    .regex(/^[a-z][a-zA-Z0-9]*$/, "saved-chain names are lowerCamelCase identifiers"),
  description: z.string().optional(),
});
export type SaveChainArgs = z.infer<typeof SaveChainArgs>;

export const CommitArgs = z.object({
  durationFrames: z.number().int().min(0).max(600).default(60),
});
export type CommitArgs = z.infer<typeof CommitArgs>;

export const ArmAgentCommitArgs = z.object({ armed: z.boolean() });
export type ArmAgentCommitArgs = z.infer<typeof ArmAgentCommitArgs>;

/** PANIC behavior: hold the last frame, or cut to the designated safe scene. */
export const PanicMode = z.enum(["hold", "scene"]);
export type PanicMode = z.infer<typeof PanicMode>;

/** PANIC executes the armed mode unless an explicit override is supplied. */
export const PanicArgs = z.object({ mode: PanicMode.optional() });
export type PanicArgs = z.infer<typeof PanicArgs>;

export const ArmPanicModeArgs = z.object({ mode: PanicMode });
export type ArmPanicModeArgs = z.infer<typeof ArmPanicModeArgs>;

/** Designate which existing instance the SAFE SCENE panic cuts to (Console). */
export const SetPanicInstanceArgs = z.object({ instance: z.string().min(1) });
export type SetPanicInstanceArgs = z.infer<typeof SetPanicInstanceArgs>;

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

/** One folded chain step, for `get_session`. Knob values come from `get_manifest`. */
export const ChainStepInfo = z.object({
  id: z.string(),
  effect: z.string(),
  kind: z.enum(["primitive", "composite"]),
  /** Current wet/dry mix 0..1. */
  mix: z.number(),
});
export type ChainStepInfo = z.infer<typeof ChainStepInfo>;

export const InstanceInfo = z.object({
  id: z.string(),
  scene: z.string(),
  status: InstanceStatus,
  error: z.string().nullable(),
  paramPaths: z.array(z.string()),
  modulators: z.array(ModulatorSummary),
  /** Post-effect chain steps in order (M6). */
  chain: z.array(ChainStepInfo),
  /** Successful builds (1 on create, ++ per rebuild) — validators assert "no rebuild". */
  builds: z.number().int(),
  /** Pinned role, if any: "panic" = the always-warm safe-scene instance. */
  pinned: z.literal("panic").nullable().default(null),
});
export type InstanceInfo = z.infer<typeof InstanceInfo>;

/** A chainable effect offered by the library (code primitive or saved composite). */
export const EffectInfo = z.object({
  name: z.string(),
  kind: z.enum(["primitive", "composite"]),
  description: z.string().optional(),
});
export type EffectInfo = z.infer<typeof EffectInfo>;

/** Health of the designated Panic Scene (FR-7/FR-10). */
export const PanicSceneInfo = z.object({
  name: z.string(),
  /** "ok" = a warm panic instance exists; "error" = it never built (PANIC holds). */
  status: z.enum(["ok", "error"]),
  /** Last build error, surfaced even when a previous good instance still runs. */
  error: z.string().nullable(),
});
export type PanicSceneInfo = z.infer<typeof PanicSceneInfo>;

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
  /** Armed PANIC behavior the button will execute (human-set, Console). */
  panicMode: PanicMode,
  /** Active PANIC mode, or null when not panicked. */
  panicActive: PanicMode.nullable(),
  /** The designated Panic Scene's name + build health. */
  panicScene: PanicSceneInfo,
  agentCommitArmed: z.boolean(),
  availableScenes: z.array(z.string()),
  /** Chainable effects for the "+ effect" picker and `set_chain` (M6). */
  availableEffects: z.array(EffectInfo),
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
  type: z.enum(["float", "int", "bool", "color"]),
  value: z.union([z.number(), z.boolean(), z.string()]),
  default: z.union([z.number(), z.boolean(), z.string()]),
  /** Value names for int selectors (palette.source) — UI renders a toggle. */
  labels: z.array(z.string()).optional(),
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
  value: z.union([z.number(), z.boolean(), z.string()]),
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

export const SetChainResult = z.object({
  instance: z.string(),
  chain: z.array(ChainStepInfo),
});
export type SetChainResult = z.infer<typeof SetChainResult>;

export const SaveChainResult = z.object({
  saved: z.string(),
  /** Repo-relative path of the written composite. */
  path: z.string(),
  steps: z.number().int(),
});
export type SaveChainResult = z.infer<typeof SaveChainResult>;

export const ScreenshotResult = z.object({
  mime: z.literal("image/png"),
  base64: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frame: z.number(),
});
export type ScreenshotResult = z.infer<typeof ScreenshotResult>;
