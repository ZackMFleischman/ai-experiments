// Gallery/board fixtures: states built ONLY through the engine's public API,
// replayed from UHP (IMPLEMENTATION §4.1).
import type { GameOptions, GameState } from '@hive/engine';
import { applyMove, initialState, parseUhp } from '@hive/engine';

export const ALL_ON: GameOptions = {
  mosquito: true,
  ladybug: true,
  pillbug: true,
  tournamentOpening: true,
};

export function replayUhp(moves: string[], options: GameOptions = ALL_ON): GameState {
  let s = initialState(options);
  for (const uhp of moves) s = applyMove(s, parseUhp(uhp, s));
  return s;
}

/** Small mid-game position: 6 tiles, one beetle stack. */
export const MID_GAME: string[] = [
  'wS1',
  'bS1 wS1-',
  'wQ -wS1',
  'bQ bS1-',
  'wB1 \\wQ',
  'bA1 bQ-',
  'wB1 wQ',
];

/** Early game: four placements. */
export const EARLY_GAME: string[] = ['wS1', 'bS1 wS1-', 'wQ -wS1', 'bQ bS1-'];

/** Late-game: the full T1.9 surround win, one ply before the end. */
export const LATE_GAME: string[] = [
  'wS1',
  'bS1 wS1-',
  'wQ -wS1',
  'bQ bS1-',
  'wA1 \\wQ',
  'bA1 bQ-',
  'wA1 \\bQ',
  'bG1 bA1-',
  'wA2 -wQ',
  'bG2 bG1-',
  'wA2 \\bA1',
  'bG3 bG2-',
  'wA3 /wQ',
  'bB1 bG1\\',
  'wA3 /bQ',
  'bB1 bG1',
  'wG1 \\wA1',
  'bB1 bA1/',
];

/** Tall stack: beetles and a mosquito pile onto one cell. */
export const TALL_STACK: string[] = [
  'wS1',
  'bS1 wS1-',
  'wQ -wS1',
  'bQ bS1-',
  'wB1 \\wS1',
  'bB1 bS1/',
  'wB1 wS1',
  'bB1 bS1',
  'wB2 \\wQ',
  'bM \\bQ',
  'wB2 wQ',
  'bM bB1', // mosquito copies the adjacent beetle and climbs the stack
];
