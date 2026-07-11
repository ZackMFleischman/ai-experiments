// The arcade archetype's key gate (BRAND-IMPLEMENTATION.md 4a): same seed +
// same input trace → identical end state. BREAKOUT_PROP_RUNS widens the
// sweep (validate:m1 runs 200); the default keeps `pnpm test` fast.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  advance,
  initBreakout,
  type BreakoutAction,
  type BreakoutState,
} from '../src/index.js';

declare const process: { env: Record<string, string | undefined> };

const RUNS = Number(process.env['BREAKOUT_PROP_RUNS'] ?? 25);

const action: fc.Arbitrary<BreakoutAction> = fc.oneof(
  fc.record({
    t: fc.constant<'move'>('move'),
    dir: fc.constantFrom<-1 | 0 | 1>(-1, 0, 1),
  }),
  fc.record({
    t: fc.constant<'target'>('target'),
    x: fc.double({ min: -20, max: 140, noNaN: true }),
  }),
  fc.record({ t: fc.constant<'serve'>('serve') }),
);

/** A sparse trace over `ticks`: at most one action burst per tick. */
const traceArb = fc.record({
  seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
  ticks: fc.integer({ min: 100, max: 4000 }),
  bursts: fc.array(
    fc.record({
      tick: fc.integer({ min: 0, max: 3999 }),
      actions: fc.array(action, { minLength: 1, maxLength: 3 }),
    }),
    { maxLength: 30 },
  ),
});

function playOut(
  seed: number,
  ticks: number,
  bursts: readonly { tick: number; actions: BreakoutAction[] }[],
): BreakoutState {
  const byTick = new Map<number, BreakoutAction[]>();
  for (const burst of bursts) {
    byTick.set(burst.tick, [...(byTick.get(burst.tick) ?? []), ...burst.actions]);
  }
  let state = initBreakout({ seed });
  for (let tick = 0; tick < ticks; tick++) {
    state = advance(state, byTick.get(tick) ?? []);
  }
  return state;
}

describe('determinism', () => {
  it('same seed + same input trace → identical end state', () => {
    fc.assert(
      fc.property(traceArb, ({ seed, ticks, bursts }) => {
        const a = playOut(seed, ticks, bursts);
        const b = playOut(seed, ticks, bursts);
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      }),
      { numRuns: RUNS },
    );
  });

  it('advance never mutates its input', () => {
    const before = initBreakout({ seed: 7 });
    const frozen = JSON.stringify(before);
    let s = advance(before, [{ t: 'serve' }]);
    for (let i = 0; i < 500; i++) s = advance(s, [{ t: 'target', x: s.ball?.x ?? 60 }]);
    expect(JSON.stringify(before)).toBe(frozen);
  });

  it('a golden trace pins the fold across refactors', () => {
    // A short scripted game: serve, chase the ball for 1500 ticks.
    let s = initBreakout({ seed: 20260710 });
    s = advance(s, [{ t: 'serve' }]);
    for (let i = 0; i < 1500; i++) {
      s = advance(s, [{ t: 'target', x: s.ball?.x ?? s.paddleX }]);
    }
    // If a physics/layout change moves these numbers, that's a deliberate
    // rules change — update the golden values in the same PR that makes it.
    expect({
      tick: s.tick,
      phase: s.phase,
      score: s.score,
      lives: s.lives,
      level: s.level,
    }).toEqual({ tick: 1501, phase: 'live', score: 40, lives: 3, level: 1 });
  });
});
