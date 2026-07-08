// Build states through the engine's public API only (the app never constructs
// boards by hand — same discipline as production code).
import type { GameOptions, GameState } from '@hive/engine';
import { applyMove, initialState, parseUhp } from '@hive/engine';
import { GameController } from '../src/controller/GameController';
import { LocalTransport } from '../src/controller/transport';

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

/** A transport whose stored log is preloaded from a UHP move list. */
class SeededTransport extends LocalTransport {
  constructor(options: GameOptions, uhp: readonly string[]) {
    super(options);
    this.game = { options, log: uhp.map((move) => ({ kind: 'move', uhp: move })) };
  }
}

/** A controller restored from a UHP move list — for reaching positions (beetle
 * stacks, etc.) that are tedious to build through tap-tap. */
export async function seededController(
  uhp: readonly string[],
  options: GameOptions = ALL_ON,
): Promise<GameController> {
  const c = new GameController(new SeededTransport(options, uhp), options);
  await c.init();
  return c;
}

/** A small mid-game position: 6 tiles, one beetle stack.
 * After the last ply it is black to move, so the white beetle atop -1,0 is not
 * movable — a stack you'd want to peek but can't pick up. */
export const MID_GAME: string[] = [
  'wS1',
  'bS1 wS1-',
  'wQ -wS1',
  'bQ bS1-',
  'wB1 \\wQ',
  'bA1 bQ-',
  'wB1 wQ',
];

/** Tall stack: beetles and a mosquito pile onto two cells. White is to move
 * afterwards, so its beetle atop 0,0 is a *movable* stack. */
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
  'bM bB1',
];
