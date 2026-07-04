// T0.3 seed: proves vitest + fast-check are wired in @lex/engine.
// Real engine tests land with M1.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Cell, CellKey } from '../src/index.js';

const cellKey = (cell: Cell): CellKey => `${cell.row},${cell.col}`;

describe('@lex/engine seed', () => {
  it('cell keys are stable and unique per cell (fast-check wired)', () => {
    fc.assert(
      fc.property(
        fc.record({ row: fc.nat(50), col: fc.nat(50) }),
        fc.record({ row: fc.nat(50), col: fc.nat(50) }),
        (a, b) => {
          expect(cellKey(a) === cellKey(b)).toBe(a.row === b.row && a.col === b.col);
        },
      ),
    );
  });
});
