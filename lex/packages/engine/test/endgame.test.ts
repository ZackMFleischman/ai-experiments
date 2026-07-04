// T1.6: end conditions, final adjustments, result() — one fixture per ending
// (IMPLEMENTATION §2 M1, §6). Endgame states are rigged directly: applyMove
// trusts state shape, so tests can start mid-game.
import { describe, expect, it } from 'vitest';
import { IllegalMoveError, RULESETS, applyMove, initialState, result, type CellKey, type GameState, type PlacedTile, type Placement, type TileFace } from '../src/index.js';
import { canonicalBagOrder, stubDict } from './helpers.js';

const classic = RULESETS.classic!;
const dict = stubDict();

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

// CAT through the center, both racks nearly empty, bag empty.
function endgameState(overrides: Partial<GameState> = {}): GameState {
  return {
    rulesetId: 'classic',
    board: boardFrom([
      [7, 6, 'C'],
      [7, 7, 'A'],
      [7, 8, 'T'],
    ]),
    racks: [
      ['S', 'E'] as TileFace[],
      ['Q', 'X'] as TileFace[], // 10 + 8 = 18 stranded points
    ],
    bag: [],
    scores: [50, 60],
    toMove: 0,
    moveCount: 10,
    scorelessRun: 0,
    ...overrides,
  };
}

describe('played-out ending', () => {
  it('finisher gains the opponent rack sum; opponent deducts it', () => {
    const state = endgameState();
    // Seat 0 plays out both tiles: ES vertically ending in CATS.
    const next = applyMove(state, { type: 'play', placements: [place(6, 9, 'E'), place(7, 9, 'S')] }, dict);
    // ES = 1+1 = 2; CATS cross = 3+1+1+1 = 6 ⇒ +8; then +18 from Q,X; opponent −18.
    expect(next.racks[0]).toHaveLength(0);
    expect(next.scores).toEqual([50 + 8 + 18, 60 - 18]);
    expect(result(next)).toEqual({
      status: 'finished',
      winner: 0,
      by: 'played-out',
      finalScores: [76, 42],
    });
  });

  it('an adjusted tie is a draw (no first-player tiebreak)', () => {
    // Rig scores so the adjustment lands equal: 50+8+18 = 76 ⇔ 94−18 = 76.
    const state = endgameState({ scores: [50, 94] });
    const next = applyMove(state, { type: 'play', placements: [place(6, 9, 'E'), place(7, 9, 'S')] }, dict);
    expect(next.scores).toEqual([76, 76]);
    expect(result(next)).toMatchObject({ status: 'finished', winner: 'draw', by: 'played-out' });
  });

  it('with N players the finisher collects every stranded rack', () => {
    const state = endgameState({
      racks: [['S', 'E'] as TileFace[], ['Q'] as TileFace[], ['Z', 'J'] as TileFace[]],
      scores: [0, 0, 0],
      toMove: 0,
    });
    const next = applyMove(state, { type: 'play', placements: [place(6, 9, 'E'), place(7, 9, 'S')] }, dict);
    // play 8; gains Q(10) + Z+J(18) = 28
    expect(next.scores).toEqual([8 + 28, -10, -18]);
    expect(result(next)).toMatchObject({ status: 'finished', winner: 0 });
  });

  it('a played-out ending is not possible while the bag holds tiles', () => {
    const state = endgameState({ bag: ['B', 'B'] as TileFace[] });
    const next = applyMove(state, { type: 'play', placements: [place(6, 9, 'E'), place(7, 9, 'S')] }, dict);
    expect(next.racks[0]).toHaveLength(2); // refilled
    expect(result(next)).toEqual({ status: 'ongoing' });
  });
});

describe('scoreless-limit ending', () => {
  it('the 6th consecutive scoreless turn ends the game; each deducts their own rack', () => {
    const state = endgameState({ scorelessRun: 5, bag: ['B', 'B', 'B'] as TileFace[] });
    const next = applyMove(state, { type: 'pass' }, dict);
    expect(next.scorelessRun).toBe(6);
    // seat 0 deducts S+E = 2; seat 1 deducts Q+X = 18
    expect(next.scores).toEqual([48, 42]);
    expect(result(next)).toEqual({ status: 'finished', winner: 0, by: 'scoreless', finalScores: [48, 42] });
  });

  it('a scoreless deduction can produce a draw', () => {
    const state = endgameState({ scores: [50, 66], scorelessRun: 5, bag: ['B'] as TileFace[] });
    const next = applyMove(state, { type: 'pass' }, dict);
    expect(next.scores).toEqual([48, 48]);
    expect(result(next)).toMatchObject({ winner: 'draw', by: 'scoreless' });
  });

  it('a scoring play resets the run and keeps the game alive', () => {
    const state = endgameState({ scorelessRun: 5, bag: ['B', 'B'] as TileFace[] });
    const next = applyMove(state, { type: 'play', placements: [place(7, 9, 'S')] }, dict);
    expect(next.scorelessRun).toBe(0);
    expect(result(next)).toEqual({ status: 'ongoing' });
  });
});

describe('terminal states', () => {
  it('result() is ongoing for a fresh game', () => {
    const state = initialState(classic, canonicalBagOrder(classic), 2);
    expect(result(state)).toEqual({ status: 'ongoing' });
  });

  it('applyMove refuses moves on a finished game', () => {
    const state = endgameState({ scorelessRun: 5, bag: ['B'] as TileFace[] });
    const finished = applyMove(state, { type: 'pass' }, dict);
    expect(() => applyMove(finished, { type: 'pass' }, dict)).toThrow(IllegalMoveError);
    expect(() => applyMove(finished, { type: 'pass' }, dict)).toThrow(/game-over/);
  });

  it('a 0-point play-out still ends as played-out (precedence over scoreless)', () => {
    const state = endgameState({
      racks: [['?'] as TileFace[], ['Q'] as TileFace[]],
      scorelessRun: 5,
    });
    // blank-S completes CATS for... blank scores 0, cross total 5? CATS = 3+1+1+0 = 5.
    // That scores > 0. Use an isolated 0-score: blank as S on (7,9): CATS = C3+A1+T1+?0 = 5 > 0.
    // Make the existing letters blanks too so the word is worth 0.
    const zeroBoard = boardFrom([
      [7, 6, 'C', true],
      [7, 7, 'A', true],
      [7, 8, 'T', true],
    ]);
    const next = applyMove({ ...state, board: zeroBoard }, { type: 'play', placements: [place(7, 9, 'S', true)] }, dict);
    expect(next.scores).toEqual([50 + 0 + 10, 60 - 10]);
    expect(result(next)).toMatchObject({ by: 'played-out', winner: 0 });
  });
});
