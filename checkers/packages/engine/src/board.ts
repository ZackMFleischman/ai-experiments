// Geometry of the 8×8 checkers board. Cells are flat indices 0..63 in
// row-major order (r*8+c); only the 32 dark squares ((r+c) odd) are playable.
// Everything here is pure arithmetic — no state, no rules — so movement and
// capture code can reason in cells + diagonal deltas without ever touching
// (row, col) pairs except at this boundary.

import type { CheckersMove } from './state.js';

export const BOARD_SIZE = 8;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

export function rowOf(cell: number): number {
  return Math.floor(cell / BOARD_SIZE);
}

export function colOf(cell: number): number {
  return cell % BOARD_SIZE;
}

/** Only the dark squares are playable; pieces never leave them (a diagonal
 * step preserves (row+col) parity, so this is closed under movement). */
export function isPlayable(cell: number): boolean {
  return (rowOf(cell) + colOf(cell)) % 2 === 1;
}

/** Next cell from `cell` one diagonal step in (dRow, dCol), or -1 when that
 * walks off the board. */
export function step(cell: number, dir: readonly [number, number]): number {
  const r = rowOf(cell) + dir[0];
  const c = colOf(cell) + dir[1];
  if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return -1;
  return r * BOARD_SIZE + c;
}

/** 'a1'-style name: files a-h left→right, rank 1 the TOP row (cell 1 = b1). */
export function cellName(cell: number): string {
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) {
    throw new RangeError(`cell out of range: ${cell}`);
  }
  return String.fromCharCode(97 + colOf(cell)) + String(rowOf(cell) + 1);
}

/** 'b6-a5' for a simple move, 'b6×d4×f2' for a jump sequence — the joiner
 * follows the hop distance (a jump moves two rows per hop). */
export function moveName(move: CheckersMove): string {
  const first = move.path[0];
  const second = move.path[1];
  if (first === undefined || second === undefined) {
    throw new RangeError('moveName: path needs at least two cells');
  }
  const jump = Math.abs(rowOf(second) - rowOf(first)) === 2;
  return move.path.map(cellName).join(jump ? '×' : '-');
}
