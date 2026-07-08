// Hive landing hero (T4.2, DESIGN §6.1): the themed shell lives in
// @parlor/web/lobby-ui — this file supplies hive's one game-specific slot, the
// board vignette (the real board renderer over a fixed decorative state that
// places all eight bug kinds and climbs a beetle — data, verified by test).
// Shared by Landing and Join so an invited friend sees the same identity.
// Firebase-free.
import { Box } from '@mui/material';
import type { GameState } from '@hive/engine';
import { applyMove, initialState, parseUhp } from '@hive/engine';
import { LandingLayout as ParlorLandingLayout } from '@parlor/web/lobby-ui';
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

const TAGLINE = "Two players. One hive. Don't get surrounded.";

/** The hive landing vignette — shared by the LandingLayout shell and the
 * Landing screen so the hero is identical on both. The float/pointer/aria
 * chrome comes from parlor's shell; hive supplies only the sized board. */
export function LandingHero() {
  return (
    <Box sx={{ width: 'min(72vw, 340px)' }}>
      <BoardView board={HERO_STATE.board} />
    </Box>
  );
}

export function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <ParlorLandingLayout hero={<LandingHero />} name="HIVE" tagline={TAGLINE}>
      {children}
    </ParlorLandingLayout>
  );
}
