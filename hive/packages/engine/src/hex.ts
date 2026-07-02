// Axial hex coordinates, pointy-top orientation. Pixel math lives here so the
// board renderer and the drag layer share one source of truth (T1.1).
import type { CellKey, Hex } from './index';

// E, W, NE, NW, SE, SW — fixed order; UHP direction markers map onto this (uhp.ts).
export const DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: -1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
];

export function add(a: Hex, b: Hex): Hex {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function sub(a: Hex, b: Hex): Hex {
  return { q: a.q - b.q, r: a.r - b.r };
}

export function hexEquals(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r;
}

export function neighbors(h: Hex): Hex[] {
  return DIRECTIONS.map((d) => add(h, d));
}

export function cellKey(h: Hex): CellKey {
  return `${h.q},${h.r}`;
}

export function parseKey(key: CellKey): Hex {
  const comma = key.indexOf(',');
  return { q: Number(key.slice(0, comma)), r: Number(key.slice(comma + 1)) };
}

const SQRT3 = Math.sqrt(3);

export function hexToPixel(h: Hex, size: number): { x: number; y: number } {
  return {
    x: size * (SQRT3 * h.q + (SQRT3 / 2) * h.r),
    y: size * 1.5 * h.r,
  };
}

// Closed-form pixel → cell: fractional axial, then cube-round (DESIGN §9.8).
export function pixelToHex(x: number, y: number, size: number): Hex {
  const qf = ((SQRT3 / 3) * x - (1 / 3) * y) / size;
  const rf = ((2 / 3) * y) / size;
  return cubeRound(qf, rf);
}

function cubeRound(qf: number, rf: number): Hex {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q || 0, r: r || 0 }; // normalize Math.round's -0
}
