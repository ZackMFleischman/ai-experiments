// Tile-skin preference (T6.1): a context + localStorage persistence. Skin id
// is presentation state — rules and the engine never see it (DESIGN §3.4).
// Mode (light/dark) deliberately stays on the MUI theme (M3 lesson §8: skin
// components read the theme for mode, this context for the skin id only).
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { SKIN_IDS, type TileSkinId } from './skin';

export const SKIN_STORAGE_KEY = 'lex.skin.v1';

interface SkinValue {
  skin: TileSkinId;
  setSkin: (skin: TileSkinId) => void;
}

export const SkinContext = createContext<SkinValue>({ skin: 'classic', setSkin: () => {} });

export function useSkinId(): TileSkinId {
  return useContext(SkinContext).skin;
}

export function useSkin(): SkinValue {
  return useContext(SkinContext);
}

export function storedSkin(storage: Pick<Storage, 'getItem'> | undefined): TileSkinId {
  try {
    const raw = storage?.getItem(SKIN_STORAGE_KEY);
    return SKIN_IDS.includes(raw as TileSkinId) ? (raw as TileSkinId) : 'classic';
  } catch {
    return 'classic';
  }
}

export function SkinProvider({ children }: { children: ReactNode }) {
  const [skin, setSkinState] = useState<TileSkinId>(() =>
    storedSkin(typeof window === 'undefined' ? undefined : window.localStorage),
  );
  const setSkin = useCallback((next: TileSkinId) => {
    setSkinState(next);
    try {
      window.localStorage.setItem(SKIN_STORAGE_KEY, next);
    } catch {
      // Quota/permissions: the choice just won't survive a refresh.
    }
  }, []);
  const value = useMemo(() => ({ skin, setSkin }), [skin, setSkin]);
  return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>;
}
