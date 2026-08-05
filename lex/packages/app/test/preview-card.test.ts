// T3.7 gate: where the preview card parks itself. Pure board-space geometry —
// the guarantees that make ONE card better than a chip per word: it never sits
// on the staged play when any spot is free, it prefers spots that hide no
// letters, and it is always somewhere on screen.
import type { Cell } from '@lex/engine';
import { describe, expect, it } from 'vitest';
import {
  cellRect,
  cellsBounds,
  clampInto,
  intersects,
  pickBadgeSpot,
  pickCardSpot,
  type Rect,
} from '../src/board/previewCard';

const BOARD: Rect = { left: 0, top: 0, width: 544, height: 544 }; // 15 × 36 + 2×2
/** CATS across the star: row 7, cols 7–10. */
const PLAY = cellsBounds([
  { row: 7, col: 7 },
  { row: 7, col: 8 },
  { row: 7, col: 9 },
  { row: 7, col: 10 },
])!;
const CARD = { width: 150, height: 90 };

const cells = (rows: number[], cols: number[]): Cell[] =>
  rows.flatMap((row) => cols.map((col) => ({ row, col })));
const rects = (c: readonly Cell[]): Rect[] => c.map(cellRect);
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const spotFor = (occupied: readonly Rect[], visible: Rect = BOARD) =>
  pickCardSpot({ play: PLAY, card: CARD, visible, occupied, gap: 8 });

describe('preview card placement', () => {
  it('bounds a staged word to its board-space box', () => {
    expect(PLAY).toEqual({ left: 254, top: 254, width: 144, height: 36 });
    expect(cellsBounds([])).toBeNull();
  });

  it('parks below the play when the space under it is empty', () => {
    const spot = spotFor(rects(cells([7], range(7, 10))));
    expect(spot.left).toBe(PLAY.left);
    expect(spot.top).toBe(PLAY.top + PLAY.height + 8);
  });

  it('flips above the play when the space below is full of tiles', () => {
    const occupied = rects([...cells([7], range(7, 10)), ...cells(range(8, 12), range(0, 14))]);
    const spot = spotFor(occupied);
    expect(spot.top).toBe(PLAY.top - 8 - CARD.height);
    expect(occupied.every((r) => !intersects(spot, r))).toBe(true);
  });

  it('never covers the staged word itself while any spot is free', () => {
    // Everything but the two rows above the play is committed.
    const occupied = rects([
      ...cells([7], range(7, 10)),
      ...cells([...range(0, 4), ...range(8, 14)], range(0, 14)),
    ]);
    const spot = spotFor(occupied);
    expect(intersects(spot, PLAY)).toBe(false);
  });

  it('falls back to a clear corner of the view when the play is boxed in', () => {
    // Rows 4–12 solid: nothing adjacent to the play is free, but the top and
    // bottom bands of the board are.
    const occupied = rects([...cells([7], range(7, 10)), ...cells(range(4, 12), range(0, 14))]);
    const spot = spotFor(occupied);
    expect(occupied.every((r) => !intersects(spot, r))).toBe(true);
  });

  it('stays inside the visible slice when the board is zoomed in', () => {
    const visible: Rect = { left: 200, top: 210, width: 220, height: 200 };
    const spot = spotFor(rects(cells([7], range(7, 10))), visible);
    expect(spot.left).toBeGreaterThanOrEqual(visible.left);
    expect(spot.top).toBeGreaterThanOrEqual(visible.top);
    expect(spot.left + CARD.width).toBeLessThanOrEqual(visible.left + visible.width);
    expect(spot.top + CARD.height).toBeLessThanOrEqual(visible.top + visible.height);
  });

  it('centers a card too big for the space rather than pinning it off an edge', () => {
    const tall = clampInto({ left: 0, top: 0, width: 40, height: 300 }, BOARD, 8);
    expect(tall.top).toBe(8);
    const huge = clampInto({ left: 0, top: 0, width: 40, height: 900 }, BOARD, 8);
    expect(huge.top).toBe((544 - 900) / 2);
  });
});

describe('last-play badge placement', () => {
  const BADGE = { width: 34, height: 20 };
  const spotFor = (play: Rect, occupied: readonly Rect[]) =>
    pickBadgeSpot({ play, badge: BADGE, occupied, board: BOARD, gap: 4 });

  it('parks just past the end of the word', () => {
    const play = cellsBounds(cells([7], range(7, 10)))!;
    const spot = spotFor(play, rects(cells([7], range(7, 10))));
    expect(spot.left).toBe(play.left + play.width + 4);
    expect(intersects(spot, play)).toBe(false);
  });

  it('never lands on a letter the word BRIDGED (the LATELY-through-LOVER case)', () => {
    // LATELY across row 3, cols 3–8; its 5th letter is the L of LOVER, which
    // was already on the board running down col 7. The played cells are the
    // five NEW tiles — the badge must clear the whole word, bridge included.
    const placed = [
      { row: 3, col: 3 },
      { row: 3, col: 4 },
      { row: 3, col: 5 },
      { row: 3, col: 6 },
      { row: 3, col: 8 },
    ];
    const lover = [3, 4, 5, 6, 7].map((row) => ({ row, col: 7 }));
    const occupied = rects([...placed, ...lover]);
    const spot = spotFor(cellsBounds(placed)!, occupied);
    expect(occupied.every((r) => !intersects(spot, r))).toBe(true);
    // Past the Y, not on top of the shared L.
    expect(spot.left).toBeGreaterThan(cellRect({ row: 3, col: 8 }).left);
  });

  it('flips to the near side when the word ends at the board edge', () => {
    const play = cellsBounds(cells([7], range(10, 14)))!;
    const occupied = rects(cells([7], range(10, 14)));
    const spot = spotFor(play, occupied);
    expect(spot.left + spot.width).toBeLessThanOrEqual(BOARD.width);
    expect(spot.left + spot.width).toBeLessThanOrEqual(play.left);
    expect(occupied.every((r) => !intersects(spot, r))).toBe(true);
  });

  it('drops to the row below when both ends of the word are blocked', () => {
    const play = cellsBounds(cells([7], range(7, 10)))!;
    // Letters immediately before and after the word on its own row.
    const occupied = rects([...cells([7], range(0, 14))]);
    const spot = spotFor(play, occupied);
    expect(occupied.every((r) => !intersects(spot, r))).toBe(true);
  });

  it('stays on the board', () => {
    const play = cellsBounds([{ row: 0, col: 0 }])!;
    const spot = spotFor(play, rects([{ row: 0, col: 0 }]));
    expect(spot.left).toBeGreaterThanOrEqual(0);
    expect(spot.top).toBeGreaterThanOrEqual(0);
    expect(spot.left + spot.width).toBeLessThanOrEqual(BOARD.width);
    expect(spot.top + spot.height).toBeLessThanOrEqual(BOARD.height);
  });
});
