// The gallery registry (sudoku dev/registry.tsx pattern): every visual state
// of the two screens, reproducible. validate:visual walks these × viewports ×
// themes and screenshots each combination. The running face ticks live —
// the visual gate checks cleanliness and geometry, not pixel equality.
import { ColorModeContext } from '@parlor/brand';
import { StatsStore, dayKey, type KeyValueStorage } from '@parlor/solo';
import { useTheme } from '@mui/material/styles';
import { useMemo, type ReactNode } from 'react';
import type { GalleryEntry } from '@parlor/harness';
import { AppStateProvider, type AppContextValue } from '../App';
import { Home } from '../screens/Home';
import { Sit } from '../screens/Sit';

const memoryStorage = (): KeyValueStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
};

function makeApp(prepare?: (app: AppContextValue) => void): AppContextValue {
  const storage = memoryStorage();
  const app: AppContextValue = { stats: new StatsStore('stillness:stats', storage), storage };
  prepare?.(app);
  return app;
}

/** App context from a fixture factory + a ColorModeContext that mirrors the
 * gallery's active theme (so Home's mode toggle glyph matches the capture). */
function WithApp({ make, children }: { make: () => AppContextValue; children: ReactNode }) {
  // Build once per mount; deliberately not re-created on re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(make, []);
  const mode = useTheme().palette.mode;
  const colorMode = useMemo(() => ({ mode, toggle: () => {} }), [mode]);
  return (
    <AppStateProvider value={value}>
      <ColorModeContext.Provider value={colorMode}>{children}</ColorModeContext.Provider>
    </AppStateProvider>
  );
}

/** A little history so Home shows the stats line (fixed days, no clock). */
const streakHome = (app: AppContextValue): void => {
  const dayMs = 24 * 3_600_000;
  [2, 1, 0].forEach((back) => {
    app.stats.record({
      day: dayKey(new Date(Date.now() - back * dayMs)),
      durationMs: 10 * 60_000,
      won: true,
      bucket: 'sit',
    });
  });
};

const app = (make: () => AppContextValue, node: ReactNode): (() => ReactNode) =>
  function render() {
    return <WithApp make={make}>{node}</WithApp>;
  };

export const GALLERY: GalleryEntry[] = [
  { id: 'home', render: app(() => makeApp(), <Home />) },
  { id: 'home-streak', render: app(() => makeApp(streakHome), <Home />) },
  { id: 'sit-running', render: app(() => makeApp(), <Sit />) },
  { id: 'sit-paused', render: app(() => makeApp(), <Sit fixture="paused" />) },
  { id: 'sit-done', render: app(() => makeApp(), <Sit fixture="done" />) },
];
