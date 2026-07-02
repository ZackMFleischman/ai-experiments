// Bug registry (open/closed seam, DESIGN §3.3): adding a bug = one module + a row
// here. Destination generators assume the mover is the TOP tile at `from` and
// lift it themselves; global preconditions (ownership, queen placed, one-hive)
// live in engine.ts.
import type { BugKind, Hex } from '../index';
import type { Board } from '../state';
import { antDestinations } from './ant';
import { beetleDestinations } from './beetle';
import { grasshopperDestinations } from './grasshopper';
import { queenDestinations } from './queen';
import { spiderDestinations } from './spider';

export type DestinationGenerator = (board: Board, from: Hex) => Hex[];

export const BUG_DESTINATIONS: Partial<Record<BugKind, DestinationGenerator>> = {
  Q: queenDestinations,
  A: antDestinations,
  S: spiderDestinations,
  B: beetleDestinations,
  G: grasshopperDestinations,
  // M, L: M2 · P: self-move in M2 (tosses are generated in engine.ts)
};
