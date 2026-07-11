// @checkers/engine — the pure, deterministic rules kernel for Brandub, the 7×7
// hnefacheckers variant: rook moves, custodian captures, a king racing for the
// corners. Zero dependencies, no DOM, no clock, no Math.random — state in,
// state out. Clients fold applyCheckers over a move log; resign/timeout entries
// fold with resignCheckers/timeoutCheckers.

export { applyCheckers, resignCheckers, timeoutCheckers } from './apply.js';

export {
  BOARD_SIZE,
  CORNERS,
  THRONE,
  cellName,
  moveName,
} from './board.js';

export { allLegalMoves, legalDestinations } from './moves.js';

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
