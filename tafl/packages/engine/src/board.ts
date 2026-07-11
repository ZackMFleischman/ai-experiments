// Geometry of the 7×7 Brandub board. Cells are flat indices 0..48 in
// row-major order (r*7+c); the throne is the center, the four corners are
// the king's escape squares. Everything here is pure arithmetic — no state,
// no rules — so movement and capture code can reason in cells + directions
// without ever touching (row, col) pairs except at this boundary.

import type { TaflMove } from './state.js';

export const BOARD_SIZE = 7;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

/** Center square. Only the king may land here (it may re-enter). */
export const THRONE = 24;

/** Escape squares. Only the king may land here; reaching one wins. */
export const CORNERS: readonly number[] = [0, 6, 42, 48];

export function rowOf(cell: number): number {
  return Math.floor(cell / BOARD_SIZE);
}

export function colOf(cell: number): number {
  return cell % BOARD_SIZE;
}

export function isCorner(cell: number): boolean {
  return CORNERS.includes(cell);
}

/** Throne + corners: squares only the king may land on. */
export function isRestricted(cell: number): boolean {
  return cell === THRONE || isCorner(cell);
}

/** The four orthogonal directions as (dRow, dCol) deltas. */
export const DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/** Next cell from `cell` one step in `dir`, or -1 when that walks off board. */
export function step(cell: number, dir: readonly [number, number]): number {
  const r = rowOf(cell) + dir[0];
  const c = colOf(cell) + dir[1];
  if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return -1;
  return r * BOARD_SIZE + c;
}

/** 'a1'-style name: files a-g left→right, rank 1 the TOP row (cell 0 = a1). */
export function cellName(cell: number): string {
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) {
    throw new RangeError(`cell out of range: ${cell}`);
  }
  return String.fromCharCode(97 + colOf(cell)) + String(rowOf(cell) + 1);
}

/** 'd1-d3'-style move notation for docs, logs, and UI. */
export function moveName(move: TaflMove): string {
  return `${cellName(move.from)}-${cellName(move.to)}`;
}
