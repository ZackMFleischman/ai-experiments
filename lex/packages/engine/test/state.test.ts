// T1.2: bag + initialState — permutation validation, seat-order dealing,
// deterministic draw (IMPLEMENTATION §2 M1).
import { describe, expect, it } from 'vitest';
import { RULESETS, initialState } from '../src/index.js';
import { draw } from '../src/state.js';
import { canonicalBagOrder, rotatedBagOrder } from './helpers.js';

const classic = RULESETS.classic!;

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

  it('rejects nonsensical seat counts', () => {
    const order = canonicalBagOrder(classic);
    expect(() => initialState(classic, order, 0)).toThrow(/seats/);
    expect(() => initialState(classic, order, 1)).toThrow(/seats/);
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
