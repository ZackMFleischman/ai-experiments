// Test scaffolding: build hand-crafted positions from 8-row board pictures.
// Whitespace is stripped, so templates can be drawn one rank per line.

import { positionKey, type Side, type CheckersState } from '../src/index.js';

/** Flatten a drawn board (8 rows × 8 cols of d/D/l/L/.) to a 64-char string. */
export function board(picture: string): string {
  const flat = picture.replace(/\s+/g, '');
  if (flat.length !== 64 || /[^dDlL.]/.test(flat)) {
    throw new Error(`bad board template: '${flat}'`);
  }
  return flat;
}

/** A fresh mid-game state around a drawn board. */
export function pos(picture: string, toMove: Side): CheckersState {
  const b = board(picture);
  return {
    board: b,
    toMove,
    moveCount: 0,
    seen: { [positionKey(b, toMove)]: 1 },
    result: null,
  };
}

/** Cell index from (row, col), row 0 at the top. */
export function at(row: number, col: number): number {
  return row * 8 + col;
}
