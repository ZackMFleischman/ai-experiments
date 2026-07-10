// @vitest-environment jsdom
// App flows over fake storage: home → sit → pause/resume → completion →
// stats. Fake timers drive the sit to its bell.
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
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

describe('home', () => {
  it('offers the presets, the custom slider, and the family panel', () => {
    renderApp();
    for (const label of ['5 min', '10 min', '15 min', '20 min']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('slider', { name: 'custom minutes' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Sudoku/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Hive/ })).toBeTruthy();
  });

  it('toggles color mode and persists it', () => {
    const storage = new FakeStorage();
    renderApp(storage);
    fireEvent.click(screen.getByRole('button', { name: 'toggle color mode' }));
    expect(storage.getItem('stillness:mode')).toBe('dark');
  });
});

describe('sit', () => {
  it('starts a 5 minute sit showing the full time', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: '5 min' }));
    expect(screen.getByRole('timer', { name: 'time remaining' }).textContent).toBe('5:00');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('pause freezes the countdown; resume continues it', () => {
    vi.useFakeTimers();
    renderApp(new FakeStorage(), '/sit?m=5');
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('timer', { name: 'time remaining' }).textContent).toBe('4:00');

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    act(() => void vi.advanceTimersByTime(120_000));
    expect(screen.getByRole('timer', { name: 'time remaining' }).textContent).toBe('4:00');

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('timer', { name: 'time remaining' }).textContent).toBe('3:00');
  });

  it('completion shows the done state and records the sit', () => {
    vi.useFakeTimers();
    const storage = new FakeStorage();
    renderApp(storage, '/sit?m=1');
    act(() => void vi.advanceTimersByTime(61_000));
    expect(screen.getByText(/That's it\./)).toBeTruthy();
    const recorded = JSON.parse(storage.getItem('stillness:stats') ?? '[]') as unknown[];
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ won: true, bucket: 'sit' });
    // No share button in a plain browser (native-gated).
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('End finishes early and records the time actually sat', () => {
    vi.useFakeTimers();
    const storage = new FakeStorage();
    renderApp(storage, '/sit?m=10');
    act(() => void vi.advanceTimersByTime(3 * 60_000));
    fireEvent.click(screen.getByRole('button', { name: 'end the sit now' }));
    expect(screen.getByText(/That's it\./)).toBeTruthy();
    expect(screen.getByText(/3 quiet minutes/)).toBeTruthy();
    const recorded = JSON.parse(storage.getItem('stillness:stats') ?? '[]') as Array<{ durationMs: number }>;
    expect(recorded[0]?.durationMs).toBeGreaterThanOrEqual(3 * 60_000 - 1000);
    expect(recorded[0]?.durationMs).toBeLessThan(4 * 60_000);
  });

  it('a finished sit shows up in home stats', () => {
    vi.useFakeTimers();
    const storage = new FakeStorage();
    const first = renderApp(storage, '/sit?m=1');
    act(() => void vi.advanceTimersByTime(61_000));
    first.unmount();
    vi.useRealTimers();
    renderApp(storage);
    expect(screen.getByText(/1 sit/)).toBeTruthy();
  });
});
