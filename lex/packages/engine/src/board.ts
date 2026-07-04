// Grid cells, word extraction, connectivity (DESIGN §5.1, §5.3). The board is
// sparse: only occupied cells, keyed "row,col", bounded by the BoardLayout.
// Extraction is shared by checkPlay (words formed) and scorePlay (scoring).
import { cellKey, type Cell, type CellKey, type Letter } from './ruleset.js';

export interface PlacedTile {
  letter: Letter;
  isBlank: boolean;
}
export interface Placement extends PlacedTile {
  cell: Cell;
}

export type Board = ReadonlyMap<CellKey, PlacedTile>;
export type Axis = 'H' | 'V';

export interface ExtractedWord {
  word: string;
  cells: Cell[];
}

/** Walk from `cell` along `axis` in `overlay` to the word start, then collect. */
export function wordThrough(overlay: Board, cell: Cell, axis: Axis): ExtractedWord {
  const dRow = axis === 'V' ? 1 : 0;
  const dCol = axis === 'H' ? 1 : 0;
  let { row, col } = cell;
  while (overlay.has(`${row - dRow},${col - dCol}`)) {
    row -= dRow;
    col -= dCol;
  }
  let word = '';
  const cells: Cell[] = [];
  while (true) {
    const tile = overlay.get(`${row},${col}`);
    if (!tile) break;
    word += tile.letter;
    cells.push({ row, col });
    row += dRow;
    col += dCol;
  }
  return { word, cells };
}

/**
 * All words formed by a placement set: the main-axis word first, then
 * per-placement perpendicular crosses of length ≥ 2. Assumes the placements
 * are collinear and vacant (checkPlay validates that); a single placement is
 * axis-ambiguous — the horizontal word wins if one forms.
 */
export function extractWords(board: Board, placements: readonly Placement[]): { words: ExtractedWord[]; overlay: Board; axis: Axis } {
  const overlay = new Map(board);
  for (const placement of placements) {
    overlay.set(cellKey(placement.cell), { letter: placement.letter, isBlank: placement.isBlank });
  }

  let axis: Axis;
  if (placements.length > 1) {
    const sameRow = placements.every((p) => p.cell.row === placements[0]!.cell.row);
    axis = sameRow ? 'H' : 'V';
  } else {
    const horizontal = wordThrough(overlay, placements[0]!.cell, 'H');
    axis = horizontal.word.length >= 2 ? 'H' : 'V';
  }

  const words: ExtractedWord[] = [wordThrough(overlay, placements[0]!.cell, axis)];
  const crossAxis: Axis = axis === 'H' ? 'V' : 'H';
  for (const placement of placements) {
    const cross = wordThrough(overlay, placement.cell, crossAxis);
    if (cross.cells.length >= 2) words.push(cross);
  }
  return { words, overlay, axis };
}
