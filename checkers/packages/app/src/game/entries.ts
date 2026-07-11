// The log-entry vocabulary + the LogSession fold config. checkers is a
// perfect-information game: the session state IS the engine state, and every
// entry folds through the engine — the UI never computes rules. Hot-seat and
// online share this fold; only the transport differs.
import {
  applyCheckers,
  initialCheckers,
  resignCheckers,
  timeoutCheckers,
  type Side,
  type CheckersState,
} from '@checkers/engine';
import type { LogSessionConfig } from '@parlor/core';
import type { CheckersGameOptions } from '../gameOptions';

export type CheckersEntry =
  | { kind: 'move'; from: number; to: number }
  | { kind: 'resign'; by: Side }
  | { kind: 'timeout'; by: Side };

export const sessionConfig: LogSessionConfig<CheckersGameOptions, CheckersEntry, CheckersState> = {
  init: () => initialCheckers(),
  apply(state, entry) {
    switch (entry.kind) {
      case 'move':
        return applyCheckers(state, { from: entry.from, to: entry.to });
      case 'resign':
        return resignCheckers(state, entry.by);
      case 'timeout':
        return timeoutCheckers(state, entry.by);
    }
  },
};

export function otherSide(side: Side): Side {
  return side === 'attackers' ? 'defenders' : 'attackers';
}
