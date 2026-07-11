// The family theme: what makes N apps read as one brand. Each app injects
// only its accent color; everything else — type scale, radius, spacing
// rhythm, both color modes, and every derived surface — is shared here.
// DESIGN-PRINCIPLES.md §3: one accent in, a whole palette out. Apps never
// hardcode a surface hex; boards read `theme.palette.board`.
import { createTheme, type Theme } from '@mui/material/styles';
import { createContext, useContext } from 'react';

export type ThemeMode = 'light' | 'dark';

export interface BrandAccent {
  /** The app's single accent color (buttons, highlights, focus). */
  main: string;
  /** Optional contrast override when MUI's computed one is wrong. */
  contrastText?: string;
}

/** The play-surface tokens every board/court/ring derives from. */
export interface BoardPalette {
  /** The play area's background (board frame, court). */
  surface: string;
  /** The alternate-cell wash (checker squares, grid shading). */
  cell: string;
}

declare module '@mui/material/styles' {
  interface Palette {
    board: BoardPalette;
  }
  interface PaletteOptions {
    board?: BoardPalette;
  }
}

/** Blend `amount` of `tint` into `base` (both #rrggbb). */
function mix(base: string, tint: string, amount: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const blend = (i: number) =>
    Math.round(channel(base, i) * (1 - amount) + channel(tint, i) * amount);
  return `#${[0, 1, 2].map((i) => blend(i).toString(16).padStart(2, '0')).join('')}`;
}

// One accent color per app, generous whitespace, rounded corners, quiet
// chrome — the house style. Backgrounds and board tokens are tinted with
// the accent so each app has its own atmosphere without a second color.
export function createBrandTheme(mode: ThemeMode, accent: BrandAccent): Theme {
  const light = mode === 'light';
  const background = light
    ? { default: mix('#fbfaf7', accent.main, 0.04), paper: '#ffffff' }
    : { default: mix('#131316', accent.main, 0.06), paper: mix('#1c1c20', accent.main, 0.04) };
  const board: BoardPalette = light
    ? {
        surface: mix('#efece3', accent.main, 0.05),
        cell: mix(mix('#efece3', accent.main, 0.05), '#3a352c', 0.14),
      }
    : {
        surface: mix('#1b1b1f', accent.main, 0.08),
        cell: mix(mix('#1b1b1f', accent.main, 0.08), '#e8e6df', 0.12),
      };
  return createTheme({
    palette: {
      mode,
      primary: { ...accent },
      background,
      board,
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
