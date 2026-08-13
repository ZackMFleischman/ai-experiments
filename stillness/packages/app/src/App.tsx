// Providers + routes, modeled on sudoku/packages/app/src/App.tsx. Stillness
// has no game session — just stats (sits + day streaks) over injected
// storage; the shell plumbing (color mode, theme, status bar) is
// @parlor/brand's BrandAppProviders.
import { BrandAppProviders } from '@parlor/brand';
import { syncStatusBar } from '@parlor/native';
import { StatsStore, type KeyValueStorage } from '@parlor/solo';
import { createContext, lazy, Suspense, useContext, useMemo, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Home } from './screens/Home';
import { Sit } from './screens/Sit';

// DEV-only: the validation gallery — lazy behind import.meta.env.DEV so it
// never reaches a production bundle (same pattern as sudoku/lex).
const GalleryRoute = import.meta.env.DEV ? lazy(() => import('./dev/GalleryRoute')) : null;

// Stillness sage — the app's single accent (family theme injects the rest).
export const ACCENT = { main: '#4e7d5b' };

export interface AppContextValue {
  stats: StatsStore;
  storage: KeyValueStorage;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp outside AppProviders');
  return value;
}

const MODE_KEY = 'stillness:mode';

/** Stats/storage context alone — no theme. The gallery uses this to put
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
  const value = useMemo<AppContextValue>(
    () => ({ stats: new StatsStore('stillness:stats', storage), storage }),
    [storage],
  );
  return (
    <AppStateProvider value={value}>
      {/* syncStatusBar keeps native status bars readable across mode flips
          (no-op on web — the Phase-3a bridge discipline). */}
      <BrandAppProviders accent={ACCENT} modeKey={MODE_KEY} storage={storage} onModeChange={syncStatusBar}>
        {children}
      </BrandAppProviders>
    </AppStateProvider>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/sit" element={<Sit />} />
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
