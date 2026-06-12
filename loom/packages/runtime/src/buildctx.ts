import { uniform } from "three/tsl";
import type { FrameCtx } from "./frame";
import type { AudioBusLike } from "./inputbus/audio";
import type { TimeBus } from "./inputbus/time";
import type { InputProvider } from "./fixture";
import { layerRig, NODE_NAME_RE, RESERVED_NODE_NAMES, type LayerHooks, type LayerNodeInfo } from "./layer";
import { PaletteCtxImpl, type PaletteRegistry } from "./palette";
import { Manifest, type BoolParamSpec, type RangedParamSpec, type Param } from "./param";
import { Signal, type SignalLike } from "./signal";
import type { Pass, TexNode } from "./texnode";

/**
 * Handed to scene/module build functions. Collects the manifest and the
 * per-frame uniform updaters that bridge CPU Signals onto the GPU.
 * Modules never reach outside this.
 */
export class BuildCtx {
  readonly manifest = new Manifest();
  readonly updaters: Array<(f: FrameCtx) => void> = [];
  /** Named nodes registered by ctx.layer() during this build, in wrap order. */
  readonly nodes: LayerNodeInfo[] = [];
  private paletteCtx: PaletteCtxImpl | null = null;
  /** Each node's rig pass — containment in a later wrap's input = parentage. */
  private readonly nodeMarkers = new Map<string, Pass>();

  constructor(
    readonly audio: AudioBusLike,
    readonly time: TimeBus,
    /** The live input rack — or a FixturePlayer replaying a recorded trace. */
    readonly inputs?: InputProvider,
    readonly palettes?: PaletteRegistry,
    private readonly layerHooks?: LayerHooks,
  ) {}

  /**
   * The global palettes (R7): color(i) stops, ramp(t) gradient, own(stops)
   * scene defaults. Using it auto-declares a palette.source param resolved
   * per frame by the uniform updaters — switching never rebuilds.
   */
  get palette(): PaletteCtxImpl {
    this.paletteCtx ??= new PaletteCtxImpl(this.manifest, this.updaters, this.palettes);
    return this.paletteCtx;
  }

  /** Declare deferred params (palette.source). buildInstance calls this after build(). */
  finalize(): void {
    this.paletteCtx?.finalize();
  }

  /**
   * Wrap any TexNode as a named, grabbable node (Layers): registers a stable
   * identity, folds the uniform-driven layer rig (`<name>.layer.x/y/scale/
   * rotate/opacity` params, identity by default — `set_param` never rebuilds),
   * and folds the node's FX chain when the session injected one. Names must be
   * unique per build; a duplicate throws (NFR-5 contains it).
   */
  layer(name: string, tex: TexNode): TexNode {
    if (!NODE_NAME_RE.test(name)) {
      throw new Error(`ctx.layer: invalid node name "${name}" (letters, digits, - and _; must start with a letter)`);
    }
    if (RESERVED_NODE_NAMES.has(name)) {
      throw new Error(`ctx.layer: "${name}" is a reserved name`);
    }
    if (this.nodeMarkers.has(name)) {
      throw new Error(`ctx.layer: duplicate node name "${name}" — node ids must be unique per scene`);
    }
    let out = layerRig(this, name, tex);
    const marker = out.passes[out.passes.length - 1]!;
    out = this.layerHooks?.foldNode?.(this, name, out) ?? out;
    // Wraps register bottom-up, so any not-yet-parented node whose rig pass is
    // inside this wrap's input gets this node as its immediate parent.
    for (const n of this.nodes) {
      const m = this.nodeMarkers.get(n.id);
      if (n.parent == null && m != null && tex.passes.includes(m)) n.parent = name;
    }
    this.nodes.push({ id: name, parent: null });
    this.nodeMarkers.set(name, marker);
    return out;
  }

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
