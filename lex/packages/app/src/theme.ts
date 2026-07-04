// ported from hive/packages/app/src/theme.ts (adapted)
import { createTheme, type Theme } from '@mui/material/styles';
import { createContext, useContext } from 'react';

export type ThemeMode = 'light' | 'dark';

// One accent color, generous whitespace, rounded MUI defaults (DESIGN §7.5).
export function createAppTheme(mode: ThemeMode): Theme {
  return createTheme({
    palette: {
      mode,
      primary: { main: '#0d7a5f' }, // lex board green
    },
    shape: { borderRadius: 12 },
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
