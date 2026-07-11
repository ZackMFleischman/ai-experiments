// The gallery registry (sudoku dev/registry.tsx pattern): every visual
// state of the two screens, reproducible by folding scripted traces from
// pinned seeds — never the clock. validate:visual walks these × viewports ×
// themes and screenshots each combination. Play fixtures render frozen (one
// deterministic frame, no loop).
import { ColorModeContext } from '@parlor/brand';
import type { KeyValueStorage } from '@parlor/arcade';
import { useTheme } from '@mui/material/styles';
import { useMemo, type ReactNode } from 'react';
import type { GalleryEntry } from '@parlor/harness';
import {
  advance,
  initBreakout,
  type BreakoutAction,
  type BreakoutState,
} from '@breakout/engine';
import { AppStateProvider, type AppContextValue } from '../App';
import { HighScoreStore } from '@parlor/arcade';
import { Home } from '../screens/Home';
import { Play } from '../screens/Play';

// ---- fixture plumbing -------------------------------------------------------

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
  const app: AppContextValue = {
    scores: new HighScoreStore('breakout:scores', storage),
    storage,
  };
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

// ---- deterministic game states ---------------------------------------------

const SEED = 20260101; // pinned — captures must reproduce

/** Fold ticks with a per-tick action script until cond (or maxTicks). */
function fold(
  state: BreakoutState,
  maxTicks: number,
  actionsAt: (s: BreakoutState) => BreakoutAction[],
  until?: (s: BreakoutState) => boolean,
): BreakoutState {
  let s = state;
  for (let i = 0; i < maxTicks; i++) {
    if (until?.(s)) break;
    s = advance(s, actionsAt(s));
  }
  return s;
}

const serving = (): BreakoutState => initBreakout({ seed: SEED });

/** Mid-flight, a handful of bricks down, paddle tracking the ball. */
const midGame = (): BreakoutState => {
  let s = advance(serving(), [{ t: 'serve' }]);
  s = fold(s, 1200, (st) => [{ t: 'target', x: st.ball?.x ?? st.paddleX }]);
  return s;
};

/** The wall cleared — the between-levels breath. */
const levelCleared = (): BreakoutState => {
  let s = serving();
  // Thin the wall to one brick so the clear folds quickly and reliably.
  const index = s.bricks.findIndex((hp) => hp > 0);
  s = { ...s, bricks: s.bricks.map((hp, i) => (i === index ? 1 : 0)) };
  s = advance(s, [{ t: 'serve' }]);
  return fold(
    s,
    60_000,
    (st) => [{ t: 'target', x: st.ball?.x ?? st.paddleX }],
    (st) => st.phase === 'level-cleared',
  );
};

/** All three balls lost with the paddle parked in a corner. */
const gameOver = (): BreakoutState => {
  let s = serving();
  for (let round = 0; round < 3 && s.phase !== 'game-over'; round++) {
    s = fold(s, 120, () => [{ t: 'move', dir: -1 }]);
    s = advance(s, [{ t: 'move', dir: 0 }]);
    s = advance(s, [{ t: 'serve' }]);
    s = fold(s, 60_000, () => [], (st) => st.phase !== 'live');
  }
  return s;
};

/** A best-runs history so Home shows every section. */
const scoredHome = (app: AppContextValue): void => {
  const runs: Array<[number, string]> = [
    [420, '2026-01-03'],
    [310, '2026-01-01'],
    [180, '2026-01-02'],
  ];
  for (const [score, day] of runs) app.scores.record({ score, day });
};

// ---- the registry ------------------------------------------------------------

const app = (make: () => AppContextValue, node: ReactNode): (() => ReactNode) =>
  function render() {
    return <WithApp make={make}>{node}</WithApp>;
  };

export const GALLERY: GalleryEntry[] = [
  { id: 'home', render: app(() => makeApp(), <Home />) },
  { id: 'home-scores', render: app(() => makeApp(scoredHome), <Home />) },
  { id: 'play-serving', render: app(() => makeApp(), <Play fixture={serving()} />) },
  { id: 'play-mid', render: app(() => makeApp(), <Play fixture={midGame()} />) },
  { id: 'play-level-cleared', render: app(() => makeApp(), <Play fixture={levelCleared()} />) },
  { id: 'play-game-over', render: app(() => makeApp(scoredHome), <Play fixture={gameOver()} />) },
];
