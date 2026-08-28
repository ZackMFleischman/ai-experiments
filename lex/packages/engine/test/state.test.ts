// T1.2: bag + initialState — permutation validation, seat-order dealing,
// deterministic draw (IMPLEMENTATION §2 M1).
import { describe, expect, it } from 'vitest';
import { RULESETS, applyMove, initialState, turnQueue, withdraw, type GameState } from '../src/index.js';
import { draw } from '../src/state.js';
import { canonicalBagOrder, rotatedBagOrder, stubDict } from './helpers.js';

const classic = RULESETS.classic!;
const dict = stubDict();

describe('initialState', () => {
  it('deals racks in seat order and leaves the rest as the bag (front = next draw)', () => {
    const order = rotatedBagOrder(classic, 13);
    const state = initialState(classic, order, 2);
    expect(state.rulesetId).toBe('classic');
    expect(state.racks).toHaveLength(2);
    expect([...state.racks[0]!]).toEqual(order.slice(0, 7));
    expect([...state.racks[1]!]).toEqual(order.slice(7, 14));
    expect([...state.bag]).toEqual(order.slice(14));
    expect(state.bag[0]).toBe(order[14]);
    expect(state.board.size).toBe(0);
    expect([...state.scores]).toEqual([0, 0]);
    expect(state.toMove).toBe(0);
    expect(state.moveCount).toBe(0);
    expect(state.scorelessRun).toBe(0);
  });

  it('supports N seats (engine is seat-indexed from day one)', () => {
    const order = canonicalBagOrder(classic);
    const state = initialState(classic, order, 3);
    expect(state.racks).toHaveLength(3);
    expect([...state.racks[2]!]).toEqual(order.slice(14, 21));
    expect([...state.scores]).toEqual([0, 0, 0]);
    expect(state.bag).toHaveLength(100 - 21);
  });

  it('same bag order ⇒ identical states (determinism)', () => {
    const order = rotatedBagOrder(classic, 41);
    const a = initialState(classic, order, 2);
    const b = initialState(classic, order, 2);
    expect(a).toEqual(b);
  });

  it('rejects a bag order that is not a permutation of the tile set', () => {
    const order = canonicalBagOrder(classic);

    // wrong length
    expect(() => initialState(classic, order.slice(1), 2)).toThrow(/permutation/);

    // right length, wrong multiset (a second Q replacing a Z)
    const swapped = [...order];
    swapped[swapped.indexOf('Z')] = 'Q';
    expect(() => initialState(classic, swapped, 2)).toThrow(/permutation/);

    // an alien face
    const alien = [...order];
    alien[0] = '#';
    expect(() => initialState(classic, alien, 2)).toThrow(/permutation/);
  });

  it('rejects seat counts outside the ruleset’s players range', () => {
    const order = canonicalBagOrder(classic);
    expect(classic.players).toEqual({ min: 2, max: 4 });
    expect(() => initialState(classic, order, 0)).toThrow(/seats/);
    expect(() => initialState(classic, order, 1)).toThrow(/seats/);
    expect(() => initialState(classic, order, 5)).toThrow(/seats/);
    expect(() => initialState(classic, order, 2.5)).toThrow(/seats/);
    // The whole declared range deals.
    for (const seats of [2, 3, 4]) expect(initialState(classic, order, seats).racks).toHaveLength(seats);
  });

  it('returns a deeply frozen state', () => {
    const state = initialState(classic, canonicalBagOrder(classic), 2);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.racks)).toBe(true);
    expect(Object.isFrozen(state.racks[0])).toBe(true);
    expect(Object.isFrozen(state.bag)).toBe(true);
    expect(Object.isFrozen(state.scores)).toBe(true);
  });
});

// T7.3: the one source of turn order — the UI never derives the rotation.
describe('turnQueue', () => {
  const fresh = (seats: number) => initialState(classic, canonicalBagOrder(classic), seats);

  it('starts at toMove and rotates through every seat', () => {
    expect(turnQueue(fresh(2))).toEqual([0, 1]);
    expect(turnQueue(fresh(4))).toEqual([0, 1, 2, 3]);
    const midway: GameState = { ...fresh(4), toMove: 2 };
    expect(turnQueue(midway)).toEqual([2, 3, 0, 1]);
  });

  it('tracks the seat to move as play goes round', () => {
    let state: GameState = fresh(3);
    expect(turnQueue(state)).toEqual([0, 1, 2]);
    state = applyMove(state, { type: 'pass' }, dict);
    expect(turnQueue(state)).toEqual([1, 2, 0]);
    state = applyMove(state, { type: 'pass' }, dict);
    expect(turnQueue(state)).toEqual([2, 0, 1]);
  });

  it('leaves out withdrawn seats', () => {
    const state = withdraw(fresh(4), 1);
    expect(turnQueue(state)).toEqual([0, 2, 3]);
    expect(turnQueue({ ...state, toMove: 2 })).toEqual([2, 3, 0]);
  });

  it('narrows to the survivor once everyone else has gone', () => {
    expect(turnQueue(withdraw(withdraw(fresh(3), 1), 2))).toEqual([0]);
  });
});

describe('draw', () => {
  it('draws from the bag front without mutating the input', () => {
    const bag = ['A', 'B', 'C', 'D'] as const;
    const { drawn, rest } = draw(bag, 3);
    expect(drawn).toEqual(['A', 'B', 'C']);
    expect(rest).toEqual(['D']);
    expect([...bag]).toEqual(['A', 'B', 'C', 'D']);
  });

  it('draws what remains when the bag runs short (final-refill rule)', () => {
    const { drawn, rest } = draw(['X', 'Y'], 7);
    expect(drawn).toEqual(['X', 'Y']);
    expect(rest).toEqual([]);
  });
});
