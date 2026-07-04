// T1.5: applyMove — full play pipeline, refill, exchange/pass legality,
// scorelessRun bookkeeping, IllegalMoveError paths (IMPLEMENTATION §2 M1).
import { describe, expect, it } from 'vitest';
import { IllegalMoveError, RULESETS, applyMove, initialState, type Move, type Placement } from '../src/index.js';
import { riggedBagOrder, stubDict } from './helpers.js';

const classic = RULESETS.classic!;
const dict = stubDict();

function place(row: number, col: number, letter: string, isBlank = false): Placement {
  return { cell: { row, col }, letter, isBlank };
}

/** Seat 0: CATSEEE, seat 1: DOGRRRR, then bag continues Q Z J X … */
function startState() {
  const order = riggedBagOrder(
    classic,
    [
      ['C', 'A', 'T', 'S', 'E', 'E', 'E'],
      ['D', 'O', 'G', 'R', 'R', 'R', 'R'],
    ],
    ['Q', 'Z', 'J', 'X'],
  );
  return initialState(classic, order, 2);
}

const CAT_PLAY: Move = { type: 'play', placements: [place(7, 7, 'C'), place(7, 8, 'A'), place(7, 9, 'T')] };

describe('applyMove: play', () => {
  it('applies a legal play: board, score, refill from bag front, turn advance', () => {
    const state = startState();
    const next = applyMove(state, CAT_PLAY, dict);

    expect(next.board.get('7,7')).toEqual({ letter: 'C', isBlank: false });
    expect(next.board.get('7,8')).toEqual({ letter: 'A', isBlank: false });
    expect(next.board.get('7,9')).toEqual({ letter: 'T', isBlank: false });
    expect(next.scores[0]).toBe(10); // CAT across the center DW
    expect([...next.racks[0]!]).toEqual(['S', 'E', 'E', 'E', 'Q', 'Z', 'J']); // refilled in bag order
    expect(next.bag[0]).toBe('X');
    expect(next.toMove).toBe(1);
    expect(next.moveCount).toBe(1);
    expect(next.scorelessRun).toBe(0);
    expect(next.racks[1]).toEqual(state.racks[1]); // untouched
  });

  it('does not mutate the input state', () => {
    const state = startState();
    applyMove(state, CAT_PLAY, dict);
    expect(state.board.size).toBe(0);
    expect(state.scores[0]).toBe(0);
    expect([...state.racks[0]!]).toEqual(['C', 'A', 'T', 'S', 'E', 'E', 'E']);
  });

  it('rejects illegal geometry with the checkPlay reason', () => {
    const state = startState();
    const move: Move = { type: 'play', placements: [place(0, 0, 'C'), place(0, 1, 'A')] };
    expect(() => applyMove(state, move, dict)).toThrow(IllegalMoveError);
    expect(() => applyMove(state, move, dict)).toThrow(/first-play-center/);
  });

  it('rejects tiles not in the mover rack', () => {
    const state = startState();
    const move: Move = { type: 'play', placements: [place(7, 7, 'Z'), place(7, 8, 'A')] };
    expect(() => applyMove(state, move, dict)).toThrow(/not-your-tiles/);
  });

  it('rejects a play containing an invalid word, naming it', () => {
    const state = startState();
    const picky = stubDict(['CAT']);
    let thrown: unknown;
    try {
      applyMove(state, CAT_PLAY, picky);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(IllegalMoveError);
    expect((thrown as IllegalMoveError).message).toMatch(/CAT/);
    expect((thrown as IllegalMoveError).words).toEqual(['CAT']);
  });

  it('a 0-point play increments scorelessRun; a scoring play resets it', () => {
    // Two blanks as the first play score 0.
    const order = riggedBagOrder(classic, [
      ['?', '?', 'A', 'A', 'A', 'A', 'A'],
      ['D', 'O', 'G', 'R', 'R', 'R', 'R'],
    ]);
    const state = initialState(classic, order, 2);
    const zeroPlay: Move = { type: 'play', placements: [place(7, 7, 'O', true), place(7, 8, 'N', true)] };
    const afterZero = applyMove(state, zeroPlay, dict);
    expect(afterZero.scores[0]).toBe(0);
    expect(afterZero.scorelessRun).toBe(1);

    const scoring: Move = { type: 'play', placements: [place(8, 7, 'O'), place(8, 8, 'G')] };
    const afterScore = applyMove(afterZero, scoring, dict);
    expect(afterScore.scorelessRun).toBe(0);
  });

  it('rejects an unknown ruleset id', () => {
    const state = { ...startState(), rulesetId: 'martian' };
    expect(() => applyMove(state, CAT_PLAY, dict)).toThrow(/ruleset/);
  });
});

describe('applyMove: exchange', () => {
  it('swaps tiles: draws from the bag front, appends returned tiles to the bag end', () => {
    const state = startState();
    const next = applyMove(state, { type: 'exchange', tiles: ['C', 'E', 'E'] }, dict);
    expect([...next.racks[0]!]).toEqual(['A', 'T', 'S', 'E', 'Q', 'Z', 'J']);
    expect(next.bag).toHaveLength(state.bag.length); // count conserved
    expect(next.bag.slice(-3)).toEqual(['C', 'E', 'E']); // returned at the end
    expect(next.bag[0]).toBe('X'); // Q/Z/J drawn
    expect(next.scorelessRun).toBe(1);
    expect(next.toMove).toBe(1);
    expect(next.moveCount).toBe(1);
    expect(next.scores).toEqual(state.scores);
  });

  it('requires the bag to hold at least exchangeMinBag tiles', () => {
    // Drain the bag to 6 by rigging a state manually.
    const state = startState();
    const drained = { ...state, bag: state.bag.slice(0, 6) };
    expect(() => applyMove(drained, { type: 'exchange', tiles: ['C'] }, dict)).toThrow(/exchange/);
    const exactly7 = { ...state, bag: state.bag.slice(0, 7) };
    expect(applyMove(exactly7, { type: 'exchange', tiles: ['C'] }, dict).scorelessRun).toBe(1);
  });

  it('rejects exchanging tiles the rack does not hold, and empty exchanges', () => {
    const state = startState();
    expect(() => applyMove(state, { type: 'exchange', tiles: ['Z'] }, dict)).toThrow(IllegalMoveError);
    expect(() => applyMove(state, { type: 'exchange', tiles: ['E', 'E', 'E', 'E'] }, dict)).toThrow(IllegalMoveError);
    expect(() => applyMove(state, { type: 'exchange', tiles: [] }, dict)).toThrow(IllegalMoveError);
  });

  it('can exchange a blank', () => {
    const order = riggedBagOrder(
      classic,
      [
        ['?', 'A', 'A', 'A', 'A', 'A', 'A'],
        ['D', 'O', 'G', 'R', 'R', 'R', 'R'],
      ],
      ['B'], // otherwise the sorted remainder would hand back the other blank
    );
    const state = initialState(classic, order, 2);
    const next = applyMove(state, { type: 'exchange', tiles: ['?'] }, dict);
    expect(next.racks[0]).not.toContain('?');
    expect(next.bag[next.bag.length - 1]).toBe('?');
  });
});

describe('applyMove: pass', () => {
  it('costs the turn and increments scorelessRun; nothing else moves', () => {
    const state = startState();
    const next = applyMove(state, { type: 'pass' }, dict);
    expect(next.toMove).toBe(1);
    expect(next.moveCount).toBe(1);
    expect(next.scorelessRun).toBe(1);
    expect(next.board.size).toBe(0);
    expect(next.racks).toEqual(state.racks);
    expect(next.bag).toEqual(state.bag);
    expect(next.scores).toEqual(state.scores);
  });

  it('turn rotation wraps around N seats', () => {
    const order = riggedBagOrder(classic, [
      ['A', 'A', 'A', 'A', 'A', 'A', 'A'],
      ['D', 'O', 'G', 'R', 'R', 'R', 'R'],
      ['E', 'E', 'E', 'E', 'E', 'E', 'E'],
    ]);
    let state = initialState(classic, order, 3);
    state = applyMove(state, { type: 'pass' }, dict);
    expect(state.toMove).toBe(1);
    state = applyMove(state, { type: 'pass' }, dict);
    expect(state.toMove).toBe(2);
    state = applyMove(state, { type: 'pass' }, dict);
    expect(state.toMove).toBe(0);
  });
});

describe('refill edge', () => {
  it('the final refill draws what remains when the bag runs short', () => {
    const state = startState();
    const shortBag = { ...state, bag: state.bag.slice(0, 2) }; // Q, Z
    const next = applyMove(shortBag, CAT_PLAY, dict);
    expect([...next.racks[0]!]).toEqual(['S', 'E', 'E', 'E', 'Q', 'Z']); // 6 tiles now
    expect(next.bag).toHaveLength(0);
  });
});
