import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dayKey, hashSeed, mulberry32, randomInt, shuffle } from '../src/index.js';

describe('dayKey', () => {
  it('formats the local calendar date', () => {
    expect(dayKey(new Date(2026, 6, 10, 23, 59))).toBe('2026-07-10');
    expect(dayKey(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });
});

describe('hashSeed', () => {
  it('is deterministic and distinguishes nearby keys', () => {
    expect(hashSeed('2026-07-10')).toBe(hashSeed('2026-07-10'));
    expect(hashSeed('2026-07-10')).not.toBe(hashSeed('2026-07-11'));
    expect(hashSeed('daily:easy')).not.toBe(hashSeed('daily:hard'));
  });

  it('always yields a uint32', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const h = hashSeed(s);
        expect(Number.isInteger(h)).toBe(true);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(0xffffffff);
      }),
    );
  });
});

describe('mulberry32', () => {
  it('same seed, same sequence', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('different seeds diverge', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const same = Array.from({ length: 20 }, () => a() === b());
    expect(same.every(Boolean)).toBe(false);
  });

  it('stays in [0, 1)', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const rng = mulberry32(seed);
        for (let i = 0; i < 50; i++) {
          const x = rng();
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(1);
        }
      }),
    );
  });
});

describe('randomInt', () => {
  it('covers [0, bound) under a seeded rng', () => {
    const rng = mulberry32(7);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const n = randomInt(rng, 5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(5);
      seen.add(n);
    }
    expect(seen.size).toBe(5);
  });
});

describe('shuffle', () => {
  it('is a deterministic permutation that leaves the input untouched', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 30 }), fc.integer(), (items, seed) => {
        const input = [...items];
        const a = shuffle(items, mulberry32(seed));
        const b = shuffle(items, mulberry32(seed));
        expect(items).toEqual(input);
        expect(a).toEqual(b);
        expect([...a].sort((x, y) => x - y)).toEqual([...items].sort((x, y) => x - y));
      }),
    );
  });
});
