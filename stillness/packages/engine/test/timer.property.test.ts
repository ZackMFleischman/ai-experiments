// Property gate (validate:m1): no schedule of pause/resume/tick can break the
// timer arithmetic. STILLNESS_PROP_RUNS widens the sweep for the validate
// gate; the default keeps `pnpm test` fast.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  elapsedMs,
  formatRemaining,
  isDone,
  pauseSit,
  remainingMs,
  resumeSit,
  startSit,
} from '../src/index';

declare const process: { env: Record<string, string | undefined> };

const RUNS = Number(process.env['STILLNESS_PROP_RUNS'] ?? 100);

const YEAR_2100_MS = 4_102_444_800_000;

const arbDuration = fc.integer({ min: 1_000, max: 3_600_000 }); // 1 s – 60 min
const arbStart = fc.integer({ min: 0, max: YEAR_2100_MS });
const arbOps = fc.array(
  fc.record({
    kind: fc.constantFrom('pause', 'resume', 'tick'),
    deltaMs: fc.integer({ min: 0, max: 10 * 60_000 }),
  }),
  { maxLength: 40 },
);

describe('sit timer properties', () => {
  it('remaining is clamped, complements elapsed, never increases, and formats consistently', () => {
    fc.assert(
      fc.property(arbDuration, arbStart, arbOps, (durationMs, t0, ops) => {
        let t = startSit(durationMs, t0);
        let now = t0;
        let prevRemaining = remainingMs(t, now);
        for (const { kind, deltaMs } of ops) {
          now += deltaMs;
          if (kind === 'pause') t = pauseSit(t, now);
          else if (kind === 'resume') t = resumeSit(t, now);
          const rem = remainingMs(t, now);
          const el = elapsedMs(t, now);
          expect(rem).toBeGreaterThanOrEqual(0);
          expect(el).toBeGreaterThanOrEqual(0);
          expect(rem).toBeLessThanOrEqual(durationMs);
          expect(rem + Math.min(el, durationMs)).toBe(durationMs);
          expect(rem).toBeLessThanOrEqual(prevRemaining); // wall time never adds back
          expect(isDone(t, now)).toBe(rem === 0);
          const [m = '', s = ''] = formatRemaining(t, now).split(':');
          expect(Number(m) * 60 + Number(s)).toBe(Math.ceil(rem / 1000));
          prevRemaining = rem;
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('while paused, wall time is irrelevant', () => {
    fc.assert(
      fc.property(
        arbDuration,
        arbStart,
        fc.integer({ min: 0, max: 3_600_000 }), // sit a while before pausing
        fc.integer({ min: 0, max: 7 * 24 * 3_600_000 }), // stay paused up to a week
        (durationMs, t0, sitMs, pausedMs) => {
          const paused = pauseSit(startSit(durationMs, t0), t0 + sitMs);
          const atPause = remainingMs(paused, t0 + sitMs);
          expect(remainingMs(paused, t0 + sitMs + pausedMs)).toBe(atPause);
          // resume banks the span: remaining is unchanged at the resume instant
          const resumed = resumeSit(paused, t0 + sitMs + pausedMs);
          expect(remainingMs(resumed, t0 + sitMs + pausedMs)).toBe(atPause);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
