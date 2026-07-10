// Providers + routes. The session/stats singletons hang off a context so
// tests inject fake storage; color mode persists and defaults to the OS.
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import {
  ColorModeContext,
  createBrandTheme,
  type ThemeMode,
} from '@parlor/brand';
import type { KeyValueStorage } from '@parlor/solo';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { createSession, createStats, type Session } from './game/session';
import type { StatsStore } from '@parlor/solo';
import { Game } from './screens/Game';
import { Home } from './screens/Home';

// Sudoku indigo — the app's single accent (family theme injects the rest).
export const ACCENT = { main: '#3b5bdb' };

export interface AppContextValue {
  session: Session;
  stats: StatsStore;
  storage: KeyValueStorage;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp outside AppProviders');
  return value;
}

const MODE_KEY = 'sudoku:mode';

function initialMode(storage: KeyValueStorage): ThemeMode {
  try {
    const stored = storage.getItem(MODE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // fall through to the OS preference
  }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function AppProviders({
  children,
  storage = window.localStorage,
}: {
  children: ReactNode;
  storage?: KeyValueStorage;
}) {
  const [mode, setMode] = useState<ThemeMode>(() => initialMode(storage));
  const value = useMemo<AppContextValue>(
    () => ({ session: createSession(storage), stats: createStats(storage), storage }),
    [storage],
  );
  const colorMode = useMemo(
    () => ({
      mode,
      toggle: () =>
        setMode((m) => {
          const next = m === 'light' ? 'dark' : 'light';
          try {
            storage.setItem(MODE_KEY, next);
          } catch {
            // preference just won't stick
          }
          return next;
        }),
    }),
    [mode, storage],
  );
  const theme = useMemo(() => createBrandTheme(mode, ACCENT), [mode]);

  return (
    <AppContext.Provider value={value}>
      <ColorModeContext.Provider value={colorMode}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </ThemeProvider>
      </ColorModeContext.Provider>
    </AppContext.Provider>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/game" element={<Game />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
