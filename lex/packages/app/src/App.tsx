// ported from hive/packages/app/src/App.tsx (adapted)
import { Box, CssBaseline, ThemeProvider } from '@mui/material';
import { Suspense, lazy, useMemo, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
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

// Auth guards (T4.1) attach here later.
export function AppRoutes() {
  return (
    <Box component="main">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/lobby" element={<Lobby />} />
        <Route path="/new" element={<NewGame />} />
        <Route path="/join/:code" element={<Join />} />
        <Route path="/game/:id" element={<Game />} />
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
  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
