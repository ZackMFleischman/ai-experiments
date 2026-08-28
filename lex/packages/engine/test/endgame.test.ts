// T1.6: end conditions, final adjustments, result() — one fixture per ending
// (IMPLEMENTATION §2 M1, §6). Endgame states are rigged directly: applyMove
// trusts state shape, so tests can start mid-game.
import { describe, expect, it } from 'vitest';
import { IllegalMoveError, RULESETS, applyMove, initialState, result, withdraw, type CellKey, type GameState, type PlacedTile, type Placement, type TileFace } from '../src/index.js';
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
    withdrawn: [],
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

// T7.2: the limit is `scorelessRounds` turns per ACTIVE seat, so it is the
// same six at two seats and grows with the table (DECISIONS 2026-08-28).
describe('the scoreless limit scales with the active seats', () => {
  const rackedSeats = (seats: number) => [['S', 'E'], ['Q', 'X'], ['L', 'N'], ['P', 'D']].slice(0, seats) as TileFace[][];

  function passAt(seats: number, scorelessRun: number): GameState {
    const state = endgameState({
      racks: rackedSeats(seats),
      scores: Array.from({ length: seats }, () => 0),
      bag: ['B', 'B', 'B'] as TileFace[],
      scorelessRun,
    });
    return applyMove(state, { type: 'pass' }, dict);
  }

  it.each([
    [2, 6],
    [3, 9],
    [4, 12],
  ])('at %i seats the game ends on the %ith scoreless turn, not before', (seats, limit) => {
    expect(result(passAt(seats, limit - 2)).status).toBe('ongoing');
    expect(passAt(seats, limit - 1).scorelessRun).toBe(limit);
    expect(result(passAt(seats, limit - 1))).toMatchObject({ status: 'finished', by: 'scoreless' });
  });

  it('shrinks when a player withdraws: a run of 6 is survivable at three seats until one leaves', () => {
    const three = endgameState({
      racks: rackedSeats(3),
      scores: [0, 0, 0],
      bag: ['B', 'B', 'B'] as TileFace[],
      scorelessRun: 6,
    });
    expect(result(three).status).toBe('ongoing'); // limit 9
    // Seat 1 leaves: two active seats, limit 6, and the run is already there.
    expect(result(withdraw(three, 1))).toMatchObject({ status: 'finished', by: 'scoreless' });
  });

  it('deducts only the seats still holding tiles', () => {
    const base = endgameState({
      racks: rackedSeats(3),
      scores: [50, 60, 70],
      bag: ['B', 'B', 'B'] as TileFace[],
    });
    const short = { ...withdraw(base, 1), scorelessRun: 5 }; // limit is now 6
    const next = applyMove(short, { type: 'pass' }, dict);
    expect(result(next)).toMatchObject({ status: 'finished', by: 'scoreless' });
    // seat 0 deducts S+E = 2, seat 2 deducts L+N = 2; seat 1's score is frozen.
    expect(next.scores).toEqual([48, 60, 68]);
  });
});

// T7.2: everyone else left (DECISIONS 2026-08-28 — resign/timeout at 3+).
describe('last-standing ending', () => {
  it('ends the game when only one active seat remains', () => {
    const base = endgameState({
      racks: [['S', 'E'], ['Q', 'X'], ['L', 'N']] as TileFace[][],
      scores: [90, 60, 70],
      bag: ['B', 'B'] as TileFace[],
    });
    const one = withdraw(base, 1);
    expect(result(one).status).toBe('ongoing');
    const two = withdraw(one, 2);
    expect(result(two)).toMatchObject({ status: 'finished', by: 'last-standing' });
  });

  it('adjusts nothing — every score is frozen exactly as it stood', () => {
    const base = endgameState({
      racks: [['S', 'E'], ['Q', 'X'], ['L', 'N']] as TileFace[][],
      scores: [90, 60, 70],
      bag: ['B', 'B'] as TileFace[],
    });
    const ended = withdraw(withdraw(base, 1), 2);
    expect([...ended.scores]).toEqual([90, 60, 70]);
    expect(result(ended)).toMatchObject({ finalScores: [90, 60, 70] });
  });

  it('is terminal at two seats, where a withdrawal has always ended the game', () => {
    const ended = withdraw(endgameState({ bag: ['B', 'B'] as TileFace[] }), 1);
    expect(result(ended)).toMatchObject({ status: 'finished', by: 'last-standing', finalScores: [50, 60] });
    expect(() => applyMove(ended, { type: 'pass' }, dict)).toThrow(/game-over/);
  });

  it('outranks a played-out rack', () => {
    // Seat 0 has played out AND seats 1–2 have withdrawn: last-standing wins,
    // so no pot changes hands.
    const state = endgameState({
      racks: [[], [], []] as TileFace[][],
      scores: [10, 20, 30],
      withdrawn: [1, 2],
    });
    expect(result(state)).toMatchObject({ status: 'finished', by: 'last-standing', finalScores: [10, 20, 30] });
  });
});

describe('withdrawn seats sit out the played-out pot', () => {
  it('the finisher collects from active seats only', () => {
    const state = endgameState({
      racks: [['S', 'E'], [], ['Z', 'J']] as TileFace[][],
      scores: [0, 0, 0],
      withdrawn: [1],
      toMove: 0,
    });
    const next = applyMove(state, { type: 'play', placements: [place(6, 9, 'E'), place(7, 9, 'S')] }, dict);
    // play 8; gains Z+J = 18 from seat 2. Seat 1 holds nothing and is untouched.
    expect(next.scores).toEqual([8 + 18, 0, -18]);
    expect(result(next)).toMatchObject({ status: 'finished', by: 'played-out' });
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
