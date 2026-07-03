// Dev-only fixture gallery (IMPLEMENTATION §4.1). ?entry=<id> renders one entry
// full-bleed for capture; ?static=1 freezes animation and pins fixture values.
import { Box, CssBaseline, List, ListItemButton, ListItemText, ThemeProvider, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { SpriteSheet } from '../board/sprites';
import { createAppTheme } from '../theme';
import { GALLERY } from './galleryRegistry';
import { createContext, useContext, useMemo } from 'react';

const StaticModeContext = createContext(false);
export const useStaticMode = () => useContext(StaticModeContext);

const tileColors = `
.hive-tile-w { --hive-tile: #f3e9d2; color: #4a3b20; }
.hive-tile-b { --hive-tile: #3a3733; --hive-tile-edge: #ffffff2e; color: #efe7d6; }
`;

export function Gallery() {
  const [params, setParams] = useSearchParams();
  const entryId = params.get('entry');
  const isStatic = params.get('static') === '1';
  const mode = params.get('theme') === 'dark' ? 'dark' : 'light';
  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const entry = GALLERY.find((e) => e.id === entryId);

  return (
    <StaticModeContext.Provider value={isStatic}>
      <ThemeProvider theme={theme}>
      <CssBaseline />
      <style>{tileColors}</style>
      {isStatic && <style>{'*, *::before, *::after { animation: none !important; transition: none !important; }'}</style>}
      <SpriteSheet />
      {entry ? (
        <Box data-gallery-entry={entry.id}>{entry.render()}</Box>
      ) : (
        <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
          <List dense data-gallery-index sx={{ width: 280, borderRight: 1, borderColor: 'divider' }}>
            {GALLERY.map((e) => (
              <ListItemButton key={e.id} data-entry-id={e.id} onClick={() => setParams({ entry: e.id })}>
                <ListItemText primary={e.id} />
              </ListItemButton>
            ))}
          </List>
          <Box sx={{ p: 3 }}>
            <Typography color="text.secondary">Pick an entry — or pass ?entry=&lt;id&gt;.</Typography>
          </Box>
        </Box>
      )}
      </ThemeProvider>
    </StaticModeContext.Provider>
  );
}
