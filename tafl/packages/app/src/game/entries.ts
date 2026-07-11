// The log-entry vocabulary + the LogSession fold config. tafl is a
// perfect-information game: the session state IS the engine state, and every
// entry folds through the engine — the UI never computes rules. Hot-seat and
// online share this fold; only the transport differs.
import {
  applyTafl,
  initialTafl,
  resignTafl,
  timeoutTafl,
  type Side,
  type TaflState,
} from '@tafl/engine';
import type { LogSessionConfig } from '@parlor/core';
import type { TaflGameOptions } from '../gameOptions';

export type TaflEntry =
  | { kind: 'move'; from: number; to: number }
  | { kind: 'resign'; by: Side }
  | { kind: 'timeout'; by: Side };

export const sessionConfig: LogSessionConfig<TaflGameOptions, TaflEntry, TaflState> = {
  init: () => initialTafl(),
  apply(state, entry) {
    switch (entry.kind) {
      case 'move':
        return applyTafl(state, { from: entry.from, to: entry.to });
      case 'resign':
        return resignTafl(state, entry.by);
      case 'timeout':
        return timeoutTafl(state, entry.by);
    }
  },
};

export function otherSide(side: Side): Side {
  return side === 'attackers' ? 'defenders' : 'attackers';
}
