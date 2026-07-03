// Themed landing layout (T4.2, DESIGN §6.1): full-bleed hero cluster rendered
// by the real board renderer from a fixed decorative state, HIVE wordmark and
// tagline, with the screen's action (sign-in / Play / join card) as children.
// Shared by Landing and Join so an invited friend sees the same identity.
import { Box, Stack, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import type { GameState } from '@hive/engine';
import { applyMove, initialState, parseUhp } from '@hive/engine';
import type { ReactNode } from 'react';
import { BoardView } from '../board/BoardView';

// A legal 12-ply opening that places all eight bug kinds (both colors) and
// climbs the beetle for a stack — variety for the hero, verified by test.
const HERO_MOVES = [
  'wS1',
  'bG1 wS1-',
  'wQ -wS1',
  'bQ bG1-',
  'wA1 -wQ',
  'bB1 bQ-',
  'wL \\wA1',
  'bM \\bB1',
  'wP -wA1',
  'bA1 \\bM',
  'wB1 wQ\\',
  'bB1 bQ',
];

function replayHero(): GameState {
  let s = initialState({ mosquito: true, ladybug: true, pillbug: true, tournamentOpening: true });
  for (const uhp of HERO_MOVES) s = applyMove(s, parseUhp(uhp, s));
  return s;
}

/** Fixed decorative state (module-level: built once, deterministic). */
export const HERO_STATE: GameState = replayHero();

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
            width: 'min(72vw, 340px)',
            animation: `${float} 6s ease-in-out infinite alternate`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            pointerEvents: 'none',
          }}
        >
          <BoardView board={HERO_STATE.board} />
        </Box>
        <Stack spacing={1} alignItems="center">
          <Typography variant="h2" component="h1" fontWeight={700} letterSpacing="0.2em">
            HIVE
          </Typography>
          <Typography color="text.secondary" align="center">
            Two players. One hive. Don&apos;t get surrounded.
          </Typography>
        </Stack>
        {children}
      </Stack>
    </Box>
  );
}
