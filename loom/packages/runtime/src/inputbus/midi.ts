/**
 * WebMIDI input: hot-pluggable controllers feeding CC state. Kept separable
 * from the Web MIDI API (MidiAccessLike) so it unit-tests in Node and so
 * validation can inject mocked hardware through the exact same path.
 */

export interface CcEvent {
  /** Controller number 0..127. */
  cc: number;
  /** MIDI channel 0..15. */
  ch: number;
  /** Normalized 0..1. */
  value: number;
}

export interface MidiInputLike {
  name?: string | null;
  onmidimessage: ((e: { data: Uint8Array | null }) => void) | null;
}

export interface MidiAccessLike {
  inputs: Map<string, MidiInputLike>;
  onstatechange: (() => void) | null;
}

/** The MIDI surface input channels read (kept separable for tests). */
export interface MidiBusLike {
  ccValue(cc: number, ch?: number): number;
}

export class MidiBus implements MidiBusLike {
  /** Connected input device names (Console header status). */
  devices: string[] = [];

  /**
   * "off" until a requestMIDIAccess succeeds — Chrome ≥124 gates ALL WebMIDI
   * behind a permission prompt, so "off" usually means "not granted yet",
   * which the Console must be able to show (an invisible rejection reads as
   * a dead controller).
   */
  status: "off" | "ready" = "off";

  private access: MidiAccessLike | null = null;
  private readonly perChannel = new Map<string, number>();
  private readonly anyChannel = new Map<number, number>();
  private readonly listeners = new Set<(e: CcEvent) => void>();

  /**
   * Attach to WebMIDI (or a test double). Absent/denied MIDI leaves the bus
   * inert — the instrument must work with no controller plugged in. Safe to
   * call repeatedly: already-ready short-circuits (no re-prompt), and a
   * rejected attempt can be retried later (user gesture / permission grant).
   */
  async init(request?: () => Promise<MidiAccessLike>): Promise<boolean> {
    if (this.access) return true;
    // Structural view of the Web MIDI surface we use (lib.dom's MIDIAccess
    // doesn't overlap MidiAccessLike exactly — hence the unknown hop).
    const nav = globalThis.navigator as unknown as
      | { requestMIDIAccess?: () => Promise<MidiAccessLike> }
      | undefined;
    const ask = request ?? (nav?.requestMIDIAccess ? () => nav.requestMIDIAccess!() : null);
    if (!ask) return false;
    let access: MidiAccessLike | null = null;
    try {
      access = await ask();
    } catch {
      return false; // permission denied / unsupported: stay inert, retryable
    }
    if (!access) return false;
    this.access = access;
    this.status = "ready";
    this.access.onstatechange = () => this.refresh();
    this.refresh();
    return true;
  }

  /** Latest CC value 0..1; omit ch to read the newest on any channel. */
  ccValue(cc: number, ch?: number): number {
    return ch === undefined
      ? (this.anyChannel.get(cc) ?? 0)
      : (this.perChannel.get(`${ch}:${cc}`) ?? 0);
  }

  onCc(fn: (e: CcEvent) => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /** Mocked hardware: feeds the same path as a real CC message. */
  inject(cc: number, ch: number, value01: number): void {
    this.emit(cc, ch, Math.min(1, Math.max(0, value01)));
  }

  private refresh(): void {
    if (!this.access) return;
    const names: string[] = [];
    for (const input of this.access.inputs.values()) {
      names.push(input.name ?? "midi input");
      input.onmidimessage = (e) => this.handleMessage(e.data);
    }
    this.devices = names;
  }

  private handleMessage(data: Uint8Array | null): void {
    if (!data || data.length < 3) return;
    const status = data[0]!;
    if ((status & 0xf0) !== 0xb0) return; // control change only
    this.emit(data[1]!, status & 0x0f, data[2]! / 127);
  }

  private emit(cc: number, ch: number, value: number): void {
    this.perChannel.set(`${ch}:${cc}`, value);
    this.anyChannel.set(cc, value);
    const e: CcEvent = { cc, ch, value };
    for (const l of this.listeners) l(e);
  }
}
