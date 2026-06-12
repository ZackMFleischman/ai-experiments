export { Clock, type FrameCtx } from "./frame";
export { Signal, asSignal, type SignalLike } from "./signal";
export { Events } from "./events";
export { Manifest, Param, normalizeHex, type ParamType, type RangedParamSpec, type BoolParamSpec, type ColorParamSpec } from "./param";
export { fillRamp, PALETTE_SOURCES, PALETTE_STOPS, PaletteCtxImpl, PaletteRegistry, type PaletteSource } from "./palette";
export {
  defineModule,
  ModuleMetaSchema,
  ChainParamSpec,
  type ModuleMeta,
  type ModuleFactory,
  type ChainParamInput,
} from "./module";
export {
  ChainHost,
  type ModuleOutput,
  type ChainEffectOpts,
  type ChainableEffect,
  type EffectRegistry,
  type EffectEntry,
  type PrimitiveEffectEntry,
  type CompositeEffectEntry,
  type CompositeInnerStep,
  type ChainStep,
  type ChainStepInput,
  type ChainStepInfo,
} from "./chain";
export { lagSignal, lfoSignal, envelopeSignal, type LfoShape, type LfoOpts } from "./control";
export { texNode, type TexNode, type Pass, type ColorNode } from "./texnode";
export { BuildCtx } from "./buildctx";
export { layerRig, NODE_NAME_RE, RESERVED_NODE_NAMES, type LayerHooks, type LayerNodeInfo } from "./layer";
export { defineScene, type SceneDef, type SceneInput } from "./scene";
export { Instance, buildInstance } from "./instance";
export { Stage, type StageDirective, type PanicMode } from "./stage";
export { TimeBus } from "./inputbus/time";
export { AudioBus, type AudioBusLike, type AudioMode, type BandName } from "./inputbus/audio";
export { OnsetDetector, bandEnergy, type OnsetOpts } from "./inputbus/analysis";
export { MidiBus, type MidiBusLike, type MidiAccessLike, type MidiInputLike, type CcEvent, type MidiMessageLog } from "./inputbus/midi";
export {
  defineInputs,
  InputRegistry,
  type InputsDef,
  type InputChannelDef,
  type InputChannelKind,
  type LevelChannelOpts,
  type OnsetChannelOpts,
  type CcChannelOpts,
} from "./inputs";
export { BindingStore, BindingSchema, BindingMode, type Binding, type BindingOps, type LearnTarget } from "./bindings";
export {
  createModulator,
  ModulatorSpec,
  type ModulatorBus,
  type ModulatorEval,
  type ModulatorParamMeta,
  type ModulatorType,
} from "./modulator";
export { ModulatorHost, type ManifestLike, type ModulatorInfo, type ParamLike } from "./modulator-host";
