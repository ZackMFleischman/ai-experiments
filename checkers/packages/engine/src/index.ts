// @checkers/engine — the pure, deterministic rules kernel for American
// checkers (English draughts): 8×8 board, men march diagonally forward,
// mandatory captures with mandatory multi-jump continuation, crowning on the
// far row. Zero dependencies, no DOM, no clock, no Math.random — state in,
// state out. Clients fold applyCheckers over a move log; resign/timeout
// entries fold with resignCheckers/timeoutCheckers.

export { applyCheckers, resignCheckers, timeoutCheckers } from './apply.js';

export { BOARD_SIZE, CELL_COUNT, cellName, isPlayable, moveName } from './board.js';

export { allLegalMoves, crownRow, legalMovesFrom } from './moves.js';

export {
  IllegalMoveError,
  deserializeCheckers,
  initialCheckers,
  otherSide,
  pieceAt,
  positionKey,
  serializeCheckers,
  sideOf,
  type Piece,
  type Side,
  type CheckersMove,
  type CheckersResult,
  type CheckersState,
} from './state.js';
