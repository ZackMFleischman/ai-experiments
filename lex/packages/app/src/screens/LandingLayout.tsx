// ported from hive/packages/app/src/screens/LandingLayout.tsx (adapted)
// Themed landing layout (T4.2, DESIGN §7.1): a board vignette — the center of
// the classic board, rendered by the real board renderer — spelling the LEX
// wordmark from real tile components, with the screen's action (sign-in /
// Play / join card) as children. Shared by Landing and Join so an invited
// friend sees the same identity.
import { Box, Stack, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import type { BoardLayout, CellKey, PlacedTile, Premium } from '@lex/engine';
import { cellKey, RULESETS } from '@lex/engine';
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

const float = keyframes`
  from { transform: translateY(-6px); }
  to   { transform: translateY(6px); }
`;

export function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        p: 3,
        overflow: 'hidden',
      }}
    >
      <Stack spacing={3} alignItems="center" sx={{ width: '100%', maxWidth: 460 }}>
        <Box
          data-testid="landing-hero"
          aria-hidden
          sx={{
            animation: `${float} 6s ease-in-out infinite alternate`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <BoardGrid layout={HERO_LAYOUT} points={classic.tiles.points} tiles={HERO_TILES} static />
        </Box>
        <Stack spacing={1} alignItems="center">
          <Typography variant="h2" component="h1" fontWeight={700} letterSpacing="0.2em">
            LEX
          </Typography>
          <Typography color="text.secondary" align="center">
            A crossword tile game for two.
          </Typography>
        </Stack>
        {children}
      </Stack>
    </Box>
  );
}
