import { describe, expect, it } from 'vitest';
import type { GameOptions, TileId } from '../src/index';
import { initialState } from '../src/index';
import {
  handCount,
  parseTileKey,
  placeTile,
  removeTop,
  stackAt,
  tileKey,
  topTile,
} from '../src/state';

const ALL_ON: GameOptions = { mosquito: true, ladybug: true, pillbug: true, tournamentOpening: true };
const BASE: GameOptions = { mosquito: false, ladybug: false, pillbug: false, tournamentOpening: false };

const wQ: TileId = { color: 'w', kind: 'Q', ordinal: 1 };
const wB1: TileId = { color: 'w', kind: 'B', ordinal: 1 };

describe('initialState', () => {
  it('base game hands: Q1 A3 S2 G3 B2, no expansion bugs', () => {
    const s = initialState(BASE);
    for (const color of ['w', 'b'] as const) {
      expect(s.hands[color]).toEqual({ Q: 1, A: 3, S: 2, G: 3, B: 2, M: 0, L: 0, P: 0 });
    }
  });

  it('expansions add M/L/P one each when enabled', () => {
    const s = initialState(ALL_ON);
    expect(s.hands.w.M).toBe(1);
    expect(s.hands.w.L).toBe(1);
    expect(s.hands.b.P).toBe(1);
  });

  it('starts empty, white to move, turn 1', () => {
    const s = initialState(ALL_ON);
    expect(s.board.size).toBe(0);
    expect(s.toMove).toBe('w');
    expect(s.turn).toBe(1);
    expect(s.passCount).toBe(0);
    expect(s.positionHashes).toEqual([]);
    expect(s.lastMoved).toBeUndefined();
  });
});

describe('board helpers (immutable)', () => {
  it('placeTile stacks bottom→top and never mutates the input map', () => {
    const b0 = new Map();
    const b1 = placeTile(b0, { q: 0, r: 0 }, wQ);
    const b2 = placeTile(b1, { q: 0, r: 0 }, wB1);
    expect(b0.size).toBe(0);
    expect(stackAt(b1, { q: 0, r: 0 })).toEqual([wQ]);
    expect(stackAt(b2, { q: 0, r: 0 })).toEqual([wQ, wB1]);
    expect(topTile(b2, { q: 0, r: 0 })).toEqual(wB1);
  });

  it('removeTop pops only the top and deletes emptied cells', () => {
    const b = placeTile(placeTile(new Map(), { q: 1, r: 1 }, wQ), { q: 1, r: 1 }, wB1);
    const b1 = removeTop(b, { q: 1, r: 1 });
    expect(stackAt(b1, { q: 1, r: 1 })).toEqual([wQ]);
    const b2 = removeTop(b1, { q: 1, r: 1 });
    expect(b2.has('1,1')).toBe(false);
    // input untouched
    expect(stackAt(b, { q: 1, r: 1 })).toEqual([wQ, wB1]);
  });

  it('tileKey/parseTileKey round-trip', () => {
    expect(tileKey(wB1)).toBe('wB1');
    expect(parseTileKey('bA3')).toEqual({ color: 'b', kind: 'A', ordinal: 3 });
    expect(parseTileKey(tileKey(wQ))).toEqual(wQ);
  });

  it('handCount adjusts immutably', () => {
    const s = initialState(BASE);
    const hands = handCount(s.hands, 'w', 'A', -1);
    expect(hands.w.A).toBe(2);
    expect(s.hands.w.A).toBe(3);
    expect(hands.b).toEqual(s.hands.b);
  });
});
