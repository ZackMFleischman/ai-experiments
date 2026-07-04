// @lex/engine — pure rules kernel (zero dependencies, deterministic). The
// exported surface is frozen (IMPLEMENTATION.md §5); extend only with a
// DESIGN.md update in the same PR.

export {
  RULESETS,
  cellKey,
  parseCellKey,
  type BoardLayout,
  type Cell,
  type CellKey,
  type Letter,
  type Premium,
  type Ruleset,
  type Seat,
  type TileFace,
  type TileSet,
} from './ruleset.js';

export { type PlacedTile, type Placement } from './board.js';

export { checkPlay, type PlayCheck, type WordScore } from './validate.js';

export { scorePlay, type PlayScore } from './score.js';

export { IllegalMoveError, applyMove, result, type Dictionary, type GameResult, type Move } from './engine.js';

export { initialState, type GameState, type PlayerView } from './state.js';
