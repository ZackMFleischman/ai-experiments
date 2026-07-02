import { describe, expect, it } from 'vitest';
import fixture from './fixtures/base-surround.json';
import type { GameOptions, GameState, Move } from '../src/index';
import { applyMove, initialState, legalMoves, parseUhp, result, toUhp } from '../src/index';
import { buildState, tile } from './helpers';

describe('UHP serialization (T1.9)', () => {
  it('first move is the bare piece name; pass is "pass"', () => {
    const s = initialState(fixture.options as GameOptions);
    expect(toUhp({ type: 'place', tile: tile('wS1'), to: { q: 0, r: 0 } }, s)).toBe('wS1');
    expect(toUhp({ type: 'pass' }, s)).toBe('pass');
    expect(parseUhp('pass', s)).toEqual({ type: 'pass' });
  });

  it('queen and expansion pieces carry no number; others do', () => {
    const s = buildState([[0, 0, 'wS1']], { toMove: 'b', turn: 1 });
    const uhp = toUhp({ type: 'place', tile: tile('bQ1'), to: { q: 1, r: 0 } }, s);
    expect(uhp).toBe('bQ wS1-');
  });

  it('encodes all six direction markers correctly', () => {
    const s = buildState([[0, 0, 'wS1']], { toMove: 'b', turn: 1 });
    const cases: Array<[q: number, r: number, expected: string]> = [
      [1, 0, 'wS1-'], // E
      [-1, 0, '-wS1'], // W
      [1, -1, 'wS1/'], // NE
      [0, -1, '\\wS1'], // NW
      [0, 1, 'wS1\\'], // SE
      [-1, 1, '/wS1'], // SW
    ];
    for (const [q, r, target] of cases) {
      const move: Move = { type: 'place', tile: tile('bS1'), to: { q, r } };
      expect(toUhp(move, s)).toBe(`bS1 ${target}`);
      expect(parseUhp(`bS1 ${target}`, s)).toEqual(move);
    }
  });

  it('climbs reference the tile being covered (no marker)', () => {
    const s = buildState([[0, 0, 'wQ1'], [1, 0, 'bQ1'], [2, 0, 'bB1']], { toMove: 'b' });
    const climb: Move = { type: 'move', tile: tile('bB1'), from: { q: 2, r: 0 }, to: { q: 1, r: 0 } };
    expect(toUhp(climb, s)).toBe('bB1 bQ');
    expect(parseUhp('bB1 bQ', s)).toEqual(climb);
  });

  it('round-trips every legal move from a mid-game position', () => {
    const s = buildState(
      [
        [0, 0, 'wQ1'],
        [1, 0, 'bQ1', 'wB1'],
        [-1, 0, 'wA1'],
        [2, 0, 'bA1'],
        [0, 1, 'wS1'],
      ],
      { toMove: 'w', turn: 6 },
    );
    for (const m of legalMoves(s)) {
      const uhp = toUhp(m, s);
      expect(parseUhp(uhp, s), uhp).toEqual(m);
    }
  });

  it('rejects strings that reference nothing', () => {
    const s = initialState(fixture.options as GameOptions);
    expect(() => parseUhp('wQ bZ9-', s)).toThrow();
  });
});

describe('full-game fixture replay (T1.9)', () => {
  it('replays the hand-authored game to a white surround win', () => {
    let s: GameState = initialState(fixture.options as GameOptions);
    for (const uhp of fixture.moves) {
      const move = parseUhp(uhp, s);
      // serialization canonicalizes back to an equivalent string that reparses
      expect(parseUhp(toUhp(move, s), s)).toEqual(move);
      s = applyMove(s, move);
    }
    expect(result(s)).toEqual(fixture.expected);
  });
});
