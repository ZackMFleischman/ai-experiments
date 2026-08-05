// Placement math for the live-preview card (DESIGN §7.2). Pure geometry, all
// of it in BOARD space — where the occupancy grid lives — so "which spot hides
// the least" is decided by a unit-testable function and the caller converts the
// winner to screen coordinates exactly once. No rules here: the card's CONTENT
// is a controller verdict, only its position is computed.
import type { Cell } from '@lex/engine';
import { BOARD_PAD_PX, CELL_PX } from './skin';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const rectRight = (r: Rect): number => r.left + r.width;
export const rectBottom = (r: Rect): number => r.top + r.height;

export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.left < rectRight(b) && rectRight(a) > b.left && a.top < rectBottom(b) && rectBottom(a) > b.top
  );
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(rectRight(a), rectRight(b)) - Math.max(a.left, b.left);
  const h = Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

export function inflate(r: Rect, by: number): Rect {
  return { left: r.left - by, top: r.top - by, width: r.width + 2 * by, height: r.height + 2 * by };
}

/** Board-space rect of one cell. */
export function cellRect(cell: Cell): Rect {
  return {
    left: BOARD_PAD_PX + cell.col * CELL_PX,
    top: BOARD_PAD_PX + cell.row * CELL_PX,
    width: CELL_PX,
    height: CELL_PX,
  };
}

/** Board-space bounding box of a set of cells; null when there are none. */
export function cellsBounds(cells: readonly Cell[]): Rect | null {
  if (cells.length === 0) return null;
  let minRow = Infinity;
  let maxRow = -Infinity;
  let minCol = Infinity;
  let maxCol = -Infinity;
  for (const c of cells) {
    minRow = Math.min(minRow, c.row);
    maxRow = Math.max(maxRow, c.row);
    minCol = Math.min(minCol, c.col);
    maxCol = Math.max(maxCol, c.col);
  }
  return {
    left: BOARD_PAD_PX + minCol * CELL_PX,
    top: BOARD_PAD_PX + minRow * CELL_PX,
    width: (maxCol - minCol + 1) * CELL_PX,
    height: (maxRow - minRow + 1) * CELL_PX,
  };
}

/** Slide `rect` inside `bounds` (keeping its size), leaving `margin` at the
 * edges. A rect too big to fit on an axis is centered on it instead — better
 * half-visible in the middle than pinned off one side. */
export function clampInto(rect: Rect, bounds: Rect, margin = 0): Rect {
  const fit = (start: number, size: number, boundsStart: number, boundsSize: number): number => {
    const min = boundsStart + margin;
    const max = boundsStart + boundsSize - margin - size;
    if (max < min) return boundsStart + (boundsSize - size) / 2;
    return Math.min(max, Math.max(min, start));
  };
  return {
    width: rect.width,
    height: rect.height,
    left: fit(rect.left, rect.width, bounds.left, bounds.width),
    top: fit(rect.top, rect.height, bounds.top, bounds.height),
  };
}

export interface SpotInput {
  /** Bounding box of the staged play, board px. */
  play: Rect;
  /** Card size in board px (its screen size ÷ the viewport's live scale). */
  card: { width: number; height: number };
  /** The slice of board space currently on screen, board px — the card is
   * never placed outside it, however far the board is panned or zoomed. */
  visible: Rect;
  /** Every cell carrying a letter right now (committed AND staged), board px. */
  occupied: readonly Rect[];
  /** Breathing room between the card, the play, and the visible edges. */
  gap: number;
}

/** Cost of parking the card at `spot`: covering your own staged word is much
 * worse than covering a committed tile, which is worse than covering nothing.
 * Lower wins. */
export function spotCost(spot: Rect, play: Rect, occupied: readonly Rect[]): number {
  const cellArea = CELL_PX * CELL_PX;
  let cost = (100 * overlapArea(spot, play)) / cellArea;
  for (const r of occupied) if (intersects(spot, r)) cost += 1;
  return cost;
}

/** Where the card goes: the cheapest of a handful of spots around the play,
 * falling back to the corners of what's on screen when the board around the
 * play is full. Every candidate is clamped on screen before it is scored, so
 * the winner is always somewhere the player can actually see it. */
export function pickCardSpot(input: SpotInput): Rect {
  const { play, card, visible, occupied, gap } = input;
  const { width, height } = card;
  const below = rectBottom(play) + gap;
  const above = play.top - gap - height;
  const rightOf = rectRight(play) + gap;
  const leftOf = play.left - gap - width;
  const endAligned = rectRight(play) - width;
  // Ordered by preference — ties break toward the front of this list.
  const candidates: Rect[] = [
    { left: play.left, top: below, width, height },
    { left: play.left, top: above, width, height },
    { left: endAligned, top: below, width, height },
    { left: endAligned, top: above, width, height },
    { left: rightOf, top: play.top, width, height },
    { left: leftOf, top: play.top, width, height },
    { left: visible.left, top: visible.top, width, height },
    { left: rectRight(visible) - width, top: visible.top, width, height },
    { left: visible.left, top: rectBottom(visible) - height, width, height },
    { left: rectRight(visible) - width, top: rectBottom(visible) - height, width, height },
  ];

  let best = clampInto(candidates[0]!, visible, gap);
  let bestCost = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const spot = clampInto(candidates[i]!, visible, gap);
    const cost = spotCost(spot, play, occupied) + i * 0.01;
    if (cost < bestCost) {
      bestCost = cost;
      best = spot;
    }
  }
  return best;
}
