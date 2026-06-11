import { Manifest, normalizeHex, type Param } from "./param";

/**
 * Global color palettes (R7): two named palettes, five ordered color stops
 * each, living on a globals-side Manifest (palette.primary.0 …) served
 * through the same "globals" pseudo-instance path as the input rack.
 * Roles on indices (0 bg · 1 edge · 2/3 core · 4 accent) are documented
 * convention, not kernel vocabulary (R7.1).
 */

export type PaletteSource = "primary" | "secondary";
export const PALETTE_STOPS = 5;
export const PALETTE_SOURCES = ["primary", "secondary", "own"] as const;

const DEFAULTS: Record<PaletteSource, string[]> = {
  primary: ["#0b1026", "#1a4a5f", "#2ec4b6", "#9b5de5", "#f15bb5"], // night teal→magenta
  secondary: ["#1a0b16", "#641220", "#c9184a", "#ff758f", "#ffd166"], // ember
};

export class PaletteRegistry {
  readonly manifest = new Manifest();
  private readonly stopParams: Record<PaletteSource, Param<string>[]> = {
    primary: [],
    secondary: [],
  };

  constructor() {
    for (const source of ["primary", "secondary"] as const) {
      for (let i = 0; i < PALETTE_STOPS; i++) {
        this.stopParams[source].push(
          this.manifest.color(`palette.${source}.${i}`, {
            default: DEFAULTS[source][i]!,
            description: `${source} palette stop ${i}`,
          }),
        );
      }
    }
  }

  /** Current stop values, in order. */
  stops(source: PaletteSource): string[] {
    return this.stopParams[source].map((p) => p.value);
  }
}

/** Fill an RGBA byte ramp (width = data.length/4) with a piecewise-linear gradient. */
export function fillRamp(data: Uint8Array, stops: string[]): void {
  const rgb = stops.map((s) => {
    const hex = normalizeHex(s) ?? "#000000";
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  });
  const segs = rgb.length - 1;
  const width = data.length / 4;
  for (let x = 0; x < width; x++) {
    const t = (x / (width - 1)) * segs;
    const i = Math.min(Math.floor(t), segs - 1);
    const fr = t - i;
    for (let c = 0; c < 3; c++) {
      data[x * 4 + c] = Math.round(rgb[i]![c]! + (rgb[i + 1]![c]! - rgb[i]![c]!) * fr);
    }
    data[x * 4 + 3] = 255;
  }
}
