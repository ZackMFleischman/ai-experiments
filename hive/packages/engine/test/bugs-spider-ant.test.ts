import { describe, expect, it } from 'vitest';
import { antDestinations } from '../src/bugs/ant';
import { BUG_DESTINATIONS } from '../src/bugs/index';
import { spiderDestinations } from '../src/bugs/spider';
import { buildState, hex } from './helpers';

const keys = (hs: Array<{ q: number; r: number }>) => new Set(hs.map((h) => `${h.q},${h.r}`));

describe('spider (T1.7)', () => {
  it('walks exactly three steps around a lone tile, landing on the far side', () => {
    const s = buildState([
      [0, 0, 'wS1'],
      [1, 0, 'bQ1'],
    ]);
    expect(keys(spiderDestinations(s.board, hex(0, 0)))).toEqual(new Set(['2,0']));
  });

  it('exactly three — two-step and four-step cells are not destinations', () => {
    const s = buildState([
      [0, 0, 'wS1'],
      [1, 0, 'bQ1'],
      [2, 0, 'bS1'],
    ]);
    const dests = keys(spiderDestinations(s.board, hex(0, 0)));
    expect(dests).toEqual(new Set(['3,-1', '2,1']));
    expect(dests).not.toContain('2,-1'); // 2 steps
    expect(dests).not.toContain('3,0'); // 4 steps
  });

  it('cannot pass through gates while walking', () => {
    // Pocket cell 1,0 is gated by 1,-1 / 0,1 — no spider path may enter it.
    const s = buildState([
      [0, 0, 'wS1'],
      [1, -1, 'wS2'],
      [0, 1, 'wA1'],
      [2, -1, 'bQ1'],
      [1, 1, 'bS1'],
    ]);
    expect(keys(spiderDestinations(s.board, hex(0, 0)))).not.toContain('1,0');
  });
});

describe('ant (T1.7)', () => {
  it('reaches every perimeter cell around a lone tile', () => {
    const s = buildState([
      [0, 0, 'wA1'],
      [1, 0, 'bQ1'],
    ]);
    expect(keys(antDestinations(s.board, hex(0, 0)))).toEqual(
      new Set(['1,-1', '2,-1', '2,0', '1,1', '0,1']),
    );
  });

  it('cannot enter a pocket sealed behind a gate', () => {
    const s = buildState([
      [0, 0, 'wA1'],
      [1, -1, 'wS1'],
      [0, 1, 'wS2'],
      [2, -1, 'bQ1'],
      [1, 1, 'bS1'],
    ]);
    const dests = keys(antDestinations(s.board, hex(0, 0)));
    expect(dests).not.toContain('1,0'); // gated pocket
    expect(dests.size).toBeGreaterThan(4); // but the outside perimeter is open
  });

  it('never lands on occupied cells and never returns to its start', () => {
    const s = buildState([
      [0, 0, 'wA1'],
      [1, 0, 'bQ1'],
      [2, 0, 'bS1'],
    ]);
    const dests = antDestinations(s.board, hex(0, 0));
    for (const d of dests) {
      expect(s.board.has(`${d.q},${d.r}`)).toBe(false);
    }
    expect(keys(dests)).not.toContain('0,0');
  });
});

describe('registry (T1.7)', () => {
  it('exposes spider and ant generators', () => {
    expect(BUG_DESTINATIONS.S).toBe(spiderDestinations);
    expect(BUG_DESTINATIONS.A).toBe(antDestinations);
  });
});
