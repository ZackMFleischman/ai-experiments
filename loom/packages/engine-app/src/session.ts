import {
  buildInstance,
  ModulatorHost,
  type AudioBusLike,
  type FrameCtx,
  type InputRegistry,
  type Instance,
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
    private readonly buses: { audio: AudioBusLike; time: TimeBus; inputs?: InputRegistry },
    /** Tuned per-scene values (NFR-5: params reapplied from tuned state). */
    private readonly tunedValues?: (scene: string) => Record<string, number | boolean> | undefined,
  ) {}

  create(def: SceneDef, id?: string): Entry {
    const finalId = id ?? `${def.name}-${++this.counter}`;
    if (this.entries.has(finalId)) throw new Error(`instance "${finalId}" already exists`);
    const instance = buildInstance(def, this.buses);
    this.applyTuned(instance, def.name);
    const entry: Entry = {
      id: finalId,
      sceneName: def.name,
      instance,
      def,
      target: new RenderTarget(PREVIEW_W, PREVIEW_H),
      lastUpdateRejected: false,
      modulators: new ModulatorHost({ bpm: () => this.buses.time.bpm, audio: this.buses.audio }),
    };
    this.entries.set(finalId, entry);
    return entry;
  }

  /** NFR-5: rebuild from new code; on failure the old instance keeps running. */
  rebuild(id: string, def: SceneDef): boolean {
    const e = this.entries.get(id);
    if (!e) return false;
    try {
      const next = buildInstance(def, this.buses);
      this.applyTuned(next, def.name);
      e.instance.dispose();
      e.instance = next;
      e.sceneName = def.name;
      e.def = def;
      e.lastUpdateRejected = false;
      e.modulators.reattach(e.instance.manifest); // FR-4: survive, orphan, or recover
      return true;
    } catch (err) {
      e.lastUpdateRejected = true;
      console.error(`[loom] rebuild of "${id}" (${def.name}) rejected; previous still running`, err);
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
      instance.manifest.get(path)?.set(v);
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
