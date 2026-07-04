// T1.7: GCG-style notation (DESIGN §2.4) — row-first coordinate = horizontal
// (8H = row 8, col H), column-first = vertical (H8); blanks lowercase; whole
// main word including played-through tiles; exchange/pass forms.
import { describe, expect, it } from 'vitest';
import { RULESETS, initialState, parseGcg, toGcg, type CellKey, type GameState, type Move, type PlacedTile, type Placement, type TileFace } from '../src/index.js';
import { canonicalBagOrder } from './helpers.js';

const classic = RULESETS.classic!;

function boardFrom(entries: ReadonlyArray<readonly [number, number, string, boolean?]>): Map<CellKey, PlacedTile> {
  const board = new Map<CellKey, PlacedTile>();
  for (const [row, col, letter, isBlank] of entries) {
    board.set(`${row},${col}`, { letter, isBlank: isBlank ?? false });
  }
  return board;
}

function place(row: number, col: number, letter: string, isBlank = false): Placement {
  return { cell: { row, col }, letter, isBlank };
}

function stateWith(board: Map<CellKey, PlacedTile>): GameState {
  return { ...initialState(classic, canonicalBagOrder(classic), 2), board };
}

const emptyState = stateWith(boardFrom([]));
const catState = stateWith(
  boardFrom([
    [7, 6, 'C'],
    [7, 7, 'A'],
    [7, 8, 'T'],
  ]),
);

function sortPlacements(move: Move): Move {
  if (move.type !== 'play') return move;
  const placements = [...move.placements].sort((a, b) => a.cell.row - b.cell.row || a.cell.col - b.cell.col);
  return { type: 'play', placements };
}

describe('toGcg', () => {
  it('writes a horizontal play as row-first with the score', () => {
    const move: Move = { type: 'play', placements: [place(7, 7, 'C'), place(7, 8, 'A'), place(7, 9, 'T')] };
    expect(toGcg(move, emptyState)).toBe('8H CAT +10');
  });

  it('writes a vertical play column-first', () => {
    const move: Move = { type: 'play', placements: [place(6, 9, 'A'), place(7, 9, 'S')] };
    // AS at col J starting row 7 (1-based); AS=2 + cross CATS=6 ⇒ +8
    expect(toGcg(move, catState)).toBe('J7 AS +8');
  });

  it('includes played-through tiles and lowercases blanks', () => {
    const move: Move = { type: 'play', placements: [place(7, 5, 'S'), place(7, 9, 'S', true)] };
    // S CAT s → SCATs from (7,5), horizontal ⇒ 8F
    expect(toGcg(move, catState)).toBe('8F SCATs +6');
  });

  it('lowercases played-through blanks too', () => {
    const state = stateWith(
      boardFrom([
        [7, 6, 'C'],
        [7, 7, 'A', true],
        [7, 8, 'T'],
      ]),
    );
    const move: Move = { type: 'play', placements: [place(7, 9, 'S')] };
    expect(toGcg(move, state)).toBe('8G CaTS +5');
  });

  it('writes exchanges and passes', () => {
    expect(toGcg({ type: 'exchange', tiles: ['C', 'E', '?'] }, catState)).toBe('-CE?');
    expect(toGcg({ type: 'pass' }, catState)).toBe('-');
  });
});

describe('parseGcg', () => {
  it('parses a horizontal play, skipping played-through tiles', () => {
    const move = parseGcg('8F SCATs +6', catState);
    expect(sortPlacements(move)).toEqual({
      type: 'play',
      placements: [place(7, 5, 'S'), place(7, 9, 'S', true)],
    });
  });

  it('parses a vertical play', () => {
    const move = parseGcg('J7 AS', catState); // score suffix optional
    expect(sortPlacements(move)).toEqual({
      type: 'play',
      placements: [place(6, 9, 'A'), place(7, 9, 'S')],
    });
  });

  it('parses exchange and pass forms', () => {
    expect(parseGcg('-CE?', catState)).toEqual({ type: 'exchange', tiles: ['C', 'E', '?'] as TileFace[] });
    expect(parseGcg('-', catState)).toEqual({ type: 'pass' });
  });

  it('rejects malformed lines', () => {
    expect(() => parseGcg('', catState)).toThrow();
    expect(() => parseGcg('ZZ CAT', catState)).toThrow(/coordinate/);
    expect(() => parseGcg('8H', catState)).toThrow();
    expect(() => parseGcg('1A C4T', catState)).toThrow(/letter/);
  });

  it('rejects a word that runs off the board', () => {
    expect(() => parseGcg('8N CATS', catState)).toThrow(/off/);
  });

  it('rejects a mismatch with an existing tile', () => {
    // (7,6) holds C; claiming X there is a lie
    expect(() => parseGcg('8G XATS', catState)).toThrow(/mismatch/);
  });

  it('rejects a play that places nothing new', () => {
    expect(() => parseGcg('8G CAT', catState)).toThrow(/nothing/);
  });
});

describe('round trips', () => {
  const cases: Array<[string, Move, GameState]> = [
    ['first play', { type: 'play', placements: [place(7, 7, 'C'), place(7, 8, 'A'), place(7, 9, 'T')] }, emptyState],
    ['through + blank', { type: 'play', placements: [place(7, 5, 'S'), place(7, 9, 'S', true)] }, catState],
    ['vertical', { type: 'play', placements: [place(6, 9, 'A'), place(7, 9, 'S')] }, catState],
    ['exchange', { type: 'exchange', tiles: ['E', 'E', '?'] as TileFace[] }, catState],
    ['pass', { type: 'pass' }, catState],
  ];

  for (const [name, move, state] of cases) {
    it(`round-trips ${name}`, () => {
      expect(sortPlacements(parseGcg(toGcg(move, state), state))).toEqual(sortPlacements(move));
    });
  }
});
