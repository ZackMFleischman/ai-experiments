import { describe, expect, it } from 'vitest';
import * as engine from '../src/index';
import type { GameOptions } from '../src/index';

const options: GameOptions = {
  mosquito: true,
  ladybug: true,
  pillbug: true,
  tournamentOpening: true,
};

describe('engine skeleton', () => {
  it('exports the frozen API surface', () => {
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

  it('stub bodies throw unimplemented (replaced milestone by milestone)', () => {
    expect(() => engine.initialState(options)).toThrowError(/unimplemented/);
  });
});
