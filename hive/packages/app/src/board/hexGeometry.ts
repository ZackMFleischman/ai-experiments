// Board-space geometry shared by the renderer and (later) the drag layer.
// Pixel math itself lives in the engine (hexToPixel/pixelToHex, T1.1).
import type { CellKey, Hex } from '@hive/engine';
import { hexToPixel } from '@hive/engine';

export const HEX_SIZE = 40;

// Vertical lift per stack level so height reads at a glance (T3.2).
export const STACK_OFFSET = { x: 4, y: -6 };

export function keyToHex(key: CellKey): Hex {
  const comma = key.indexOf(',');
  return { q: Number(key.slice(0, comma)), r: Number(key.slice(comma + 1)) };
}

export function hexKey(h: Hex): CellKey {
  return `${h.q},${h.r}`;
}

export function cellCenter(h: Hex): { x: number; y: number } {
  return hexToPixel(h, HEX_SIZE);
}

/** Pointy-top hexagon outline centered on (0,0), for inline board polygons. */
export function hexPoints(size = HEX_SIZE): string {
  const w = (Math.sqrt(3) / 2) * size;
  return [
    [0, -size],
    [w, -size / 2],
    [w, size / 2],
    [0, size],
    [-w, size / 2],
    [-w, -size / 2],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Tight pixel bounds of a set of cells (tile extents included). */
export function cellBounds(cells: Iterable<Hex>, size = HEX_SIZE): Bounds | undefined {
  let bounds: Bounds | undefined;
  for (const cell of cells) {
    const { x, y } = hexToPixel(cell, size);
    const w = (Math.sqrt(3) / 2) * size;
    const next: Bounds = { minX: x - w, minY: y - size, maxX: x + w, maxY: y + size };
    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, next.minX),
          minY: Math.min(bounds.minY, next.minY),
          maxX: Math.max(bounds.maxX, next.maxX),
          maxY: Math.max(bounds.maxY, next.maxY),
        }
      : next;
  }
  return bounds;
}
