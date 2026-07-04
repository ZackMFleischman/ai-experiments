// ported from hive/packages/app/src/App.tsx (adapted)
import { Box, CssBaseline, ThemeProvider } from '@mui/material';
import { RequireAuth } from '@parlor/web';
import { Suspense, lazy, useMemo, useState } from 'react';
import { Route, Routes, useParams } from 'react-router-dom';
import { Game } from './screens/Game';
import { Join } from './screens/Join';
import { Landing } from './screens/Landing';
import { Lobby } from './screens/Lobby';
import { NewGame } from './screens/NewGame';
import { Settings } from './screens/Settings';
import { ColorModeContext, createAppTheme, type ThemeMode } from './theme';

// DEV-only: the validation gallery (T3.11) — lazy behind import.meta.env.DEV
// so it never reaches a production bundle.
const GalleryRoute = import.meta.env.DEV ? lazy(() => import('./dev/GalleryRoute')) : null;

// Full (multiplayer) mode only: the firebase-backed provider stack. The static
// hot-seat build (no VITE_LEX_MODE) drops this branch at build time, keeping
// the bundle firebase-free (T3.12 / scripts/check-bundle.mjs).
const SyncProviders =
  import.meta.env.VITE_LEX_MODE === 'full' ? lazy(() => import('./sync/AppSyncProviders')) : null;

/** The hot-seat game stays unguarded (it is fully local); real games need auth. */
function GameGate() {
  const { id } = useParams<{ id: string }>();
  if (id === 'local') return <Game />;
  return (
    <RequireAuth>
      <Game />
    </RequireAuth>
  );
}

export function AppRoutes() {
  return (
    <Box component="main">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/lobby"
          element={
            <RequireAuth>
              <Lobby />
            </RequireAuth>
          }
        />
        <Route
          path="/new"
          element={
            <RequireAuth>
              <NewGame />
            </RequireAuth>
          }
        />
        <Route
          path="/join/:code"
          element={
            <RequireAuth>
              <Join />
            </RequireAuth>
          }
        />
        <Route path="/game/:id" element={<GameGate />} />
        <Route path="/settings" element={<Settings />} />
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
      </Routes>
    </Box>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');
  const colorMode = useMemo(
    () => ({ mode, toggle: () => setMode((m) => (m === 'light' ? 'dark' : 'light')) }),
    [mode],
  );
  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const themed = (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
  if (!SyncProviders) return themed;
  return (
    <Suspense fallback={null}>
      <SyncProviders>{themed}</SyncProviders>
    </Suspense>
  );
}
