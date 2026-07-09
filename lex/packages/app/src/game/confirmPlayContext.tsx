// "Confirm before playing" preference: a context + localStorage persistence,
// mirroring board/skinContext.tsx. Presentation-only — the engine never sees
// it. When on, Play (the only otherwise-unconfirmed submission) asks first, so
// a stray tap on the primary CTA can't commit a turn by accident.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export const CONFIRM_PLAY_STORAGE_KEY = 'lex.confirmPlay.v1';

interface ConfirmPlayValue {
  confirmPlay: boolean;
  setConfirmPlay: (v: boolean) => void;
}

export const ConfirmPlayContext = createContext<ConfirmPlayValue>({
  confirmPlay: false,
  setConfirmPlay: () => {},
});

export function useConfirmPlay(): ConfirmPlayValue {
  return useContext(ConfirmPlayContext);
}

export function storedConfirmPlay(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    return storage?.getItem(CONFIRM_PLAY_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function ConfirmPlayProvider({ children }: { children: ReactNode }) {
  const [confirmPlay, setState] = useState<boolean>(() =>
    storedConfirmPlay(typeof window === 'undefined' ? undefined : window.localStorage),
  );
  const setConfirmPlay = useCallback((next: boolean) => {
    setState(next);
    try {
      window.localStorage.setItem(CONFIRM_PLAY_STORAGE_KEY, String(next));
    } catch {
      // Quota/permissions: the choice just won't survive a refresh.
    }
  }, []);
  const value = useMemo(() => ({ confirmPlay, setConfirmPlay }), [confirmPlay, setConfirmPlay]);
  return <ConfirmPlayContext.Provider value={value}>{children}</ConfirmPlayContext.Provider>;
}
