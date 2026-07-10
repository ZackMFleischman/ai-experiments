// @vitest-environment jsdom
// App flows over fake storage: home → new game → play → undo/notes → resume.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);
import type { KeyValueStorage } from '@parlor/solo';
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

function renderApp(storage = new FakeStorage(), route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppProviders storage={storage}>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  );
}

function playableCell(): HTMLElement {
  // Any empty cell: gridcells labelled without a digit suffix.
  const cells = screen.getAllByRole('gridcell');
  const empty = cells.find((c) => /^r\dc\d$/.test(c.getAttribute('aria-label') ?? ''));
  if (!empty) throw new Error('no empty cell found');
  return empty;
}

describe('home', () => {
  it('offers the daily, difficulties, and the family panel', () => {
    renderApp();
    expect(screen.getByRole('button', { name: 'Daily puzzle' })).toBeTruthy();
    for (const label of ['Easy', 'Medium', 'Hard', 'Expert']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('link', { name: /Hive/ })).toBeTruthy();
    expect(screen.queryByText('Continue')).toBeNull();
  });

  it('toggles color mode and persists it', () => {
    const storage = new FakeStorage();
    renderApp(storage);
    fireEvent.click(screen.getByRole('button', { name: 'toggle color mode' }));
    expect(storage.getItem('sudoku:mode')).toBe('dark');
  });
});

describe('play', () => {
  it('starts an easy game and lands on the board', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Easy' }));
    expect(screen.getByRole('grid', { name: 'sudoku board' })).toBeTruthy();
    expect(screen.getAllByRole('gridcell')).toHaveLength(81);
  });

  it('sets a digit, erases it, and undoes/redoes', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Easy' }));
    const cell = playableCell();
    const label = cell.getAttribute('aria-label');
    fireEvent.pointerDown(cell);
    fireEvent.click(screen.getByRole('button', { name: 'digit 5' }));
    expect(cell.getAttribute('aria-label')).toBe(`${label} 5`);

    fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    expect(cell.getAttribute('aria-label')).toBe(label);
    fireEvent.click(screen.getByRole('button', { name: 'redo' }));
    expect(cell.getAttribute('aria-label')).toBe(`${label} 5`);
    fireEvent.click(screen.getByRole('button', { name: 'erase' }));
    expect(cell.getAttribute('aria-label')).toBe(label);
  });

  it('notes mode pencils digits instead of setting them', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Easy' }));
    const cell = playableCell();
    const label = cell.getAttribute('aria-label');
    fireEvent.pointerDown(cell);
    fireEvent.click(screen.getByRole('button', { name: 'notes mode' }));
    fireEvent.click(screen.getByRole('button', { name: 'digit 3' }));
    // Still no value in the label — the 3 went into the pencil marks.
    expect(cell.getAttribute('aria-label')).toBe(label);
    expect(cell.textContent).toContain('3');
  });

  it('keyboard digits work', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Easy' }));
    const cell = playableCell();
    const label = cell.getAttribute('aria-label');
    fireEvent.pointerDown(cell);
    fireEvent.keyDown(window, { key: '7' });
    expect(cell.getAttribute('aria-label')).toBe(`${label} 7`);
  });
});

describe('resume', () => {
  it('a game in progress survives a full remount and shows Continue', () => {
    const storage = new FakeStorage();
    const first = renderApp(storage);
    fireEvent.click(screen.getByRole('button', { name: 'Medium' }));
    const cell = playableCell();
    fireEvent.pointerDown(cell);
    fireEvent.click(screen.getByRole('button', { name: 'digit 5' }));
    first.unmount();

    renderApp(storage);
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.getByRole('grid', { name: 'sudoku board' })).toBeTruthy();
    // The played 5 is still on the board.
    const cells = screen.getAllByRole('gridcell');
    expect(cells.some((c) => (c.getAttribute('aria-label') ?? '').endsWith(' 5'))).toBe(true);
  });

  it('visiting /game with no session shows the empty state', () => {
    renderApp(new FakeStorage(), '/game');
    expect(screen.getByText('No game in progress.')).toBeTruthy();
  });
});
