// The shell plumbing every brand app used to hand-copy (PORTFOLIO-HARDENING
// M5): color mode init (stored preference, else the OS default), toggle +
// persist, the family theme from the app's single accent, and the
// ColorModeContext/ThemeProvider/CssBaseline stack. Apps compose their own
// providers (state contexts, firebase sync stacks) around this and keep only
// game content in App.tsx.
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ColorModeContext,
  createBrandTheme,
  type BrandAccent,
  type ThemeMode,
} from './theme.js';

/** The mode-persistence seam — window.localStorage or an injected test Map. */
export interface BrandModeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): BrandModeStorage | undefined {
  return typeof window !== 'undefined' ? window.localStorage : undefined;
}

function initialMode(modeKey: string, storage: BrandModeStorage | undefined): ThemeMode {
  try {
    const stored = storage?.getItem(modeKey);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // fall through to the OS preference
  }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export interface BrandAppProvidersProps {
  /** The app's single accent (family theme injects the rest). */
  accent: BrandAccent;
  /** Storage key the mode preference persists under (e.g. `'sudoku:mode'`). */
  modeKey: string;
  /** Override the persistence seam (tests inject a Map-backed fake). */
  storage?: BrandModeStorage;
  /**
   * Called on mount and whenever the mode flips, with the new mode and the
   * theme's background — native shells pass `syncStatusBar` from
   * `@parlor/native` here (brand itself stays native-free).
   */
  onModeChange?: (mode: ThemeMode, background: string) => unknown;
  children: ReactNode;
}

export function BrandAppProviders({
  accent,
  modeKey,
  storage = defaultStorage(),
  onModeChange,
  children,
}: BrandAppProvidersProps) {
  const [mode, setMode] = useState<ThemeMode>(() => initialMode(modeKey, storage));
  const colorMode = useMemo(
    () => ({
      mode,
      toggle: () =>
        setMode((m) => {
          const next: ThemeMode = m === 'light' ? 'dark' : 'light';
          try {
            storage?.setItem(modeKey, next);
          } catch {
            // preference just won't stick
          }
          return next;
        }),
    }),
    [mode, modeKey, storage],
  );
  const theme = useMemo(() => createBrandTheme(mode, accent), [mode, accent]);

  useEffect(() => {
    if (onModeChange) void onModeChange(mode, theme.palette.background.default);
  }, [mode, theme, onModeChange]);

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
