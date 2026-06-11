import type { FrameCtx } from "./frame";
import {
  createModulator,
  ModulatorSpec,
  type ModulatorBus,
  type ModulatorEval,
  type ModulatorParamMeta,
} from "./modulator";
import type { ParamType } from "./param";

/** The slice of Param/Manifest a host needs (lets tests inject fakes). */
export interface ParamLike {
  set(v: unknown): void;
  toJSON(): Record<string, unknown>;
}
export interface ManifestLike {
  get(path: string): ParamLike | undefined;
}

export interface ModulatorInfo {
  path: string;
  spec: ModulatorSpec;
  /** Non-null = detached: evaluation threw, or the param vanished on rebuild. */
  error: string | null;
}

interface Slot {
  spec: ModulatorSpec;
  evaluate: ModulatorEval;
  error: string | null;
}

/**
 * Per-instance modulator registry: attach/replace/clear, the per-frame
 * write pass, and HMR re-attachment. Lives in the engine's SessionStore
 * entry (per instance, not per scene — FR-3); the engine only schedules.
 */
export class ModulatorHost {
  private readonly slots = new Map<string, Slot>();

  constructor(private readonly bus: ModulatorBus) {}

  /** Attach or replace (one modulator per param, FR-1). Throws on a bad spec. */
  attach(manifest: ManifestLike, path: string, raw: unknown): ModulatorSpec {
    const param = manifest.get(path);
    if (!param) throw new Error(`unknown param "${path}"`);
    const spec = ModulatorSpec.parse(raw);
    const evaluate = createModulator(spec, paramMeta(param), this.bus);
    this.slots.set(path, { spec, evaluate, error: null });
    return spec;
  }

  /** Detach. False when there was nothing to clear (callers treat as no-op success). */
  clear(path: string): boolean {
    return this.slots.delete(path);
  }

  get(path: string): ModulatorInfo | undefined {
    const s = this.slots.get(path);
    return s && { path, spec: s.spec, error: s.error };
  }

  /** True when the param is owned by a live (non-errored) modulator (FR-7). */
  active(path: string): boolean {
    const s = this.slots.get(path);
    return s != null && s.error == null;
  }

  list(): ModulatorInfo[] {
    return [...this.slots.entries()].map(([path, s]) => ({ path, spec: s.spec, error: s.error }));
  }

  /**
   * FR-9: evaluate every active modulator and write through the manifest.
   * A throw detaches that modulator (error recorded, param holds its last
   * value) and never reaches the render loop.
   */
  tick(manifest: ManifestLike, f: FrameCtx): void {
    for (const [path, s] of this.slots) {
      if (s.error != null) continue;
      try {
        const param = manifest.get(path);
        if (!param) throw new Error(`param "${path}" disappeared`);
        param.set(s.evaluate(f));
      } catch (err) {
        s.error = err instanceof Error ? err.message : String(err);
      }
    }
  }

  /**
   * FR-4: after an instance rebuild, re-attach each stored spec to the new
   * manifest (fresh evaluator; phase restarts). Orphans stay listed with
   * error set so get_session can report them; a later rebuild that brings
   * the param back recovers them.
   */
  reattach(manifest: ManifestLike): void {
    for (const [path, s] of this.slots) {
      const param = manifest.get(path);
      if (!param) {
        s.error = `param "${path}" vanished in rebuild`;
        continue;
      }
      try {
        s.evaluate = createModulator(s.spec, paramMeta(param), this.bus);
        s.error = null;
      } catch (err) {
        s.error = err instanceof Error ? err.message : String(err);
      }
    }
  }
}

function paramMeta(param: ParamLike): ModulatorParamMeta {
  const j = param.toJSON() as {
    type: ParamType;
    min?: number;
    max?: number;
    value?: number | boolean;
  };
  return { type: j.type, min: j.min, max: j.max, value: j.value };
}
