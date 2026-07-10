import { useSyncExternalStore } from 'react';
import type { SudokuState } from '@sudoku/engine';
import type { Session } from './session';

/** Re-render on every session change; state is the fold of the live log. */
export function useSessionState(session: Session): SudokuState | null {
  return useSyncExternalStore(session.subscribe, () => session.state);
}
