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
