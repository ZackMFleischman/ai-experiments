import { describe, expect, it } from 'vitest';
import * as engine from '../src/index';
import type { GameOptions } from '../src/index';

const options: GameOptions = {
  mosquito: true,
  ladybug: true,
  pillbug: true,
  tournamentOpening: true,
};

describe('frozen API surface (IMPLEMENTATION §5)', () => {
  it('exports exactly the frozen functions', () => {
    for (const fn of [
      'initialState',
      'legalMoves',
      'applyMove',
      'result',
      'toUhp',
      'parseUhp',
      'hash',
      'neighbors',
      'hexToPixel',
      'pixelToHex',
    ] as const) {
      expect(engine[fn], fn).toBeTypeOf('function');
    }
  });

  it('hash returns a bigint', () => {
    expect(typeof engine.hash(engine.initialState(options))).toBe('bigint');
  });
});
