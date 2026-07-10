// The M1 gallery registry (lex dev/registry.tsx pattern): every visual state
// of the two screens, named and reproducible from fixed seeds. validate:visual
// walks these × viewports × themes and screenshots each combination.
import { ColorModeContext } from '@parlor/brand';
import { dayKey, hashSeed, type KeyValueStorage } from '@parlor/solo';
import type { SudokuState } from '@sudoku/engine';
import { useTheme } from '@mui/material/styles';
import { useMemo, type ReactNode } from 'react';
import type { GalleryEntry } from '@parlor/harness';
import { AppStateProvider, type AppContextValue } from '../App';
import { createSession, createStats } from '../game/session';
import { Game } from '../screens/Game';
import { Home } from '../screens/Home';

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
    session: createSession(storage),
    stats: createStats(storage),
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

// Pinned seeds — never derived from the clock, so captures are reproducible.
const GALLERY_DAILY = { seed: hashSeed('daily:2026-01-01'), difficulty: 'medium', daily: '2026-01-01' } as const;
const GALLERY_GAME = { seed: hashSeed('sudoku-gallery'), difficulty: 'medium' } as const;

const emptyCells = (s: SudokuState): number[] =>
  Array.from({ length: 81 }, (_, i) => i).filter((i) => s.puzzle[i] === 0);

const start = (app: AppContextValue, options: typeof GALLERY_GAME | typeof GALLERY_DAILY): SudokuState => {
  app.session.start(options);
  return app.session.state as SudokuState;
};

/** Ten correct entries + pencil notes on the next three empties. */
const midGame = (app: AppContextValue): void => {
  const s = start(app, GALLERY_GAME);
  const empties = emptyCells(s);
  for (const cell of empties.slice(0, 10)) {
    app.session.submit({ t: 'set', cell, digit: s.solution[cell] as number });
  }
  const noteDigits: readonly (readonly number[])[] = [
    [1, 5, 9],
    [2, 6],
    [3],
  ];
  empties.slice(10, 13).forEach((cell, i) => {
    for (const digit of noteDigits[i] as readonly number[]) {
      app.session.submit({ t: 'note', cell, digit });
    }
  });
};

/** A wrong digit duplicating a given in its row — the conflict highlight. */
const conflictGame = (app: AppContextValue): void => {
  const s = start(app, GALLERY_GAME);
  const cell = emptyCells(s)[0] as number;
  const rowStart = Math.floor(cell / 9) * 9;
  const givenInRow = Array.from({ length: 9 }, (_, c) => rowStart + c).find((i) => s.puzzle[i] !== 0) as number;
  app.session.submit({ t: 'set', cell, digit: s.grid[givenInRow] as number });
};

/** Every instance of one digit placed — its DigitPad key goes disabled. */
const digitCompleteGame = (app: AppContextValue): void => {
  const s = start(app, GALLERY_GAME);
  const digit = s.solution[emptyCells(s)[0] as number] as number;
  for (let i = 0; i < 81; i++) {
    if (s.solution[i] === digit && s.puzzle[i] === 0) {
      app.session.submit({ t: 'set', cell: i, digit });
    }
  }
};

/** The full solution folded in — the solved dialog over the finished board. */
const solvedGame = (app: AppContextValue): void => {
  const s = start(app, GALLERY_DAILY);
  for (const cell of emptyCells(s)) {
    app.session.submit({ t: 'set', cell, digit: s.solution[cell] as number });
  }
};

/** An in-progress game + a small stats history so Home shows every section. */
const resumeHome = (app: AppContextValue): void => {
  midGame(app);
  const dayMs = 24 * 3_600_000;
  [new Date(Date.now() - dayMs), new Date()].forEach((d, i) => {
    app.stats.record({ day: dayKey(d), durationMs: 4 * 60_000 + i * 30_000, won: true, bucket: 'daily' });
  });
};

// ---- the registry ------------------------------------------------------------

const app = (make: () => AppContextValue, node: ReactNode): (() => ReactNode) =>
  function render() {
    return <WithApp make={make}>{node}</WithApp>;
  };

export const GALLERY: GalleryEntry[] = [
  { id: 'home', render: app(() => makeApp(), <Home />) },
  { id: 'home-resume', render: app(() => makeApp(resumeHome), <Home />) },
  { id: 'game-daily-fresh', render: app(() => makeApp((a) => void start(a, GALLERY_DAILY)), <Game />) },
  { id: 'game-mid', render: app(() => makeApp(midGame), <Game />) },
  { id: 'game-conflict', render: app(() => makeApp(conflictGame), <Game />) },
  { id: 'game-digit-complete', render: app(() => makeApp(digitCompleteGame), <Game />) },
  { id: 'game-solved', render: app(() => makeApp(solvedGame), <Game />) },
  { id: 'game-none', render: app(() => makeApp(), <Game />) },
];
