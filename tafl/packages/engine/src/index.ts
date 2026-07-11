// @tafl/engine — the pure, deterministic rules kernel for hnefatafl on the
// classic 11×11 board: rook moves, custodian captures, a king racing for the
// corners. Zero dependencies, no DOM, no clock, no Math.random — state in,
// state out. Clients fold applyTafl over a move log; resign/timeout entries
// fold with resignTafl/timeoutTafl.

export { applyTafl, resignTafl, timeoutTafl } from './apply.js';

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
  deserializeTafl,
  initialTafl,
  otherSide,
  pieceAt,
  positionKey,
  serializeTafl,
  sideOf,
  type Piece,
  type Side,
  type TaflMove,
  type TaflResult,
  type TaflState,
} from './state.js';
