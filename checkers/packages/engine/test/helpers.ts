// Test scaffolding: build hand-crafted positions from 7-row board pictures.
// Whitespace is stripped, so templates can be drawn one rank per line.

import { positionKey, type Side, type CheckersState } from '../src/index.js';

/** Flatten a drawn board (7 rows × 7 cols of A/D/K/.) to a 49-char string. */
export function board(picture: string): string {
  const flat = picture.replace(/\s+/g, '');
  if (flat.length !== 49 || /[^ADK.]/.test(flat)) {
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
  return row * 7 + col;
}
