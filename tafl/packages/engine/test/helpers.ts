// Test scaffolding: build hand-crafted positions from 11-row board pictures.
// Whitespace is stripped, so templates can be drawn one rank per line.

import { positionKey, type Side, type TaflState } from '../src/index.js';

/** Flatten a drawn board (11 rows × 11 cols of A/D/K/.) to a 121-char string. */
export function board(picture: string): string {
  const flat = picture.replace(/\s+/g, '');
  if (flat.length !== 121 || /[^ADK.]/.test(flat)) {
    throw new Error(`bad board template: '${flat}'`);
  }
  return flat;
}

/** A fresh mid-game state around a drawn board. */
export function pos(picture: string, toMove: Side): TaflState {
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
  return row * 11 + col;
}
