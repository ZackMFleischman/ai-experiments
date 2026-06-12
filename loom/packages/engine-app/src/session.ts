import {
  buildInstance,
  ChainHost,
  ModulatorHost,
  type AudioBusLike,
  type ChainStepInput,
  type EffectRegistry,
  type FrameCtx,
  type InputRegistry,
  type Instance,
  type PaletteRegistry,
  type SceneDef,
  type TimeBus,
} from "@loom/runtime";
import { RenderTarget } from "three/webgpu";
import type { InstanceStatus } from "@loom/sidecar/protocol";

/** Offscreen resolution for non-live instances (tiles, candidate screenshots). */
export const PREVIEW_W = 640;
export const PREVIEW_H = 360;

export interface Entry {
  readonly id: string;
  sceneName: string;
  instance: Instance;
  /** The def this instance was built from — identity says whether HMR changed it. */
  def: SceneDef;
  /** Where this instance renders when it isn't the live output. */
  readonly target: RenderTarget;
  /** Last HMR rebuild for this instance was rejected (✗ chip). */
  lastUpdateRejected: boolean;
  /** Run-time param modulators — per instance, surviving rebuilds (FR-3/FR-4). */
  readonly modulators: ModulatorHost;
  /** Post-effect chain — per instance, folded into every build (M6). */
  readonly chain: ChainHost;
  /** Successful builds of this entry (1 on create) — validators assert "no rebuild" against this. */
  builds: number;
}

export function entryStatus(e: Entry): InstanceStatus {
  if (e.instance.error != null) return "frozen";
  if (e.lastUpdateRejected) return "rejected";
  return "ok";
}

/**
 * The instance registry: who exists, with what scene, in what state.
 * Build failures throw out of create() (callers contain them); rebuild()
 * keeps NFR-5 trySwap semantics per instance — a failed rebuild never
 * touches the running one.
 */
export class SessionStore {
  readonly entries = new Map<string, Entry>();
  private counter = 0;

  constructor(
    private readonly buses: { audio: AudioBusLike; time: TimeBus; inputs?: InputRegistry; palettes?: PaletteRegistry },
    /** The chainable-effect library (M6) — a getter so it tracks `./effects` HMR. */
    private readonly effects: () => EffectRegistry,
    /** Tuned per-scene values (NFR-5: params reapplied from tuned state). */
    private readonly tunedValues?: (scene: string) => Record<string, number | boolean | string> | undefined,
  ) {}

  create(def: SceneDef, id?: string): Entry {
    const finalId = id ?? `${def.name}-${++this.counter}`;
    if (this.entries.has(finalId)) throw new Error(`instance "${finalId}" already exists`);
    const chain = new ChainHost(this.effects);
    chain.seed(def.chain); // scene-declared default chain (M6)
    const instance = buildInstance(def, this.buses, (ctx, tex) => chain.fold(ctx, tex));
    this.applyTuned(instance, def.name);
    chain.applyValues(instance.manifest);
    const entry: Entry = {
      id: finalId,
      sceneName: def.name,
      instance,
      def,
      target: new RenderTarget(PREVIEW_W, PREVIEW_H),
      lastUpdateRejected: false,
      modulators: new ModulatorHost({ bpm: () => this.buses.time.bpm, audio: this.buses.audio }),
      chain,
      builds: 1,
    };
    this.entries.set(finalId, entry);
    return entry;
  }

  /** NFR-5: rebuild from new code; on failure the old instance keeps running. */
  rebuild(id: string, def: SceneDef): boolean {
    const e = this.entries.get(id);
    if (!e) return false;
    e.chain.captureValues(e.instance.manifest); // preserve live chain knobs across the scene rebuild
    return this.swap(e, def);
  }

  /**
   * M6: replace the post-effect chain (full-list semantics — add/remove/reorder/
   * insert in one idempotent verb) and rebuild. A throwing step rejects the
   * rebuild and keeps the previous chain AND pixels (NFR-5). `"default"` restores
   * the scene's declared chain. Throws on an unknown effect (chain untouched).
   */
  setChain(id: string, input: ChainStepInput[] | "default"): boolean {
    const e = this.require(id);
    const prev = e.chain.steps;
    e.chain.captureValues(e.instance.manifest); // so carry-forward sees live knob values
    const candidate = input === "default" ? e.chain.toDefault() : e.chain.plan(input);
    e.chain.steps = candidate;
    const ok = this.swap(e, e.def);
    if (!ok) {
      e.chain.steps = prev; // a step failed to build — restore the old chain; old pixels still live
      throw new Error(`chain edit rejected on "${e.id}" — a step failed to build; previous chain kept`);
    }
    return ok;
  }

  /** Build a fresh instance (folding the entry's chain) and swap it in; NFR-5 on throw. */
  private swap(e: Entry, def: SceneDef): boolean {
    try {
      const next = buildInstance(def, this.buses, (ctx, tex) => e.chain.fold(ctx, tex));
      this.applyTuned(next, def.name);
      e.chain.applyValues(next.manifest);
      e.instance.dispose();
      e.instance = next;
      e.sceneName = def.name;
      e.def = def;
      e.lastUpdateRejected = false;
      e.builds += 1;
      e.modulators.reattach(e.instance.manifest); // FR-4: survive, orphan, or recover
      return true;
    } catch (err) {
      e.lastUpdateRejected = true;
      console.error(`[loom] rebuild of "${e.id}" (${def.name}) rejected; previous still running`, err);
      return false;
    }
  }

  /** Per-frame modulator write pass; the engine skips it while held (FR-10). */
  tickModulators(f: FrameCtx): void {
    for (const e of this.entries.values()) e.modulators.tick(e.instance.manifest, f);
  }

  /** Re-apply tuned values over code defaults; unknown paths are skipped. */
  private applyTuned(instance: Instance, scene: string): void {
    const vals = this.tunedValues?.(scene);
    if (!vals) return;
    for (const [path, v] of Object.entries(vals)) {
      try {
        instance.manifest.get(path)?.set(v);
      } catch {
        // bad persisted value (e.g. malformed color) — keep the code default
      }
    }
  }

  destroy(id: string): boolean {
    const e = this.entries.get(id);
    if (!e) return false;
    e.instance.dispose();
    e.target.dispose();
    this.entries.delete(id);
    return true;
  }

  get(id: string): Entry | undefined {
    return this.entries.get(id);
  }

  require(id: string): Entry {
    const e = this.entries.get(id);
    if (!e) {
      const have = [...this.entries.keys()].join(", ") || "(none)";
      throw new Error(`unknown instance "${id}" — running instances: ${have}`);
    }
    return e;
  }
}
