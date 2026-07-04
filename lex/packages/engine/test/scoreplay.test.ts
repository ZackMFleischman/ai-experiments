// T1.4: scorePlay — pinned score fixtures (IMPLEMENTATION §6). scorePlay
// trusts geometry (checkPlay's job) and just scores, so fixtures may place
// hypothetical tiles directly.
import { describe, expect, it } from 'vitest';
import { RULESETS, scorePlay, type CellKey, type PlacedTile, type Placement } from '../src/index.js';

const classic = RULESETS.classic!;

function boardFrom(entries: ReadonlyArray<readonly [number, number, string, boolean?]>): Map<CellKey, PlacedTile> {
  const board = new Map<CellKey, PlacedTile>();
  for (const [row, col, letter, isBlank] of entries) {
    board.set(`${row},${col}`, { letter, isBlank: isBlank ?? false });
  }
  return board;
}

function place(row: number, col: number, letter: string, isBlank = false): Placement {
  return { cell: { row, col }, letter, isBlank };
}

const empty = boardFrom([]);
const catBoard = boardFrom([
  [7, 6, 'C'],
  [7, 7, 'A'],
  [7, 8, 'T'],
]);

describe('scorePlay fixtures', () => {
  it('first play across the center DW doubles the word', () => {
    // C(3) A(1) T(1) with (7,7) DW ⇒ 5×2
    const result = scorePlay(empty, [place(7, 7, 'C'), place(7, 8, 'A'), place(7, 9, 'T')], classic);
    expect(result.words).toHaveLength(1);
    expect(result.words[0]).toMatchObject({ word: 'CAT', score: 10 });
    expect(result.total).toBe(10);
    expect(result.bingo).toBe(false);
  });

  it('one word covering two DW quadruples; letter premium applies first', () => {
    // Col 3, rows 3–11: (3,3) DW, (7,3) DL, (11,3) DW; nine A(1)s.
    // letters = 8×1 + 1×2 = 10; word ×2×2 ⇒ 40.
    const placements = Array.from({ length: 9 }, (_, i) => place(3 + i, 3, 'A'));
    const result = scorePlay(empty, placements, classic);
    expect(result.words[0]!.score).toBe(40);
    expect(result.total).toBe(40);
  });

  it('covered premiums never re-count on later plays', () => {
    // CAT sits across the center DW; extending to CATS scores plain letters.
    const board = boardFrom([
      [7, 7, 'C'],
      [7, 8, 'A'],
      [7, 9, 'T'],
    ]);
    const result = scorePlay(board, [place(7, 10, 'S')], classic);
    expect(result.words[0]).toMatchObject({ word: 'CATS', score: 6 });
    expect(result.total).toBe(6);
  });

  it('a DL under a new tile inside a TW word: letter doubles, then word triples', () => {
    // Row 0, cols 0–3: (0,0) TW, (0,3) DL. F(4) A(1) R(1) M(3):
    // letters = 4+1+1+3×2 = 12; ×3 ⇒ 36.
    const result = scorePlay(empty, [place(0, 0, 'F'), place(0, 1, 'A'), place(0, 2, 'R'), place(0, 3, 'M')], classic);
    expect(result.words[0]).toMatchObject({ word: 'FARM', score: 36 });
    expect(result.total).toBe(36);
  });

  it('scores main + every cross word; a new premium counts in each word it joins', () => {
    // Existing: OMA row 5 cols 6–8, CAT row 7 cols 6–8. Place BEE row 6:
    // (6,6) DL under B(3), (6,8) DL under E(1).
    // main BEE = 6+1+2 = 9; crosses OBC = 1+6+3 = 10, MEA = 5, AET = 1+2+1 = 4.
    const board = boardFrom([
      [7, 6, 'C'], [7, 7, 'A'], [7, 8, 'T'],
      [5, 6, 'O'], [5, 7, 'M'], [5, 8, 'A'],
    ]);
    const result = scorePlay(board, [place(6, 6, 'B'), place(6, 7, 'E'), place(6, 8, 'E')], classic);
    expect(result.words.map((w) => ({ word: w.word, score: w.score }))).toEqual([
      { word: 'BEE', score: 9 },
      { word: 'OBC', score: 10 },
      { word: 'MEA', score: 5 },
      { word: 'AET', score: 4 },
    ]);
    expect(result.total).toBe(28);
  });

  it('a play extending a word both ways scores the whole word exactly once', () => {
    const result = scorePlay(catBoard, [place(7, 4, 'S'), place(7, 5, 'O'), place(7, 9, 'S')], classic);
    expect(result.words).toHaveLength(1);
    expect(result.words[0]).toMatchObject({ word: 'SOCATS', score: 8 });
  });

  it('blanks score 0 — even on a letter premium — but join their words', () => {
    // CAT at (7,4)-(7,6); blank-S on (7,3) DL ⇒ 0×2 + 3+1+1 = 5.
    const board = boardFrom([
      [7, 4, 'C'],
      [7, 5, 'A'],
      [7, 6, 'T'],
    ]);
    const result = scorePlay(board, [place(7, 3, 'S', true)], classic);
    expect(result.words[0]).toMatchObject({ word: 'SCAT', score: 5 });
  });

  it('an existing blank on the board keeps scoring 0 in new words', () => {
    // CAT with a blank A; extending to CATS: 3+0+1+1 = 5.
    const board = boardFrom([
      [7, 7, 'C'],
      [7, 8, 'A', true],
      [7, 9, 'T'],
    ]);
    const result = scorePlay(board, [place(7, 10, 'S')], classic);
    expect(result.words[0]).toMatchObject({ word: 'CATS', score: 5 });
  });

  it('placing exactly rackSize tiles is a bingo (+50)', () => {
    // Row 7, cols 3–9: (7,3) DL, (7,7) DW; seven A(1)s.
    // letters = 2+6×1 = 8; ×2 = 16; +50 ⇒ 66.
    const placements = Array.from({ length: 7 }, (_, i) => place(7, 3 + i, 'A'));
    const result = scorePlay(empty, placements, classic);
    expect(result.bingo).toBe(true);
    expect(result.words[0]!.score).toBe(16);
    expect(result.total).toBe(66);
  });

  it('six tiles is not a bingo', () => {
    const placements = Array.from({ length: 6 }, (_, i) => place(7, 3 + i, 'A'));
    const result = scorePlay(empty, placements, classic);
    expect(result.bingo).toBe(false);
    expect(result.total).toBe(14); // 2+1+1+1+1 + 1×2(DW)... letters 2+5 = 7, ×2 = 14
  });

  it('a blank among seven placements still counts toward the bingo', () => {
    const placements = [
      ...Array.from({ length: 6 }, (_, i) => place(7, 3 + i, 'A')),
      place(7, 9, 'A', true),
    ];
    const result = scorePlay(empty, placements, classic);
    expect(result.bingo).toBe(true);
    // letters = 1×2 (DL) + 5×1 + 0 = 7; ×2 (center DW) = 14; +50 = 64
    expect(result.total).toBe(64);
  });
});
