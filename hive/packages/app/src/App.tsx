import { CssBaseline, ThemeProvider } from '@mui/material';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Game } from './screens/Game';
import { Join } from './screens/Join';
import { Landing } from './screens/Landing';
import { Lobby } from './screens/Lobby';
import { NewGame } from './screens/NewGame';
import { Settings } from './screens/Settings';
import { ColorModeContext, createAppTheme, type ThemeMode } from './theme';

// Dev-only: the fixture gallery is stripped from production builds.
const Gallery = import.meta.env.DEV
  ? lazy(() => import('./dev/Gallery').then((m) => ({ default: m.Gallery })))
  : null;

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/lobby" element={<Lobby />} />
      <Route path="/new" element={<NewGame />} />
      <Route path="/join/:code" element={<Join />} />
      <Route path="/game/:id" element={<Game />} />
      <Route path="/settings" element={<Settings />} />
      {Gallery && (
        <Route
          path="/dev/gallery"
          element={
            <Suspense fallback={null}>
              <Gallery />
            </Suspense>
          }
        />
      )}
    </Routes>
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
