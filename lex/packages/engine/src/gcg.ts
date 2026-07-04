// GCG-style notation (DESIGN §2.4): coordinates like 8H (row-first =
// horizontal) / H8 (column-first = vertical), 1-based rows, letter columns;
// the whole main word including played-through tiles; blanks lowercase;
// exchange "-CE?"; pass "-". Fixture/interop format only — the wire format
// is typed JSON Moves.
import { extractWords, type Axis } from './board.js';
import { rulesetOf, scorePlayOf, type Move } from './engine.js';
import type { Cell, GameState, TileFace } from './index.js';

const COL_A = 'A'.charCodeAt(0);
const colLetter = (col: number) => String.fromCharCode(COL_A + col);

export function toGcg(move: Move, state: GameState): string {
  if (move.type === 'pass') return '-';
  if (move.type === 'exchange') return `-${move.tiles.join('')}`;

  const { words, overlay, axis } = extractWords(state.board, move.placements);
  const main = words[0]!;
  const start = main.cells[0]!;
  const coordinate =
    axis === 'H' ? `${start.row + 1}${colLetter(start.col)}` : `${colLetter(start.col)}${start.row + 1}`;
  const letters = main.cells
    .map((cell) => {
      const tile = overlay.get(`${cell.row},${cell.col}`)!;
      return tile.isBlank ? tile.letter.toLowerCase() : tile.letter;
    })
    .join('');
  const { total } = scorePlayOf(state, move.placements);
  return `${coordinate} ${letters} +${total}`;
}

export function parseGcg(line: string, state: GameState): Move {
  const trimmed = line.trim();
  if (trimmed === '-') return { type: 'pass' };
  if (trimmed.startsWith('-')) {
    const tiles = trimmed.slice(1).split('') as TileFace[];
    if (tiles.length === 0 || tiles.some((t) => !/^[A-Z?]$/.test(t))) {
      throw new Error(`bad exchange form: '${line}'`);
    }
    return { type: 'exchange', tiles };
  }

  const parts = trimmed.split(/\s+/);
  const coordinate = parts[0];
  const word = parts[1];
  if (!coordinate || !word) throw new Error(`bad GCG line: '${line}'`);

  let start: Cell;
  let axis: Axis;
  let match: RegExpMatchArray | null;
  if ((match = coordinate.match(/^(\d+)([A-Z])$/))) {
    start = { row: Number(match[1]) - 1, col: match[2]!.charCodeAt(0) - COL_A };
    axis = 'H';
  } else if ((match = coordinate.match(/^([A-Z])(\d+)$/))) {
    start = { row: Number(match[2]) - 1, col: match[1]!.charCodeAt(0) - COL_A };
    axis = 'V';
  } else {
    throw new Error(`bad GCG coordinate: '${coordinate}'`);
  }

  const { rows, cols } = rulesetOf(state).board;
  const placements: Array<{ cell: Cell; letter: string; isBlank: boolean }> = [];
  let { row, col } = start;
  for (const char of word) {
    if (!/^[A-Za-z]$/.test(char)) throw new Error(`bad GCG letter: '${char}' in '${word}'`);
    if (row >= rows || col >= cols) throw new Error(`'${coordinate} ${word}' runs off the board`);
    const existing = state.board.get(`${row},${col}`);
    if (existing) {
      if (existing.letter !== char.toUpperCase()) {
        throw new Error(`mismatch at ${row},${col}: board has '${existing.letter}', line says '${char}'`);
      }
    } else {
      placements.push({ cell: { row, col }, letter: char.toUpperCase(), isBlank: char !== char.toUpperCase() });
    }
    if (axis === 'H') col += 1;
    else row += 1;
  }
  if (placements.length === 0) throw new Error(`'${line}' places nothing new`);
  return { type: 'play', placements };
}
