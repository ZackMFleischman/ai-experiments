// Build states through the engine's public API only (the app never constructs
// boards by hand — same discipline as production code).
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

/** A small mid-game position: 6 tiles, one beetle stack. */
export const MID_GAME: string[] = [
  'wS1',
  'bS1 wS1-',
  'wQ -wS1',
  'bQ bS1-',
  'wB1 \\wQ',
  'bA1 bQ-',
  'wB1 wQ',
];
