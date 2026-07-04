// T1.8: serializeState/deserializeState (exact round-trip), playerView leak
// assertions, serializePublic/parsePublic (IMPLEMENTATION §2 M1).
import { describe, expect, it } from 'vitest';
import {
  RULESETS,
  applyMove,
  deserializeState,
  initialState,
  parsePublic,
  playerView,
  serializePublic,
  serializeState,
  type GameState,
  type Move,
  type Placement,
} from '../src/index.js';
import { riggedBagOrder, stubDict } from './helpers.js';

const classic = RULESETS.classic!;
const dict = stubDict();

function place(row: number, col: number, letter: string, isBlank = false): Placement {
  return { cell: { row, col }, letter, isBlank };
}

function midGameState(): GameState {
  const order = riggedBagOrder(
    classic,
    [
      ['C', 'A', 'T', '?', 'E', 'E', 'E'],
      ['D', 'O', 'G', 'R', 'R', 'R', 'R'],
    ],
    ['Q', 'Z', 'J', 'X'],
  );
  let state = initialState(classic, order, 2);
  const first: Move = { type: 'play', placements: [place(7, 7, 'C'), place(7, 8, 'A'), place(7, 9, 'T')] };
  state = applyMove(state, first, dict);
  const second: Move = { type: 'play', placements: [place(8, 7, 'O'), place(9, 7, 'G')] };
  state = applyMove(state, second, dict);
  // seat 0 drops a blank as S
  const third: Move = { type: 'play', placements: [place(7, 10, 'S', true)] };
  return applyMove(state, third, dict);
}

describe('full state round-trip', () => {
  it('is exact for a fresh state', () => {
    const state = initialState(classic, riggedBagOrder(classic, [], []), 2);
    expect(deserializeState(serializeState(state))).toEqual(state);
  });

  it('is exact mid-game, preserving blank identity on board and racks', () => {
    const state = midGameState();
    const revived = deserializeState(serializeState(state));
    expect(revived).toEqual(state);
    expect(revived.board.get('7,10')).toEqual({ letter: 'S', isBlank: true });
    expect(revived.racks[0]).toEqual(state.racks[0]);
    expect(revived.bag).toEqual(state.bag);
  });

  it('produces identical output regardless of board insertion order', () => {
    const state = midGameState();
    const reordered: GameState = {
      ...state,
      board: new Map([...state.board.entries()].reverse()),
    };
    expect(serializeState(reordered)).toBe(serializeState(state));
  });

  it('rejects garbage', () => {
    expect(() => deserializeState('not json')).toThrow();
    expect(() => deserializeState('{"hello":1}')).toThrow();
    expect(() => deserializeState(JSON.stringify({ rulesetId: 'classic' }))).toThrow();
  });
});

describe('playerView', () => {
  it('projects own rack + counts only', () => {
    const state = midGameState();
    const view = playerView(state, 0);
    expect(view.rack).toEqual(state.racks[0]);
    expect(view.bagCount).toBe(state.bag.length);
    expect(view.rackCounts).toEqual(state.racks.map((r) => r.length));
    expect(view.board).toEqual(state.board);
    expect(view.scores).toEqual(state.scores);
    expect(view.toMove).toBe(state.toMove);
  });

  it('never leaks other racks or bag faces (structural assertion)', () => {
    const state = midGameState();
    const view = playerView(state, 1);
    const keys = Object.keys(view);
    expect(keys).not.toContain('racks');
    expect(keys).not.toContain('bag');
    expect(view.rack).toEqual(state.racks[1]);
    // the serialized view mentions no face sequences from hidden zones
    const text = JSON.stringify({ ...view, board: [...view.board.entries()] });
    expect(text).not.toContain(state.racks[0]!.join(''));
    expect(text).not.toContain(state.bag.slice(0, 5).join(''));
  });

  it('rejects an out-of-range seat', () => {
    const state = midGameState();
    expect(() => playerView(state, 2)).toThrow(/seat/);
    expect(() => playerView(state, -1)).toThrow(/seat/);
  });
});

describe('public snapshot', () => {
  it('round-trips to the rack-less view for every seat', () => {
    const state = midGameState();
    const publicView = parsePublic(serializePublic(state));
    const { rack: _rack0, ...expected } = playerView(state, 0);
    expect(publicView).toEqual(expected);
    const { rack: _rack1, ...expectedFromOther } = playerView(state, 1);
    expect(publicView).toEqual(expectedFromOther);
  });

  it('contains no rack or bag faces at all', () => {
    const state = midGameState();
    const text = serializePublic(state);
    expect(text).not.toContain(state.racks[0]!.join(''));
    expect(text).not.toContain(state.racks[1]!.join(''));
    expect(text).not.toContain(state.bag.slice(0, 5).join(''));
    expect(text).not.toMatch(/"rack"/);
    expect(text).not.toMatch(/"bag"/);
  });
});
