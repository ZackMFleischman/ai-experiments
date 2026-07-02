import { describe, expect, it } from 'vitest';
import {
  add,
  cellKey,
  DIRECTIONS,
  hexEquals,
  hexToPixel,
  neighbors,
  parseKey,
  pixelToHex,
  sub,
} from '../src/hex';

describe('axial hex math (pointy-top)', () => {
  it('has six unit directions summing to zero', () => {
    expect(DIRECTIONS).toHaveLength(6);
    const sum = DIRECTIONS.reduce((acc, d) => add(acc, d), { q: 0, r: 0 });
    expect(sum).toEqual({ q: 0, r: 0 });
    // all distinct
    expect(new Set(DIRECTIONS.map(cellKey)).size).toBe(6);
  });

  it('neighbors returns the six adjacent cells', () => {
    const n = neighbors({ q: 2, r: -1 });
    expect(n).toHaveLength(6);
    expect(n).toContainEqual({ q: 3, r: -1 }); // E
    expect(n).toContainEqual({ q: 1, r: -1 }); // W
    expect(n).toContainEqual({ q: 3, r: -2 }); // NE
    expect(n).toContainEqual({ q: 2, r: -2 }); // NW
    expect(n).toContainEqual({ q: 2, r: 0 }); // SE
    expect(n).toContainEqual({ q: 1, r: 0 }); // SW
  });

  it('add/sub are inverses', () => {
    const a = { q: 3, r: -2 };
    const b = { q: -1, r: 5 };
    expect(sub(add(a, b), b)).toEqual(a);
  });

  it('cellKey/parseKey round-trip', () => {
    for (const h of [{ q: 0, r: 0 }, { q: -3, r: 7 }, { q: 12, r: -12 }]) {
      expect(parseKey(cellKey(h))).toEqual(h);
    }
    expect(cellKey({ q: -3, r: 7 })).toBe('-3,7');
  });

  it('hexToPixel: pointy-top axial layout', () => {
    const size = 10;
    expect(hexToPixel({ q: 0, r: 0 }, size)).toEqual({ x: 0, y: 0 });
    const e = hexToPixel({ q: 1, r: 0 }, size);
    expect(e.x).toBeCloseTo(Math.sqrt(3) * size);
    expect(e.y).toBeCloseTo(0);
    const se = hexToPixel({ q: 0, r: 1 }, size);
    expect(se.x).toBeCloseTo((Math.sqrt(3) / 2) * size);
    expect(se.y).toBeCloseTo(1.5 * size);
  });

  it('pixelToHex inverts hexToPixel at cell centers', () => {
    for (let q = -5; q <= 5; q++) {
      for (let r = -5; r <= 5; r++) {
        const { x, y } = hexToPixel({ q, r }, 24);
        expect(pixelToHex(x, y, 24)).toEqual({ q, r });
      }
    }
  });

  it('pixelToHex round-trips under jitter smaller than the cell (fuzz)', () => {
    // Deterministic pseudo-random jitter; stays well inside the hex.
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
    for (let i = 0; i < 500; i++) {
      const q = Math.round(rand() * 20) || 0;
      const r = Math.round(rand() * 20) || 0;
      const { x, y } = hexToPixel({ q, r }, 16);
      const jx = x + rand() * 16 * 0.45;
      const jy = y + rand() * 16 * 0.45;
      expect(pixelToHex(jx, jy, 16), `jitter around ${q},${r}`).toEqual({ q, r });
    }
  });

  it('hexEquals compares by value', () => {
    expect(hexEquals({ q: 1, r: 2 }, { q: 1, r: 2 })).toBe(true);
    expect(hexEquals({ q: 1, r: 2 }, { q: 2, r: 1 })).toBe(false);
  });
});
