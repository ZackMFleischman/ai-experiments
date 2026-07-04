// checkPlay — geometry + rack legality + word extraction (DESIGN §5.2 stage 1).
// Pure verdicts over PlayerView-level knowledge: board + own rack. Dictionary
// checks are a separate stage (§5.2 stage 3) so challenge-mode can skip them.
import type { PlacedTile, Placement } from './board.js';
import { cellKey, type Cell, type CellKey, type Ruleset, type TileFace } from './ruleset.js';

export interface WordScore {
  word: string;
  score: number;
  cells: readonly Cell[];
}
export type PlayCheck =
  | { ok: true; words: readonly WordScore[] } // scores filled by scorePlay
  | {
      ok: false;
      reason:
        | 'not-your-tiles'
        | 'not-a-line'
        | 'gap'
        | 'first-play-center'
        | 'first-play-too-short'
        | 'not-connected'
        | 'occupied'
        | 'off-board';
    };

type Board = ReadonlyMap<CellKey, PlacedTile>;
type Axis = 'H' | 'V';

const LETTER_RE = /^[A-Z]$/;

function reject(reason: Extract<PlayCheck, { ok: false }>['reason']): PlayCheck {
  return { ok: false, reason };
}

/** Walk from `cell` along `axis` in overlay to the word start, then collect. */
function wordThrough(overlay: Board, cell: Cell, axis: Axis): { word: string; cells: Cell[] } {
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

export function checkPlay(board: Board, rack: readonly TileFace[], placements: readonly Placement[], ruleset: Ruleset): PlayCheck {
  const { rows, cols, start } = ruleset.board;
  if (placements.length === 0) return reject('not-a-line');

  // One line: a single shared row (H) or a single shared column (V).
  const sameRow = placements.every((p) => p.cell.row === placements[0]!.cell.row);
  const sameCol = placements.every((p) => p.cell.col === placements[0]!.cell.col);
  if (!sameRow && !sameCol) return reject('not-a-line');

  // Bounds, vacancy, and duplicate placement cells.
  const placedKeys = new Set<CellKey>();
  for (const { cell } of placements) {
    if (cell.row < 0 || cell.col < 0 || cell.row >= rows || cell.col >= cols) return reject('off-board');
    const key = cellKey(cell);
    if (board.has(key) || placedKeys.has(key)) return reject('occupied');
    placedKeys.add(key);
  }

  // Rack legality: blanks consume '?', letters consume themselves.
  const available: Record<string, number> = {};
  for (const face of rack) available[face] = (available[face] ?? 0) + 1;
  for (const placement of placements) {
    if (!LETTER_RE.test(placement.letter)) return reject('not-your-tiles');
    const face = placement.isBlank ? '?' : placement.letter;
    if (!available[face]) return reject('not-your-tiles');
    available[face] -= 1;
  }

  const firstPlay = board.size === 0;
  if (firstPlay) {
    if (!placedKeys.has(cellKey(start))) return reject('first-play-center');
    if (placements.length < 2) return reject('first-play-too-short');
  }

  // Overlay = board + placements; all word walking happens here.
  const overlay = new Map(board);
  for (const placement of placements) {
    overlay.set(cellKey(placement.cell), { letter: placement.letter, isBlank: placement.isBlank });
  }

  // Main axis. A single placement is axis-ambiguous: prefer the horizontal
  // word if one forms, else vertical (the other axis shows up as a cross).
  let axis: Axis;
  if (placements.length > 1) {
    axis = sameRow && !sameCol ? 'H' : 'V';
  } else {
    const horizontal = wordThrough(overlay, placements[0]!.cell, 'H');
    axis = horizontal.word.length >= 2 ? 'H' : 'V';
  }

  // Contiguity: every cell between the placement extremes is filled.
  const along = (cell: Cell) => (axis === 'H' ? cell.col : cell.row);
  const fixed = axis === 'H' ? placements[0]!.cell.row : placements[0]!.cell.col;
  const min = Math.min(...placements.map((p) => along(p.cell)));
  const max = Math.max(...placements.map((p) => along(p.cell)));
  for (let i = min; i <= max; i++) {
    const key = axis === 'H' ? `${fixed},${i}` : `${i},${fixed}`;
    if (!overlay.has(key)) return reject('gap');
  }

  // Words: main first, then per-placement perpendicular crosses (length ≥ 2).
  const main = wordThrough(overlay, placements[0]!.cell, axis);
  const words: WordScore[] = [{ word: main.word, score: 0, cells: main.cells }];
  const crossAxis: Axis = axis === 'H' ? 'V' : 'H';
  for (const placement of placements) {
    const cross = wordThrough(overlay, placement.cell, crossAxis);
    if (cross.cells.length >= 2) words.push({ word: cross.word, score: 0, cells: cross.cells });
  }

  // Connectivity: some formed word must run through an existing tile.
  if (!firstPlay) {
    const touchesBoard = words.some((w) => w.cells.some((cell) => board.has(cellKey(cell))));
    if (!touchesBoard) return reject('not-connected');
  }

  return { ok: true, words };
}
