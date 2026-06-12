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
  "list_projects",
  "save_project",
  "load_project",
  "record_fixture",
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
  /** "fixture:<name>" replays a recorded input trace instead of the live rack. */
  inputs: z
    .string()
    .regex(/^fixture:[a-z0-9][a-z0-9_-]*$/i, 'inputs must be "fixture:<name>"')
    .optional(),
});
export type CreateInstanceArgs = z.infer<typeof CreateInstanceArgs>;

/** Screenshot args: `frames` (fixture instances only) renders a deterministic
 * offline pass — same fixture + frame list always returns identical pixels. */
export const ScreenshotArgs = z.object({
  instance: z.string().default("live"),
  frames: z.array(z.number().int().min(0).max(36_000)).min(1).max(16).optional(),
});
export type ScreenshotArgs = z.infer<typeof ScreenshotArgs>;

/** Record the live input rack for N frames into content/state/fixtures/<name>.json. */
export const RecordFixtureArgs = z.object({
  name: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, "letters, digits, - and _ (must start alphanumeric)"),
  frames: z.number().int().min(1).max(3600),
});
export type RecordFixtureArgs = z.infer<typeof RecordFixtureArgs>;

export const RecordFixtureResult = z.object({
  saved: z.string(),
  path: z.string(),
  frames: z.number().int(),
  channels: z.array(z.string()),
  bpm: z.number(),
});
export type RecordFixtureResult = z.infer<typeof RecordFixtureResult>;

/** One deterministic frame capture from a fixture replay. */
export const FixtureShot = z.object({
  frame: z.number().int(),
  mime: z.literal("image/png"),
  base64: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type FixtureShot = z.infer<typeof FixtureShot>;

export const ScreenshotFramesResult = z.object({
  fixture: z.string(),
  frames: z.array(FixtureShot),
});
export type ScreenshotFramesResult = z.infer<typeof ScreenshotFramesResult>;

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
    /** Target a named layer node's chain (Layers); omitted = the root chain. */
    node: z.string().min(1).optional(),
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

/**
 * Projects — set lists (serialized instance sets in content/state/projects/).
 * Saving captures the current set; agent saves are arming-gated like commit.
 * Loading builds every project instance into sandboxes and NEVER touches LIVE.
 */
export const SaveProjectArgs = z.object({
  name: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, "letters, digits, - and _ (must start alphanumeric)"),
  /** Console-supplied tile order; omitted = engine (creation) order. */
  tileOrder: z.array(z.string()).optional(),
});
export type SaveProjectArgs = z.infer<typeof SaveProjectArgs>;

export const LoadProjectArgs = z.object({ name: z.string().min(1) });
export type LoadProjectArgs = z.infer<typeof LoadProjectArgs>;

export const SaveProjectResult = z.object({
  saved: z.string(),
  /** Repo-relative path of the written project file. */
  path: z.string(),
  instances: z.number().int(),
});
export type SaveProjectResult = z.infer<typeof SaveProjectResult>;

export const LoadProjectResult = z.object({
  loaded: z.string(),
  /** Created instance ids, in project tile order. */
  created: z.array(z.string()),
  skipped: z.array(z.object({ id: z.string(), scene: z.string(), reason: z.string() })),
  /** LIVE is untouched by a load — always reported so agents see it held. */
  live: z.string().nullable(),
});
export type LoadProjectResult = z.infer<typeof LoadProjectResult>;

export const ListProjectsResult = z.object({ projects: z.array(z.string()) });
export type ListProjectsResult = z.infer<typeof ListProjectsResult>;

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

export const BindingModeZ = z.enum(["absolute", "set", "cycle"]);
export type BindingModeZ = z.infer<typeof BindingModeZ>;

/**
 * MIDI-learn target: a param path on an instance (resolved to its scene
 * engine-side — bindings are durable across instance churn), on "globals",
 * or on the "actions" pseudo-instance (live.next / live.prev). mode/value
 * choose the binding semantics; omitted = absolute.
 */
export const MidiTargetArgs = z.object({
  instance: z.string().default("live"),
  path: z.string().min(1),
  mode: BindingModeZ.optional(),
  value: z.number().optional(),
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
  mode: BindingModeZ.default("absolute"),
  value: z.number().optional(),
});
export type MidiBinding = z.infer<typeof MidiBinding>;

/** One raw incoming MIDI message (mirrors @loom/runtime's MidiMessageLog). */
export const MidiMessageLog = z.object({
  kind: z.string(),
  ch: z.number().nullable(),
  data: z.array(z.number()),
});
export type MidiMessageLog = z.infer<typeof MidiMessageLog>;

export const MidiStatus = z.object({
  /** "off" = no WebMIDI access yet (Chrome gates it behind a permission). */
  status: z.enum(["off", "ready"]),
  devices: z.array(z.string()),
  /** Armed MIDI-learn target, or null. */
  learning: z
    .object({
      scene: z.string(),
      path: z.string(),
      mode: BindingModeZ.optional(),
      value: z.number().optional(),
    })
    .nullable(),
  /**
   * Raw-message monitor (newest last), including non-CC traffic the engine
   * ignores — the eyes for "this control does nothing" (default [] so an
   * older engine snapshot still parses).
   */
  recent: z.array(MidiMessageLog).default([]),
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

/**
 * A named layer node registered by ctx.layer() (Layers): its rig params live at
 * `<id>.layer.*`, its chain's at `<id>.fx.<stepId>.*`. `parent` is the closest
 * enclosing node (null = feeds the root). The root chain is just the root node's.
 */
export const LayerNode = z.object({
  id: z.string(),
  parent: z.string().nullable(),
  /** The node's FX chain steps in order (empty when never chained). */
  chain: z.array(ChainStepInfo),
});
export type LayerNode = z.infer<typeof LayerNode>;

export const InstanceInfo = z.object({
  id: z.string(),
  scene: z.string(),
  status: InstanceStatus,
  error: z.string().nullable(),
  paramPaths: z.array(z.string()),
  modulators: z.array(ModulatorSummary),
  /** Post-effect chain steps in order (M6). */
  chain: z.array(ChainStepInfo),
  /** Named layer nodes in wrap order (Layers); [] when the scene wraps none. */
  nodes: z.array(LayerNode).default([]),
  /** The input-trace name this instance replays, or null for the live rack (Fixtures). */
  fixture: z.string().nullable().default(null),
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
  /** Saved project names (Projects switcher) — engine-cached, refreshed on list/save/load. */
  projects: z.array(z.string()).default([]),
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
  /** Layer nodes (Layers) — instances only; absent on "globals". */
  nodes: z.array(LayerNode).optional(),
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
  /** The edited node's id, or null for the root chain. */
  node: z.string().nullable().default(null),
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
