// The family theme: what makes N apps read as one brand. Each app injects
// only its accent color; everything else — type scale, radius, spacing
// rhythm, both color modes — is shared here. Generalized from lex's
// packages/app/src/theme.ts (which stays as-is until it migrates).
import { createTheme, type Theme } from '@mui/material/styles';
import { createContext, useContext } from 'react';

export type ThemeMode = 'light' | 'dark';

export interface BrandAccent {
  /** The app's single accent color (buttons, highlights, focus). */
  main: string;
  /** Optional contrast override when MUI's computed one is wrong. */
  contrastText?: string;
}

// One accent color per app, generous whitespace, rounded corners, quiet
// chrome — the house style.
export function createBrandTheme(mode: ThemeMode, accent: BrandAccent): Theme {
  return createTheme({
    palette: {
      mode,
      primary: { ...accent },
    },
    shape: { borderRadius: 12 },
    typography: {
      h1: { fontSize: '2rem', fontWeight: 700 },
      h2: { fontSize: '1.5rem', fontWeight: 700 },
      h3: { fontSize: '1.25rem', fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
      },
      MuiPaper: {
        styleOverrides: { rounded: { borderRadius: 16 } },
      },
    },
  });
}

export interface ColorModeValue {
  mode: ThemeMode;
  toggle: () => void;
}

export const ColorModeContext = createContext<ColorModeValue>({
  mode: 'light',
  toggle: () => {},
});

export function useColorMode(): ColorModeValue {
  return useContext(ColorModeContext);
}
