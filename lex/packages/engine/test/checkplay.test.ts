// T1.3: checkPlay — geometry + rack legality + word extraction against
// hand-built boards (IMPLEMENTATION §2 M1, §6 pinned fixtures).
import { describe, expect, it } from 'vitest';
import { RULESETS, checkPlay, type CellKey, type PlacedTile, type Placement } from '../src/index.js';

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

// A board holding CAT horizontally through the center: (7,6) C (7,7) A (7,8) T
const catBoard = boardFrom([
  [7, 6, 'C'],
  [7, 7, 'A'],
  [7, 8, 'T'],
]);

function words(result: ReturnType<typeof checkPlay>): string[] {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.words.map((w) => w.word);
}

describe('first play', () => {
  it('accepts ≥2 tiles covering the start cell', () => {
    const result = checkPlay(empty, ['C', 'A', 'T', 'E', 'E', 'E', 'E'], [place(7, 7, 'C'), place(7, 8, 'A'), place(7, 9, 'T')], classic);
    expect(result).toMatchObject({ ok: true });
    expect(words(result)).toEqual(['CAT']);
  });

  it('rejects a first play missing the start cell', () => {
    const result = checkPlay(empty, ['C', 'A'], [place(0, 0, 'C'), place(0, 1, 'A')], classic);
    expect(result).toEqual({ ok: false, reason: 'first-play-center' });
  });

  it('rejects a single-tile first play', () => {
    const result = checkPlay(empty, ['C'], [place(7, 7, 'C')], classic);
    expect(result).toEqual({ ok: false, reason: 'first-play-too-short' });
  });

  it('rejects an empty placement set', () => {
    expect(checkPlay(empty, ['C'], [], classic)).toEqual({ ok: false, reason: 'not-a-line' });
  });
});

describe('geometry', () => {
  it('rejects an L-shaped placement', () => {
    const result = checkPlay(catBoard, ['S', 'O'], [place(7, 9, 'S'), place(8, 8, 'O')], classic);
    expect(result).toEqual({ ok: false, reason: 'not-a-line' });
  });

  it('rejects placements off the board', () => {
    expect(checkPlay(catBoard, ['S', 'O'], [place(7, 14, 'S'), place(7, 15, 'O')], classic)).toEqual({ ok: false, reason: 'off-board' });
    expect(checkPlay(catBoard, ['S'], [place(-1, 7, 'S')], classic)).toEqual({ ok: false, reason: 'off-board' });
  });

  it('rejects placement on an occupied cell', () => {
    expect(checkPlay(catBoard, ['X', 'Y'], [place(7, 7, 'X'), place(7, 9, 'Y')], classic)).toEqual({ ok: false, reason: 'occupied' });
  });

  it('rejects two placements on the same cell', () => {
    expect(checkPlay(catBoard, ['X', 'Y'], [place(6, 7, 'X'), place(6, 7, 'Y')], classic)).toEqual({ ok: false, reason: 'occupied' });
  });

  it('rejects an internal gap not bridged by existing tiles', () => {
    // (6,6) X _ (6,8) Y with nothing at (6,7)
    const result = checkPlay(catBoard, ['X', 'Y'], [place(6, 6, 'X'), place(6, 8, 'Y')], classic);
    expect(result).toEqual({ ok: false, reason: 'gap' });
  });

  it('accepts a placement bridged by existing tiles; main word spans the full extent', () => {
    // S before C, S after T: S CAT S → SCATS... place (7,5) S and (7,9) S
    const result = checkPlay(catBoard, ['S', 'S'], [place(7, 5, 'S'), place(7, 9, 'S')], classic);
    expect(result).toMatchObject({ ok: true });
    expect(words(result)).toEqual(['SCATS']);
  });

  it('rejects a play touching nothing', () => {
    const result = checkPlay(catBoard, ['D', 'O'], [place(0, 0, 'D'), place(0, 1, 'O')], classic);
    expect(result).toEqual({ ok: false, reason: 'not-connected' });
  });

  it('accepts a later single-tile play that connects', () => {
    // S at (7,9) → CATS
    const result = checkPlay(catBoard, ['S'], [place(7, 9, 'S')], classic);
    expect(result).toMatchObject({ ok: true });
    expect(words(result)).toEqual(['CATS']);
  });
});

