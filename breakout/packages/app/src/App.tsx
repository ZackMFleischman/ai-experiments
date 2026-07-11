// Providers + routes. The high-score store hangs off a context so tests
// inject fake storage; color mode persists and defaults to the OS.
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import {
  ColorModeContext,
  createBrandTheme,
  type ThemeMode,
} from '@parlor/brand';
import { syncStatusBar } from '@parlor/native';
import { HighScoreStore, type KeyValueStorage } from '@parlor/arcade';
import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Home } from './screens/Home';
import { Play } from './screens/Play';

// DEV-only: the validation gallery — lazy behind import.meta.env.DEV so it
// never reaches a production bundle (same pattern as sudoku).
const GalleryRoute = import.meta.env.DEV ? lazy(() => import('./dev/GalleryRoute')) : null;

// Bricks ember — the app's single accent (family theme injects the rest).
export const ACCENT = { main: '#d9480f' };

export interface AppContextValue {
  scores: HighScoreStore;
  storage: KeyValueStorage;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp outside AppProviders');
  return value;
}

const MODE_KEY = 'breakout:mode';

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

/** Scores/storage context alone — no theme. The gallery uses this to put
 * fixture state under its own ThemeProvider (dev/registry.tsx). */
export function AppStateProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: AppContextValue;
}) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
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
    () => ({ scores: new HighScoreStore('breakout:scores', storage), storage }),
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

  // Native shells: keep the status bar readable across mode flips (no-op on
  // web — the Phase-3a bridge discipline).
  useEffect(() => {
    void syncStatusBar(mode, theme.palette.background.default);
  }, [mode, theme]);

  return (
    <AppStateProvider value={value}>
      <ColorModeContext.Provider value={colorMode}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </ThemeProvider>
      </ColorModeContext.Provider>
    </AppStateProvider>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/play" element={<Play />} />
      {GalleryRoute && (
        <Route
          path="/dev/gallery"
          element={
            <Suspense fallback={null}>
              <GalleryRoute />
            </Suspense>
          }
        />
      )}
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
