import { uniform } from "three/tsl";
import type { FrameCtx } from "./frame";
import type { AudioBusLike } from "./inputbus/audio";
import type { TimeBus } from "./inputbus/time";
import { Manifest, type BoolParamSpec, type RangedParamSpec } from "./param";
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
  ) {}

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
