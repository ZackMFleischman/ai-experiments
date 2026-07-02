// Bug registry (open/closed seam, DESIGN §3.3): adding a bug = one module + a row
// here. Destination generators assume the mover is the TOP tile at `from` and
// lift it themselves; global preconditions (ownership, queen placed, one-hive)
// live in engine.ts.
import type { BugKind, Hex } from '../index';
import type { Board } from '../state';
import { antDestinations } from './ant';
import { beetleDestinations } from './beetle';
import { grasshopperDestinations } from './grasshopper';
import { ladybugDestinations } from './ladybug';
import { queenDestinations } from './queen';
import { spiderDestinations } from './spider';

export type DestinationGenerator = (board: Board, from: Hex) => Hex[];

export const BUG_DESTINATIONS: Partial<Record<BugKind, DestinationGenerator>> = {
  Q: queenDestinations,
  A: antDestinations,
  S: spiderDestinations,
  B: beetleDestinations,
  G: grasshopperDestinations,
  L: ladybugDestinations,
  // M: T2.3 · P self-moves are queen-shaped (T2.2); tosses live in engine.ts
};
