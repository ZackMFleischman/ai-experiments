// T1.1: Ruleset data invariants (IMPLEMENTATION §2 M1). Layouts are built by
// 4-fold quadrant expansion, so the pinned counts below are the real check
// that the quadrant definitions are right; the symmetry test guards any
// future hand-edited layout.
import { describe, expect, it } from 'vitest';
import { RULESETS, type BoardLayout, type Premium, type TileFace } from '../src/index.js';

function premiumCounts(board: BoardLayout): Record<Premium, number> {
  const counts: Record<Premium, number> = { DL: 0, TL: 0, DW: 0, TW: 0 };
  for (const premium of Object.values(board.premiums)) counts[premium] += 1;
  return counts;
}

describe('registry', () => {
  it('ships exactly the two v1 rulesets', () => {
    expect(Object.keys(RULESETS).sort()).toEqual(['classic', 'modern']);
  });

  it('registry entries are immutable', () => {
    expect(Object.isFrozen(RULESETS)).toBe(true);
    for (const ruleset of Object.values(RULESETS)) {
      expect(Object.isFrozen(ruleset)).toBe(true);
      expect(Object.isFrozen(ruleset.board)).toBe(true);
      expect(Object.isFrozen(ruleset.board.premiums)).toBe(true);
      expect(Object.isFrozen(ruleset.tiles)).toBe(true);
      expect(Object.isFrozen(ruleset.tiles.counts)).toBe(true);
      expect(Object.isFrozen(ruleset.tiles.points)).toBe(true);
      expect(ruleset.id in RULESETS).toBe(true);
    }
  });

  it('rule knobs match §2.1 for both rulesets', () => {
    for (const ruleset of Object.values(RULESETS)) {
      expect(ruleset.rackSize).toBe(7);
      expect(ruleset.bingoBonus).toBe(50);
      expect(ruleset.exchangeMinBag).toBe(7);
      expect(ruleset.scorelessLimit).toBe(6);
    }
  });
});

describe('board layouts', () => {
  it('classic premium census: 8 TW / 17 DW / 12 TL / 24 DL', () => {
    expect(premiumCounts(RULESETS.classic!.board)).toEqual({ TW: 8, DW: 17, TL: 12, DL: 24 });
  });

  it('modern premium census: 8 TW / 12 DW / 16 TL / 24 DL', () => {
    expect(premiumCounts(RULESETS.modern!.board)).toEqual({ TW: 8, DW: 12, TL: 16, DL: 24 });
  });

  it('both layouts are 15×15 starting at the center', () => {
    for (const { board } of Object.values(RULESETS)) {
      expect(board.rows).toBe(15);
      expect(board.cols).toBe(15);
      expect(board.start).toEqual({ row: 7, col: 7 });
    }
  });

  it('both layouts are 4-fold symmetric', () => {
    for (const { board } of Object.values(RULESETS)) {
      for (const [key, premium] of Object.entries(board.premiums)) {
        const parts = key.split(',').map(Number);
        const row = parts[0]!;
        const col = parts[1]!;
        for (const mirror of [
          `${row},${board.cols - 1 - col}`,
          `${board.rows - 1 - row},${col}`,
          `${board.rows - 1 - row},${board.cols - 1 - col}`,
        ]) {
          expect(board.premiums[mirror], `${board.id}: mirror of ${key}`).toBe(premium);
        }
      }
    }
  });

  it('every premium cell is on the board', () => {
    for (const { board } of Object.values(RULESETS)) {
      for (const key of Object.keys(board.premiums)) {
        const parts = key.split(',').map(Number);
        const row = parts[0]!;
        const col = parts[1]!;
        expect(row).toBeGreaterThanOrEqual(0);
        expect(col).toBeGreaterThanOrEqual(0);
        expect(row).toBeLessThan(board.rows);
        expect(col).toBeLessThan(board.cols);
      }
    }
  });

  it('classic spot checks (corners TW, center DW, arms)', () => {
    const premiums = RULESETS.classic!.board.premiums;
    expect(premiums['0,0']).toBe('TW');
    expect(premiums['14,14']).toBe('TW');
    expect(premiums['0,7']).toBe('TW');
    expect(premiums['7,7']).toBe('DW');
    expect(premiums['1,1']).toBe('DW');
    expect(premiums['13,13']).toBe('DW');
    expect(premiums['1,5']).toBe('TL');
    expect(premiums['5,9']).toBe('TL');
    expect(premiums['0,3']).toBe('DL');
    expect(premiums['7,3']).toBe('DL');
    expect(premiums['7,0']).toBe('TW');
    expect(premiums['0,1']).toBeUndefined();
  });

  it('modern spot checks (WWF-style arms, plain-star center)', () => {
    const premiums = RULESETS.modern!.board.premiums;
    expect(premiums['0,3']).toBe('TW');
    expect(premiums['3,0']).toBe('TW');
    expect(premiums['14,11']).toBe('TW');
    expect(premiums['0,6']).toBe('TL');
    expect(premiums['3,3']).toBe('TL');
    expect(premiums['5,5']).toBe('TL');
    expect(premiums['1,5']).toBe('DW');
    expect(premiums['3,7']).toBe('DW');
    expect(premiums['1,2']).toBe('DL');
    expect(premiums['6,4']).toBe('DL');
    expect(premiums['7,7']).toBeUndefined(); // WWF center is a plain star
    expect(premiums['0,0']).toBeUndefined();
  });
});

describe('standard tile set', () => {
  it('100 tiles, 187 points, 2 blanks — the §2.1 pins', () => {
    for (const { tiles } of Object.values(RULESETS)) {
      const faces = Object.keys(tiles.counts) as TileFace[];
      const total = faces.reduce((sum, face) => sum + tiles.counts[face]!, 0);
      const points = faces.reduce((sum, face) => sum + tiles.counts[face]! * tiles.points[face]!, 0);
      expect(total).toBe(100);
      expect(points).toBe(187);
      expect(tiles.counts['?']).toBe(2);
      expect(tiles.points['?']).toBe(0);
      expect(faces.sort()).toHaveLength(27); // A–Z + '?'
    }
  });

  it('spot checks of the standard distribution', () => {
    const tiles = RULESETS.classic!.tiles;
    expect(tiles.counts.E).toBe(12);
    expect(tiles.counts.A).toBe(9);
    expect(tiles.counts.Q).toBe(1);
    expect(tiles.counts.Z).toBe(1);
    expect(tiles.points.Q).toBe(10);
    expect(tiles.points.Z).toBe(10);
    expect(tiles.points.E).toBe(1);
    expect(tiles.points.K).toBe(5);
    expect(tiles.points.J).toBe(8);
    expect(tiles.points.X).toBe(8);
  });

  it('both rulesets share the standard tile set', () => {
    expect(RULESETS.modern!.tiles).toBe(RULESETS.classic!.tiles);
  });
});
