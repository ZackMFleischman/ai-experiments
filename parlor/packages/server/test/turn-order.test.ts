// T7.4: the seat-choice normalization every game's create path runs through.
// A game that still returns a bare seat index (all four do — 'me' → 0,
// 'them' → 1, 'random' → a coin flip) must keep meaning "the creator takes
// this seat", so the two-seat callable contracts stay untouched.
import { describe, expect, it } from 'vitest';
import { normalizeTurnOrder, type TurnOrderChoice } from '../src/index.js';

describe('normalizeTurnOrder', () => {
  it('lifts today’s bare seat index into the host-seat mode', () => {
    expect(normalizeTurnOrder(0)).toEqual({ mode: 'host-seat', seat: 0 });
    expect(normalizeTurnOrder(1)).toEqual({ mode: 'host-seat', seat: 1 });
    expect(normalizeTurnOrder(3)).toEqual({ mode: 'host-seat', seat: 3 });
  });

  it('passes the three modes through untouched', () => {
    const modes: TurnOrderChoice[] = [
      { mode: 'host-seat', seat: 2 },
      { mode: 'random' },
      { mode: 'arrange', order: ['ada', 'sam', 'lee'] },
    ];
    for (const mode of modes) expect(normalizeTurnOrder(mode)).toBe(mode);
  });
});
