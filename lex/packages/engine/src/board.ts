// Grid cells, word extraction, connectivity (DESIGN §5.1, §5.3). The board is
// sparse: only occupied cells, keyed "row,col", bounded by the BoardLayout.
import type { Cell, Letter } from './ruleset.js';

export interface PlacedTile {
  letter: Letter;
  isBlank: boolean;
}
export interface Placement extends PlacedTile {
  cell: Cell;
}
