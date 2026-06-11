import { uniform } from "three/tsl";
import type { FrameCtx } from "./frame";
import type { AudioBusLike } from "./inputbus/audio";
import type { TimeBus } from "./inputbus/time";
import type { InputRegistry } from "./inputs";
import { Manifest, type BoolParamSpec, type RangedParamSpec, type Param } from "./param";
import { Signal, type SignalLike } from "./signal";

/**
 * Handed to scene/module build functions. Collects the manifest and the
 * per-frame uniform updaters that bridge CPU Signals onto the GPU.
 * Modules never reach outside this.
 */
export class BuildCtx {
  readonly manifest = new Manifest();
  readonly updaters: Array<(f: FrameCtx) => void> = [];

  constructor(
    readonly audio: AudioBusLike,
    readonly time: TimeBus,
    readonly inputs?: InputRegistry,
  ) {}

  /**
   * Consume a named input-rack channel (R6.3). Late-bound: the name resolves
   * through the registry at pull time, so retuning/redefining a channel never
   * rebuilds this instance. Auto-declares a per-instance trim param
   * (`input.<name>.amount`) — trims, not overrides: the channel's detection
   * meaning stays owned by the globals rack.
   */
  input(name: string): Signal<number> {
    const reg = this.inputs;
    if (!reg) return Signal.of(0); // no rack wired (bare unit-test builds)
    const path = `input.${name}.amount`;
    const trim =
      (this.manifest.get(path) as Param<number> | undefined) ??
      this.manifest.float(path, {
        default: 1,
        min: 0,
        max: 2,
        description: `trim for input channel "${name}"`,
      });
    const chan = reg.signal(name);
    const trimSig = trim.signal();
    return new Signal((f) => chan.get(f) * trimSig.get(f));
  }

  float(path: string, spec: RangedParamSpec) {
    return this.manifest.float(path, spec);
  }

  int(path: string, spec: RangedParamSpec) {
    return this.manifest.int(path, spec);
  }

  bool(path: string, spec: BoolParamSpec) {
    return this.manifest.bool(path, spec);
  }

  /**
   * Bridge a number Signal (or constant) into a TSL uniform that updates
   * every frame. This is also what guarantees stateful signals get pulled.
   */
  uniformOf(value: SignalLike | Signal<number>) {
    if (typeof value === "number") return uniform(value);
    const u = uniform(0);
    this.updaters.push((f) => {
      u.value = value.get(f);
    });
    return u;
  }
}