describe('rack legality', () => {
  it('rejects tiles the rack does not hold', () => {
    expect(checkPlay(catBoard, ['A', 'B'], [place(7, 9, 'S')], classic)).toEqual({ ok: false, reason: 'not-your-tiles' });
  });

  it('rejects using one rack tile twice', () => {
    // rack has a single S; play needs two
    expect(checkPlay(catBoard, ['S', 'A'], [place(7, 5, 'S'), place(7, 9, 'S')], classic)).toEqual({ ok: false, reason: 'not-your-tiles' });
  });

  it('a blank placement consumes a rack blank, not the designated letter', () => {
    expect(checkPlay(catBoard, ['?', 'A'], [place(7, 9, 'S', true)], classic)).toMatchObject({ ok: true });
    expect(checkPlay(catBoard, ['S', 'A'], [place(7, 9, 'S', true)], classic)).toEqual({ ok: false, reason: 'not-your-tiles' });
  });

  it('a blank participates in the word under its designated letter', () => {
    const result = checkPlay(catBoard, ['?'], [place(7, 9, 'S', true)], classic);
    expect(words(result)).toEqual(['CATS']);
  });

  it('rejects a placement letter outside A–Z', () => {
    expect(checkPlay(catBoard, ['S'], [place(7, 9, '3')], classic)).toEqual({ ok: false, reason: 'not-your-tiles' });
    expect(checkPlay(catBoard, ['?'], [place(7, 9, '?', true)], classic)).toEqual({ ok: false, reason: 'not-your-tiles' });
  });
});

describe('word extraction', () => {
  it('extracts main + cross words; length-1 crosses are not words', () => {
    // Play AS vertically at col 9: A at (6,9), S at (7,9).
    // Main: AS (vertical). Cross at S row 7: CATS. Cross at A row 6: just 'A' → ignored.
    const result = checkPlay(catBoard, ['A', 'S'], [place(6, 9, 'A'), place(7, 9, 'S')], classic);
    expect(result).toMatchObject({ ok: true });
    expect(words(result)).toEqual(['AS', 'CATS']);
  });

  it('one placement can form a main word and multiple cross words', () => {
    // Board: CAT at row 7 (cols 6-8) and OX at row 5 (cols 9-10)... build a
    // denser scene: crosses over three columns.
    const board = boardFrom([
      [7, 6, 'C'], [7, 7, 'A'], [7, 8, 'T'],
      [5, 6, 'O'], [5, 7, 'M'], [5, 8, 'A'],
    ]);
    // Play GO/MA/TA... place row 6: G(6,6) O(6,7) A(6,8) → main GOA? Let's
    // keep letters honest: place B(6,6), E(6,7), E(6,8):
    //   main: BEE; crosses: OBC? no — vertical per placement:
    //   (6,6): O(5,6)-B(6,6)-C(7,6) → OBC; (6,7): M-E-A → MEA; (6,8): A-E-T → AET.
    const result = checkPlay(board, ['B', 'E', 'E'], [place(6, 6, 'B'), place(6, 7, 'E'), place(6, 8, 'E')], classic);
    expect(result).toMatchObject({ ok: true });
    expect(words(result)).toEqual(['BEE', 'OBC', 'MEA', 'AET']);
  });

  it('a play extending a word both ways scores the whole word once', () => {
    // UN before CAT... build RE + CATS: place (7,4) S,(7,5) O before C and (7,9) S after T:
    const result = checkPlay(catBoard, ['O', 'S', 'S'], [place(7, 5, 'O'), place(7, 9, 'S'), place(7, 4, 'S')], classic);
    expect(result).toMatchObject({ ok: true });
    expect(words(result)).toEqual(['SOCATS']);
  });

  it('a single placement forming words on both axes lists the horizontal as main', () => {
    const board = boardFrom([
      [7, 6, 'C'], [7, 7, 'A'], [7, 8, 'T'],
      [6, 9, 'A'],
    ]);
    // S at (7,9): horizontal CATS + vertical AS
    const result = checkPlay(board, ['S'], [place(7, 9, 'S')], classic);
    expect(result).toMatchObject({ ok: true });
    expect(words(result)).toEqual(['CATS', 'AS']);
  });

  it('reports word cells alongside the letters', () => {
    const result = checkPlay(catBoard, ['S'], [place(7, 9, 'S')], classic);
    if (!result.ok) throw new Error('expected ok');
    expect(result.words[0]!.cells).toEqual([
      { row: 7, col: 6 },
      { row: 7, col: 7 },
      { row: 7, col: 8 },
      { row: 7, col: 9 },
    ]);
    expect(result.words[0]!.score).toBe(0); // scores are scorePlay's job
  });
});
