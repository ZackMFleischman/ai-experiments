// The move fold: applyCheckers(state, move) → new state. Pure and immutable —
// board edits happen on a char array copy, `seen` is respread. A move is a
// complete path; validation is by construction: the path must be one of
// legalMovesFrom(state, path[0])'s complete paths, which bakes in mandatory
// capture (a simple move is illegal while any jump exists) and mandatory
// continuation (stopping a multi-jump early is illegal). Execution walks the
// path, lifting each jumped piece (the hop's midpoint), and crowns a man
// that ends on the far row. Result checks run in a fixed order after the
// move: opponent has no legal moves (covers no-pieces and blocked alike) →
// threefold repetition.

import { rowOf } from './board.js';
import { allLegalMoves, crownRow, legalMovesFrom } from './moves.js';
import {
  IllegalMoveError,
  otherSide,
  positionKey,
  type Piece,
  type Side,
  type CheckersMove,
  type CheckersState,
} from './state.js';

function samePath(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((cell, i) => cell === b[i]);
}

export function applyCheckers(state: CheckersState, move: CheckersMove): CheckersState {
  if (state.result !== null) {
    throw new IllegalMoveError('game is over');
  }
  const path = move.path;
  const from = path[0];
  if (from === undefined || !legalMovesFrom(state, from).some((m) => samePath(m.path, path))) {
    throw new IllegalMoveError(`illegal move ${path.join('-')} for ${state.toMove}`);
  }

  const mover = state.toMove;
  const cells = state.board.split('');
  const piece = cells[from] as Piece; // legalMovesFrom proved it's real
  cells[from] = '.';
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as number;
    const b = path[i] as number;
    if (Math.abs(rowOf(b) - rowOf(a)) === 2) cells[(a + b) / 2] = '.'; // the jumped piece
  }
  const landing = path[path.length - 1] as number;
  const crowned =
    (piece === 'd' || piece === 'l') && rowOf(landing) === crownRow(mover)
      ? ((piece === 'd' ? 'D' : 'L') as Piece)
      : piece;
  cells[landing] = crowned;

  const board = cells.join('');
  const toMove = otherSide(mover);
  const key = positionKey(board, toMove);
  const seen: Record<string, number> = {
    ...state.seen,
    [key]: (state.seen[key] ?? 0) + 1,
  };
  const next: CheckersState = {
    board,
    toMove,
    moveCount: state.moveCount + 1,
    seen,
    result: null,
  };

  // Ordered end-of-move checks.
  if (allLegalMoves(next).length === 0) {
    return { ...next, result: { winner: mover, by: 'no-moves' } };
  }
  if ((seen[key] ?? 0) >= 3) {
    return { ...next, result: { winner: null, by: 'repetition' } };
  }
  return next;
}

function foldEnd(state: CheckersState, by: Side, how: 'resign' | 'timeout'): CheckersState {
  if (state.result !== null) {
    throw new IllegalMoveError(`cannot ${how}: game is over`);
  }
  return { ...state, result: { winner: otherSide(by), by: how } };
}

/** Mark the game lost by `by` via resignation. Throws if already over. */
export function resignCheckers(state: CheckersState, by: Side): CheckersState {
  return foldEnd(state, by, 'resign');
}

/** Mark the game lost by `by` via clock timeout. Throws if already over. */
export function timeoutCheckers(state: CheckersState, by: Side): CheckersState {
  return foldEnd(state, by, 'timeout');
}
