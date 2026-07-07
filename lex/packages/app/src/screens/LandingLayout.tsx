// Lex landing hero (T4.2, DESIGN §7.1): the themed shell lives in
// @parlor/web/lobby-ui — this file supplies lex's one game-specific slot, the
// board vignette (a 5×5 window onto the classic board with the LEX wordmark
// spelled from real tile components — data, not a mock-up). Shared by Landing
// and Join so an invited friend sees the same identity. Firebase-free.
import type { BoardLayout, CellKey, PlacedTile, Premium } from '@lex/engine';
import { cellKey, RULESETS } from '@lex/engine';
import { LandingLayout as ParlorLandingLayout } from '@parlor/web/lobby-ui';
import type { ReactNode } from 'react';
import { BoardGrid } from '../board/BoardGrid';

const classic = RULESETS['classic']!;

// A 5×5 window onto the classic board centered on the start star, so the
// vignette shows real premium cells (data, not a mock-up).
const SIZE = 5;
const OFFSET = (classic.board.rows - SIZE) >> 1; // 5 for 15×15
function heroLayout(): BoardLayout {
  const sliced: Record<CellKey, Premium> = {};
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const p = classic.board.premiums[cellKey({ row: row + OFFSET, col: col + OFFSET })];
      if (p) sliced[cellKey({ row, col })] = p;
    }
  }
  return {
    id: 'landing-hero',
    rows: SIZE,
    cols: SIZE,
    premiums: sliced,
    start: { row: (SIZE - 1) / 2, col: (SIZE - 1) / 2 },
  };
}

export const HERO_LAYOUT: BoardLayout = heroLayout();

/** LEX across the center row, covering the start star like a first play. */
export const HERO_TILES: ReadonlyMap<CellKey, PlacedTile> = new Map<CellKey, PlacedTile>([
  [cellKey({ row: 2, col: 1 }), { letter: 'L', isBlank: false }],
  [cellKey({ row: 2, col: 2 }), { letter: 'E', isBlank: false }],
  [cellKey({ row: 2, col: 3 }), { letter: 'X', isBlank: false }],
]);

/** The lex landing vignette — shared by the LandingLayout shell and the
 * Landing screen so the hero is identical on both. */
export function LandingHero() {
  return <BoardGrid layout={HERO_LAYOUT} points={classic.tiles.points} tiles={HERO_TILES} static />;
}

export function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <ParlorLandingLayout hero={<LandingHero />} name="LEX" tagline="A crossword tile game for two.">
      {children}
    </ParlorLandingLayout>
  );
}
