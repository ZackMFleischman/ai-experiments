// @vitest-environment jsdom
// The Apple-4.2 wiring under a mocked Capacitor bridge (the Phase-3a test
// discipline): entry haptics, success haptic + throttled review ask on solve,
// share from the solved dialog — and all of it invisible in a plain browser.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
});
import type { KeyValueStorage } from '@parlor/solo';
import { initSudoku, type SudokuOptions } from '@sudoku/engine';
import { AppProviders, AppRoutes } from '../src/App';

class FakeStorage implements KeyValueStorage {
  map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function installBridge() {
  const plugins = {
    Haptics: { impact: vi.fn(), notification: vi.fn(), selectionChanged: vi.fn() },
    Share: { share: vi.fn().mockResolvedValue({}) },
    InAppReview: { requestReview: vi.fn() },
    StatusBar: { setStyle: vi.fn(), setBackgroundColor: vi.fn() },
  };
  (globalThis as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: plugins,
  };
  return plugins;
}

/** A stored game one correct entry away from solved, plus its winning move. */
function seedAlmostSolved(storage: FakeStorage): { lastCell: number; lastDigit: number } {
  const options: SudokuOptions = { seed: 7, difficulty: 'easy' };
  const state = initSudoku(options);
  const empty = state.grid
    .map((v, i) => (v === 0 ? i : -1))
    .filter((i) => i >= 0);
  const log = empty
    .slice(0, -1)
    .map((cell) => ({ t: 'set', cell, digit: state.solution[cell] }));
  storage.setItem('sudoku:game', JSON.stringify({ options, log, cursor: log.length }));
  const lastCell = empty[empty.length - 1] as number;
  return { lastCell, lastDigit: state.solution[lastCell] as number };
}

function renderGame(storage: FakeStorage) {
  return render(
    <MemoryRouter initialEntries={['/game']}>
      <AppProviders storage={storage}>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  );
}

function cellByIndex(index: number): HTMLElement {
  const label = `r${Math.floor(index / 9) + 1}c${(index % 9) + 1}`;
  const cell = screen
    .getAllByRole('gridcell')
    .find((c) => (c.getAttribute('aria-label') ?? '').startsWith(label));
  if (!cell) throw new Error(`cell ${label} not found`);
  return cell;
}

describe('native wiring (mocked bridge)', () => {
  it('solving fires a success haptic, entry ticks, and share works from the dialog', async () => {
    const plugins = installBridge();
    const storage = new FakeStorage();
    const { lastCell, lastDigit } = seedAlmostSolved(storage);
    renderGame(storage);

    fireEvent.pointerDown(cellByIndex(lastCell));
    fireEvent.click(screen.getByRole('button', { name: `digit ${lastDigit}` }));

    expect(plugins.Haptics.selectionChanged).toHaveBeenCalled();
    expect(await screen.findByText('Solved')).toBeTruthy();
    expect(plugins.Haptics.notification).toHaveBeenCalledWith({ type: 'SUCCESS' });
    // First win: the OS rating ask stays quiet until the third.
    expect(plugins.InAppReview.requestReview).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(plugins.Share.share).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sudoku', url: 'https://sudoku-zmf.pages.dev' }),
    );
  });

  it('asks for a review from the third win on', () => {
    const plugins = installBridge();
    const storage = new FakeStorage();
    // Two wins already on the books.
    storage.setItem(
      'sudoku:stats',
      JSON.stringify([
        { day: '2026-07-08', durationMs: 60000, won: true },
        { day: '2026-07-09', durationMs: 60000, won: true },
      ]),
    );
    const { lastCell, lastDigit } = seedAlmostSolved(storage);
    renderGame(storage);
    fireEvent.pointerDown(cellByIndex(lastCell));
    fireEvent.click(screen.getByRole('button', { name: `digit ${lastDigit}` }));
    expect(plugins.InAppReview.requestReview).toHaveBeenCalledOnce();
  });

  it('syncs the status bar with color mode', async () => {
    const plugins = installBridge();
    renderGame(new FakeStorage());
    await waitFor(() => expect(plugins.StatusBar.setStyle).toHaveBeenCalledWith({ style: 'LIGHT' }));
    // android gets the matching background color too
    await waitFor(() => expect(plugins.StatusBar.setBackgroundColor).toHaveBeenCalled());
  });

  it('a plain browser sees none of it: no Share button in the solved dialog', () => {
    const storage = new FakeStorage();
    const { lastCell, lastDigit } = seedAlmostSolved(storage);
    renderGame(storage);
    fireEvent.pointerDown(cellByIndex(lastCell));
    fireEvent.click(screen.getByRole('button', { name: `digit ${lastDigit}` }));
    expect(screen.getByText('Solved')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });
});
