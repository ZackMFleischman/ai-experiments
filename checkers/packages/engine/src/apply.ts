// The move fold: applyCheckers(state, move) → new state. Pure and immutable —
// board edits happen on a char array copy, `seen` is respread. Custodian
// captures are evaluated only for the mover, only around the destination:
// an enemy neighbor dies iff the square beyond it (same direction) is on the
// board and is a mover-friendly piece or a hostile square (corners always;
// the throne while empty). The king is armed (a valid capturer) and dies
// two-sided like anyone else; a piece is never captured by walking itself
// between two enemies. Result checks run in a fixed order after captures:
// king captured → king on a corner → opponent stuck → threefold repetition.

import { CORNERS, DIRECTIONS, isCorner, step, THRONE } from './board.js';
import { allLegalMoves, legalDestinations } from './moves.js';
import {
  IllegalMoveError,
  otherSide,
  positionKey,
  sideOf,
  type Piece,
  type Side,
  type CheckersMove,
  type CheckersState,
} from './state.js';

export function applyCheckers(state: CheckersState, move: CheckersMove): CheckersState {
  if (state.result !== null) {
    throw new IllegalMoveError('game is over');
  }
  const { from, to } = move;
  if (!legalDestinations(state, from).includes(to)) {
    throw new IllegalMoveError(`illegal move ${from}->${to} for ${state.toMove}`);
  }

  const mover = state.toMove;
  const enemy = otherSide(mover);
  const cells = state.board.split('');
  const piece = cells[from] as Piece; // legalDestinations proved it's real
  cells[from] = '.';
  cells[to] = piece;

  // Custodian captures against the post-move board. The four directions are
  // independent (a neighbor in one is never the "beyond" of another), so
  // collect first, remove after.
  const captured: number[] = [];
  for (const dir of DIRECTIONS) {
    const n = step(to, dir);
    if (n === -1) continue;
    const victim = (cells[n] ?? '.') as Piece;
    if (sideOf(victim) !== enemy) continue;
    const b = step(n, dir);
    if (b === -1) continue; // off-board backing never captures
    const beyond = (cells[b] ?? '.') as Piece;
    const friendlyAnvil = sideOf(beyond) === mover;
    const hostileSquare = isCorner(b) || (b === THRONE && beyond === '.');
    if (friendlyAnvil || hostileSquare) captured.push(n);
  }
  for (const c of captured) cells[c] = '.';

  const board = cells.join('');
  const toMove = enemy;
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
  if (!board.includes('K')) {
    return { ...next, result: { winner: 'attackers', by: 'capture' } };
  }
  if (CORNERS.some((corner) => board.charAt(corner) === 'K')) {
    return { ...next, result: { winner: 'defenders', by: 'escape' } };
  }
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
