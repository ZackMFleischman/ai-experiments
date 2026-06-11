import { z } from "zod";
import type { CcEvent } from "./inputbus/midi";

/**
 * MIDI-learn bindings: a CC (optionally channel-pinned) drives a param path.
 * Bindings are keyed by SCENE name, not instance id — instances are ephemeral
 * (ids churn across rebuilds and sessions) while "this knob is pulse's punch"
 * is durable. "globals" is the pseudo-scene for the global manifest.
 */
export const BindingSchema = z.object({
  cc: z.number().int().min(0).max(127),
  ch: z.number().int().min(0).max(15).nullable(),
  scene: z.string().min(1),
  path: z.string().min(1),
});
export type Binding = z.infer<typeof BindingSchema>;

export interface LearnTarget {
  scene: string;
  path: string;
}

export class BindingStore {
  bindings: Binding[] = [];
  learning: LearnTarget | null = null;

  /** Arm learn for a target; arming the same target again cancels (toggle). */
  startLearn(target: LearnTarget): void {
    if (this.learning?.scene === target.scene && this.learning.path === target.path) {
      this.learning = null;
      return;
    }
    this.learning = target;
  }

  cancelLearn(): void {
    this.learning = null;
  }

  /**
   * Route one CC event: complete a pending learn (replacing the target's old
   * binding), then apply the value to every matching binding via `write`.
   */
  handleCc(
    e: CcEvent,
    write: (scene: string, path: string, value01: number) => void,
  ): { learned: Binding | null } {
    let learned: Binding | null = null;
    if (this.learning) {
      const target = this.learning;
      this.learning = null;
      this.unbind(target);
      learned = { cc: e.cc, ch: e.ch, scene: target.scene, path: target.path };
      this.bindings.push(learned);
    }
    for (const b of this.bindings) {
      if (b.cc === e.cc && (b.ch === null || b.ch === e.ch)) write(b.scene, b.path, e.value);
    }
    return { learned };
  }

  unbind(target: LearnTarget): boolean {
    const before = this.bindings.length;
    this.bindings = this.bindings.filter(
      (b) => !(b.scene === target.scene && b.path === target.path),
    );
    return this.bindings.length < before;
  }

  /** Replace contents from persisted JSON; malformed entries are dropped. */
  load(raw: unknown): void {
    this.bindings = [];
    if (!Array.isArray(raw)) return;
    for (const item of raw) {
      const r = BindingSchema.safeParse(item);
      if (r.success) this.bindings.push(r.data);
    }
  }

  toJSON(): Binding[] {
    return [...this.bindings];
  }
}
