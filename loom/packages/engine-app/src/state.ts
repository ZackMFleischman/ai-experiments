/**
 * Engine side of the loom:state Vite middleware: tuned state (globals
 * tunings, MIDI bindings, per-scene param values) round-trips through
 * content/state/*.json. `?state=off` disables both load and save —
 * validators use it so persisted tunings can never skew their assertions.
 */
export class StateClient {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    readonly enabled: boolean,
    private readonly debounceMs = 400,
  ) {}

  async load(name: string): Promise<unknown | null> {
    if (!this.enabled) return null;
    try {
      const res = await fetch(`/loom/state/${name}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null; // state is a convenience, never a boot blocker
    }
  }

  /** Debounced per name — slider drags coalesce into one write. */
  save(name: string, data: () => unknown): void {
    if (!this.enabled) return;
    const prev = this.timers.get(name);
    if (prev) clearTimeout(prev);
    this.timers.set(
      name,
      setTimeout(() => {
        this.timers.delete(name);
        void fetch(`/loom/state/${name}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data()),
        }).catch(() => {});
      }, this.debounceMs),
    );
  }
}
