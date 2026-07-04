// ported from hive/packages/app/src/dev/Gallery.tsx (adapted, genericized)
// Dev-only fixture gallery: the game supplies the registry + theme factory.
// ?entry=<id> renders one entry full-bleed for capture; ?static=1 freezes
// animation and pins fixture values; ?theme=dark flips the theme.
import { Box, CssBaseline, List, ListItemButton, ListItemText, ThemeProvider, Typography } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface GalleryEntry {
  id: string;
  render: () => ReactNode;
}

const StaticModeContext = createContext(false);
export const useStaticMode = (): boolean => useContext(StaticModeContext);

export interface GalleryProps {
  registry: readonly GalleryEntry[];
  createTheme: (mode: 'light' | 'dark') => Theme;
  extraCss?: string;
}

export function Gallery({ registry, createTheme, extraCss }: GalleryProps) {
  const [params, setParams] = useSearchParams();
  const entryId = params.get('entry');
  const isStatic = params.get('static') === '1';
  const mode = params.get('theme') === 'dark' ? 'dark' : 'light';
  const theme = useMemo(() => createTheme(mode), [createTheme, mode]);
  const entry = registry.find((e) => e.id === entryId);

  return (
    <StaticModeContext.Provider value={isStatic}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {extraCss && <style>{extraCss}</style>}
        {isStatic && (
          <style>{'*, *::before, *::after { animation: none !important; transition: none !important; }'}</style>
        )}
        {entry ? (
          <Box data-gallery-entry={entry.id} sx={{ height: '100dvh' }}>
            {entry.render()}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
            <List dense data-gallery-index sx={{ width: 280, borderRight: 1, borderColor: 'divider' }}>
              {registry.map((e) => (
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
