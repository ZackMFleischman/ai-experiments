// checkPlay — geometry + rack legality + word extraction (DESIGN §5.2 stage 1).
// Pure verdicts over PlayerView-level knowledge: board + own rack. Dictionary
// checks are a separate stage (§5.2 stage 3) so challenge-mode can skip them.
import { extractWords, type Board, type Placement } from './board.js';
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

const LETTER_RE = /^[A-Z]$/;

function reject(reason: Extract<PlayCheck, { ok: false }>['reason']): PlayCheck {
  return { ok: false, reason };
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

  const { words, overlay, axis } = extractWords(board, placements);

  // Contiguity: every cell between the placement extremes is filled.
  const along = (cell: Cell) => (axis === 'H' ? cell.col : cell.row);
  const fixed = axis === 'H' ? placements[0]!.cell.row : placements[0]!.cell.col;
  const min = Math.min(...placements.map((p) => along(p.cell)));
  const max = Math.max(...placements.map((p) => along(p.cell)));
  for (let i = min; i <= max; i++) {
    const key = axis === 'H' ? `${fixed},${i}` : `${i},${fixed}`;
    if (!overlay.has(key)) return reject('gap');
  }

  // Connectivity: some formed word must run through an existing tile.
  if (!firstPlay) {
    const touchesBoard = words.some((w) => w.cells.some((cell) => board.has(cellKey(cell))));
    if (!touchesBoard) return reject('not-connected');
  }

  return { ok: true, words: words.map(({ word, cells }) => ({ word, cells, score: 0 })) };
}
