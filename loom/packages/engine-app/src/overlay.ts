export interface OverlayInfo {
  scene: string | null;
  audioMode: string;
  bpm: number;
  rms: number;
  error: boolean;
}

/**
 * Minimal M1 status strip: scene, audio mode, BPM, level meter, error chip.
 * The real Console arrives in M3 — keep this disposable.
 */
export class Overlay {
  private readonly text: HTMLElement;
  private readonly meter: HTMLElement;
  private readonly chip: HTMLElement;
  readonly deviceSelect: HTMLSelectElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <span data-id="chip" class="chip"></span>
      <span data-id="text"></span>
      <span class="meter"><span data-id="meter-fill"></span></span>
      <select data-id="devices" title="audio input"></select>
    `;
    this.chip = root.querySelector("[data-id=chip]")!;
    this.text = root.querySelector("[data-id=text]")!;
    this.meter = root.querySelector("[data-id=meter-fill]")!;
    this.deviceSelect = root.querySelector("[data-id=devices]")!;
  }

  async populateDevices(devices: MediaDeviceInfo[], current: string): Promise<void> {
    const opts = ['<option value="test">test signal</option>']
      .concat(
        devices.map(
          (d, i) => `<option value="mic:${d.deviceId}">${d.label || `input ${i + 1}`}</option>`,
        ),
      )
      .join("");
    this.deviceSelect.innerHTML = opts;
    this.deviceSelect.value = current;
  }

  update(info: OverlayInfo): void {
    this.text.textContent = ` ${info.scene ?? "—"} · ${info.audioMode} · ${info.bpm.toFixed(0)} bpm `;
    this.meter.style.width = `${Math.min(100, info.rms * 240).toFixed(0)}%`;
    this.chip.textContent = info.error ? "✗ frozen" : "●";
    this.chip.className = `chip ${info.error ? "err" : "ok"}`;
  }
}
