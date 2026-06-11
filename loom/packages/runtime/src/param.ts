import { z } from "zod";
import { Signal } from "./signal";

export type ParamType = "float" | "int" | "bool";

const RangedSpec = z
  .object({
    default: z.number(),
    min: z.number(),
    max: z.number(),
    step: z.number().positive().optional(),
    description: z.string().optional(),
  })
  .refine((s) => s.min <= s.max, { message: "min must be <= max" })
  .refine((s) => s.default >= s.min && s.default <= s.max, {
    message: "default must be inside [min, max]",
  });

const BoolSpec = z.object({
  default: z.boolean(),
  description: z.string().optional(),
});

export type RangedParamSpec = z.infer<typeof RangedSpec>;
export type BoolParamSpec = z.infer<typeof BoolSpec>;

export class Param<T> {
  constructor(
    readonly path: string,
    readonly type: ParamType,
    private readonly clampFn: (v: T) => T,
    private readonly meta: Record<string, unknown>,
    private v: T,
  ) {}

  get value(): T {
    return this.v;
  }

  set(next: T): void {
    this.v = this.clampFn(next);
  }

  /** Live view of the param; reflects later set() calls. */
  signal(): Signal<T> {
    return new Signal(() => this.v);
  }

  /**
   * Set from a normalized 0..1 value (MIDI CC, faders): floats/ints map onto
   * [min, max], bools flip at 0.5. The regular clamp still applies.
   */
  setNormalized(v01: number): void {
    const v = Math.min(1, Math.max(0, v01));
    if (this.type === "bool") {
      this.set((v >= 0.5) as unknown as T);
      return;
    }
    const min = this.meta.min as number;
    const max = this.meta.max as number;
    this.set((min + v * (max - min)) as unknown as T);
  }

  toJSON(): Record<string, unknown> {
    return { type: this.type, ...this.meta, value: this.v };
  }
}

/** The flat set of an instance's Params. UI, MIDI, and agents bind to this. */
export class Manifest {
  private readonly params = new Map<string, Param<unknown>>();

  float(path: string, spec: z.input<typeof RangedSpec>): Param<number> {
    const s = RangedSpec.parse(spec);
    const clamp = (v: number) => Math.min(s.max, Math.max(s.min, v));
    return this.add(path, new Param<number>(path, "float", clamp, specMeta(s), s.default));
  }

  int(path: string, spec: z.input<typeof RangedSpec>): Param<number> {
    const s = RangedSpec.parse(spec);
    const clamp = (v: number) => Math.round(Math.min(s.max, Math.max(s.min, v)));
    return this.add(path, new Param<number>(path, "int", clamp, specMeta(s), s.default));
  }

  bool(path: string, spec: z.input<typeof BoolSpec>): Param<boolean> {
    const s = BoolSpec.parse(spec);
    return this.add(path, new Param<boolean>(path, "bool", (v) => v, specMeta(s), s.default));
  }

  get(path: string): Param<unknown> | undefined {
    return this.params.get(path);
  }

  paths(): string[] {
    return [...this.params.keys()];
  }

  /** Flat current values — the tuned-state shape persisted to state/. */
  values(): Record<string, number | boolean> {
    const out: Record<string, number | boolean> = {};
    for (const [path, p] of this.params) out[path] = p.value as number | boolean;
    return out;
  }

  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [path, p] of this.params) out[path] = p.toJSON();
    return out;
  }

  private add<T>(path: string, param: Param<T>): Param<T> {
    if (this.params.has(path)) {
      throw new Error(`Manifest: duplicate param path "${path}"`);
    }
    this.params.set(path, param as Param<unknown>);
    return param;
  }
}

/** Spec fields for serialization, with undefined optionals dropped. */
function specMeta(spec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(spec)) if (v !== undefined) out[k] = v;
  return out;
}
