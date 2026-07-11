// Move generation. Every piece moves like a rook: any distance along a rank
// or file, never jumping. The one wrinkle is the restricted squares (throne
// + corners): only the king may LAND on them, but any piece may pass over
// the throne while it is empty — an occupied throne blocks like any other
// occupied square, and corners sit on the edge so "passing over" one never
// arises. Rays walk cell by cell and push every landable empty square.

import { CELL_COUNT, DIRECTIONS, isRestricted, step } from './board.js';
import { sideOf, type Piece, type CheckersMove, type CheckersState } from './state.js';

/**
 * All squares the piece on `from` may move to. Empty when the game is over,
 * `from` is out of range or empty, or the piece isn't the mover's.
 */
export function legalDestinations(state: CheckersState, from: number): number[] {
  if (state.result !== null) return [];
  if (!Number.isInteger(from) || from < 0 || from >= CELL_COUNT) return [];
  const piece = state.board.charAt(from) as Piece;
  if (sideOf(piece) !== state.toMove) return [];

  const out: number[] = [];
  for (const dir of DIRECTIONS) {
    for (let cell = step(from, dir); cell !== -1; cell = step(cell, dir)) {
      if (state.board.charAt(cell) !== '.') break; // any piece blocks the ray
      if (piece === 'K' || !isRestricted(cell)) out.push(cell);
      // else: empty restricted square — not landable, but the ray continues
      // (this is what lets pieces slide across the empty throne).
    }
  }
  return out;
}

/** Every legal move for the side to move; empty once the game is over. */
export function allLegalMoves(state: CheckersState): CheckersMove[] {
  if (state.result !== null) return [];
  const moves: CheckersMove[] = [];
  for (let from = 0; from < CELL_COUNT; from++) {
    for (const to of legalDestinations(state, from)) moves.push({ from, to });
  }
  return moves;
}
