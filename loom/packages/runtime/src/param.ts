import { z } from "zod";
import { Signal } from "./signal";

export type ParamType = "float" | "int" | "bool" | "color";

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Normalize a CSS hex color to lowercase "#rrggbb"; null if unparseable. */
export function normalizeHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = HEX_RE.exec(v.trim());
  if (!m) return null;
  let hex = m[1]!.toLowerCase();
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return `#${hex}`;
}

const RangedSpec = z
  .object({
    default: z.number(),
    min: z.number(),
    max: z.number(),
    step: z.number().positive().optional(),
    /** Optional value names for int selectors (index = value - min); UI renders a toggle. */
    labels: z.array(z.string().min(1)).optional(),
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

const ColorSpec = z.object({
  default: z
    .string()
    .refine((s) => normalizeHex(s) != null, { message: 'color default must be "#rrggbb"' }),
  description: z.string().optional(),
});

export type RangedParamSpec = z.infer<typeof RangedSpec>;
export type BoolParamSpec = z.infer<typeof BoolSpec>;
export type ColorParamSpec = z.infer<typeof ColorSpec>;

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
    if (this.type === "color") return; // a 0..1 CC has no honest color mapping — ignore
    const min = this.meta.min as number;
    const max = this.meta.max as number;
    this.set((min + v * (max - min)) as unknown as T);
  }

  /**
   * One button press (cycle-mode bindings): ints advance and wrap max→min,
   * bools flip, floats/colors hold — a float has no honest "next" value.
   */
  step(): void {
    if (this.type === "bool") {
      this.set(!(this.v as boolean) as unknown as T);
      return;
    }
    if (this.type !== "int") return;
    const min = this.meta.min as number;
    const max = this.meta.max as number;
    const next = (this.v as number) + 1;
    this.set((next > max ? min : next) as unknown as T);
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

  color(path: string, spec: z.input<typeof ColorSpec>): Param<string> {
    const s = ColorSpec.parse(spec);
    const def = normalizeHex(s.default)!;
    const clamp = (v: string) => {
      const hex = normalizeHex(v);
      if (hex == null) {
        throw new Error(`color param "${path}" expects "#rrggbb" (got ${JSON.stringify(v)})`);
      }
      return hex;
    };
    return this.add(path, new Param<string>(path, "color", clamp, specMeta({ ...s, default: def }), def));
  }

  get(path: string): Param<unknown> | undefined {
    return this.params.get(path);
  }

  paths(): string[] {
    return [...this.params.keys()];
  }

  /** Flat current values — the tuned-state shape persisted to state/. */
  values(): Record<string, number | boolean | string> {
    const out: Record<string, number | boolean | string> = {};
    for (const [path, p] of this.params) out[path] = p.value as number | boolean | string;
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
