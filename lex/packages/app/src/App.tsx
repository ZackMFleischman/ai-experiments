// ported from hive/packages/app/src/App.tsx (adapted)
import { Box, CssBaseline, ThemeProvider } from '@mui/material';
import { useMemo, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Game } from './screens/Game';
import { Join } from './screens/Join';
import { Landing } from './screens/Landing';
import { Lobby } from './screens/Lobby';
import { NewGame } from './screens/NewGame';
import { Settings } from './screens/Settings';
import { ColorModeContext, createAppTheme, type ThemeMode } from './theme';

// Auth guards (T4.1) and the /dev/gallery route (T3.11) attach here later.
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
