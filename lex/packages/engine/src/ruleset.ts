// Ruleset types + the immutable v1 registry (DESIGN §2.2, IMPLEMENTATION §5).
// Board layout and tile distribution are DATA, not code: the engine computes
// everything from the Ruleset, and swapping to an original layout/tileset is
// a change to this file only (DESIGN §2.2). Registry entries are immutable —
// a rules change means a NEW id, so finished games replay under their
// original rules.

export type Letter = string; // 'A'–'Z'
export type TileFace = Letter | '?'; // '?' = blank (in rack/bag)
export interface Cell {
  row: number;
  col: number;
} // 0-based
export type CellKey = string; // `${row},${col}`
export type Seat = number; // 0-based player index

export const cellKey = (cell: Cell): CellKey => `${cell.row},${cell.col}`;
export function parseCellKey(key: CellKey): Cell {
  const comma = key.indexOf(',');
  return { row: Number(key.slice(0, comma)), col: Number(key.slice(comma + 1)) };
}

export type Premium = 'DL' | 'TL' | 'DW' | 'TW';
export interface BoardLayout {
  id: string;
  rows: number;
  cols: number;
  premiums: Readonly<Record<CellKey, Premium>>;
  start: Cell; // first play covers this
}
export interface TileSet {
  id: string;
  counts: Readonly<Record<TileFace, number>>;
  points: Readonly<Record<TileFace, number>>; // '?' → 0
}
export interface Ruleset {
  id: string;
  board: BoardLayout;
  tiles: TileSet;
  rackSize: number;
  bingoBonus: number;
  exchangeMinBag: number;
  /** Scoreless turns per ACTIVE seat that end the game: 3 ⇒ six at two seats. */
  scorelessRounds: number;
  /** Seat counts this ruleset can be dealt for — a rules dimension like any
   *  other (a reduced-tile board cannot deal four racks). */
  players: { min: number; max: number };
} // dictionary chosen per game (GameOptions)

// Both v1 layouts are 4-fold symmetric, so each is defined by its upper-left
// quadrant (row ≤ start.row, col ≤ start.col) and expanded by mirroring;
// cells on a mirror axis collapse via the map key. The census tests pin the
// expanded counts, which is what actually verifies these lists.
function expand4(rows: number, cols: number, quadrant: ReadonlyArray<readonly [number, number, Premium]>): Readonly<Record<CellKey, Premium>> {
  const premiums: Record<CellKey, Premium> = {};
  for (const [row, col, premium] of quadrant) {
    for (const r of new Set([row, rows - 1 - row])) {
      for (const c of new Set([col, cols - 1 - col])) {
        premiums[`${r},${c}`] = premium;
      }
    }
  }
  return Object.freeze(premiums);
}

// The traditional arrangement: 8 TW / 17 DW (incl. center) / 12 TL / 24 DL.
const CLASSIC_BOARD: BoardLayout = Object.freeze({
  id: 'classic',
  rows: 15,
  cols: 15,
  start: Object.freeze({ row: 7, col: 7 }),
  premiums: expand4(15, 15, [
    [0, 0, 'TW'], [0, 7, 'TW'], [7, 0, 'TW'],
    [1, 1, 'DW'], [2, 2, 'DW'], [3, 3, 'DW'], [4, 4, 'DW'], [7, 7, 'DW'],
    [1, 5, 'TL'], [5, 1, 'TL'], [5, 5, 'TL'],
    [0, 3, 'DL'], [2, 6, 'DL'], [3, 0, 'DL'], [3, 7, 'DL'],
    [6, 2, 'DL'], [6, 6, 'DL'], [7, 3, 'DL'],
  ]),
});

// A WWF-style arrangement: 8 TW / 12 DW / 16 TL / 24 DL, plain-star center.
const MODERN_BOARD: BoardLayout = Object.freeze({
  id: 'modern',
  rows: 15,
  cols: 15,
  start: Object.freeze({ row: 7, col: 7 }),
  premiums: expand4(15, 15, [
    [0, 3, 'TW'], [3, 0, 'TW'],
    [1, 5, 'DW'], [3, 7, 'DW'], [5, 1, 'DW'], [7, 3, 'DW'],
    [0, 6, 'TL'], [3, 3, 'TL'], [5, 5, 'TL'], [6, 0, 'TL'],
    [1, 2, 'DL'], [2, 1, 'DL'], [2, 4, 'DL'], [4, 2, 'DL'], [4, 6, 'DL'], [6, 4, 'DL'],
  ]),
});

// The standard English distribution: 100 tiles, 187 points, 2 blanks.
const STANDARD_TILES: TileSet = Object.freeze({
  id: 'standard',
  counts: Object.freeze({
    A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2,
    N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1,
    '?': 2,
  }),
  points: Object.freeze({
    A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
    N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
    '?': 0,
  }),
});

export const RULESETS: Readonly<Record<string, Ruleset>> = Object.freeze({
  classic: Object.freeze({
    id: 'classic',
    board: CLASSIC_BOARD,
    tiles: STANDARD_TILES,
    rackSize: 7,
    bingoBonus: 50,
    exchangeMinBag: 7,
    scorelessRounds: 3,
    players: Object.freeze({ min: 2, max: 4 }),
  }),
  modern: Object.freeze({
    id: 'modern',
    board: MODERN_BOARD,
    tiles: STANDARD_TILES,
    rackSize: 7,
    bingoBonus: 50,
    exchangeMinBag: 7,
    scorelessRounds: 3,
    players: Object.freeze({ min: 2, max: 4 }),
  }),
});
