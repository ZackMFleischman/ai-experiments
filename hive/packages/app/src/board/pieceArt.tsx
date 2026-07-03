// Bear mode (Settings): swaps the piece glyphs for the 8 bear species while
// the pieces keep their Hive identity — pure reskin, movement-thematic mapping
// (see DECISIONS.md). Art choice only; rules never look at this.
import type { BugKind } from '@hive/engine';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { BEAR_SYMBOL, BUG_SYMBOL } from './sprites';

export { BEAR_SYMBOL };

export const BEAR_NAME: Record<BugKind, string> = {
  Q: 'Brown bear',
  A: 'Polar bear',
  S: 'Spectacled bear',
  G: 'Sun bear',
  B: 'American black bear',
  M: 'Asiatic black bear',
  L: 'Giant panda',
  P: 'Sloth bear',
};

interface PieceArt {
  bearMode: boolean;
  toggle: () => void;
  symbolFor: (kind: BugKind) => string;
}

const STORAGE_KEY = 'hive-piece-art';

const defaultArt: PieceArt = { bearMode: false, toggle: () => {}, symbolFor: (k) => BUG_SYMBOL[k] };
const PieceArtContext = createContext<PieceArt>(defaultArt);

export function usePieceArt(): PieceArt {
  return useContext(PieceArtContext);
}

export function PieceArtProvider({ children }: { children: ReactNode }) {
  const [bearMode, setBearMode] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'bears',
  );
  const toggle = useCallback(() => {
    setBearMode((on) => {
      localStorage.setItem(STORAGE_KEY, on ? 'bugs' : 'bears');
      return !on;
    });
  }, []);
  const value = useMemo<PieceArt>(
    () => ({
      bearMode,
      toggle,
      symbolFor: (kind) => (bearMode ? BEAR_SYMBOL[kind] : BUG_SYMBOL[kind]),
    }),
    [bearMode, toggle],
  );
  return <PieceArtContext.Provider value={value}>{children}</PieceArtContext.Provider>;
}

/** Pin bear mode on (gallery/fixtures): renders regardless of the setting. */
export function ForcedBearMode({ children }: { children: ReactNode }) {
  const value = useMemo<PieceArt>(
    () => ({ bearMode: true, toggle: () => {}, symbolFor: (kind) => BEAR_SYMBOL[kind] }),
    [],
  );
  return <PieceArtContext.Provider value={value}>{children}</PieceArtContext.Provider>;
}
