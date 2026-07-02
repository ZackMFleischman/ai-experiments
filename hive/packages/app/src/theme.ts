import { createTheme, type Theme } from '@mui/material/styles';
import { createContext, useContext } from 'react';

export type ThemeMode = 'light' | 'dark';

// One accent color, generous whitespace, rounded MUI defaults (DESIGN §6.4).
export function createAppTheme(mode: ThemeMode): Theme {
  return createTheme({
    palette: {
      mode,
      primary: { main: '#e8a013' }, // hive amber
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
