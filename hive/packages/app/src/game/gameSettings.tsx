// In-game preferences that live outside the engine (rendering/UX only, never
// rules): currently the "Confirm move" toggle. Bear mode has its own context
// (board/pieceArt); both are surfaced together by the in-game settings gear.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface GameSettings {
  /** When on, a move is staged as a preview and only sent once confirmed. */
  confirmMove: boolean;
  toggleConfirmMove: () => void;
}

const STORAGE_KEY = 'hive-confirm-move';

const defaultSettings: GameSettings = { confirmMove: false, toggleConfirmMove: () => {} };
const GameSettingsContext = createContext<GameSettings>(defaultSettings);

export function useGameSettings(): GameSettings {
  return useContext(GameSettingsContext);
}

export function GameSettingsProvider({ children }: { children: ReactNode }) {
  const [confirmMove, setConfirmMove] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'on',
  );
  const toggleConfirmMove = useCallback(() => {
    setConfirmMove((on) => {
      localStorage.setItem(STORAGE_KEY, on ? 'off' : 'on');
      return !on;
    });
  }, []);
  const value = useMemo<GameSettings>(
    () => ({ confirmMove, toggleConfirmMove }),
    [confirmMove, toggleConfirmMove],
  );
  return <GameSettingsContext.Provider value={value}>{children}</GameSettingsContext.Provider>;
}
