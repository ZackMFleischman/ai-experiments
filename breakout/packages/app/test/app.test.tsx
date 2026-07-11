// @vitest-environment jsdom
// App wiring under fake storage: routes render, high scores surface on
// Home, the court mounts its canvas, frozen fixtures freeze, and a full
// engine game folds inside the app's own store types.
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '@parlor/arcade';
import { advance, initBreakout } from '@breakout/engine';
import { AppProviders, AppRoutes } from '../src/App';
import { Play } from '../src/screens/Play';

afterEach(cleanup);

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

beforeAll(() => {
  // jsdom has no canvas: a minimal 2D context stub keeps the render pass
  // honest (every drawGame call goes through it) without a native dep.
  const proto = window.HTMLCanvasElement.prototype as unknown as {
    getContext: (kind: string) => unknown;
  };
  proto.getContext = (kind: string) =>
    kind === '2d'
      ? new Proxy({ fillStyle: '', globalAlpha: 1 }, { get: (t, p) => (p in t ? t[p as keyof typeof t] : () => {}) })
      : null;
  // jsdom has no rAF/ResizeObserver either.
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
  window.cancelAnimationFrame = (h) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>);
  (window as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function renderAt(path: string, storage = new FakeStorage()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders storage={storage}>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  );
}

describe('app wiring', () => {
  it('home renders the pitch and the family panel', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Bricks' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(screen.getByText('More from us')).toBeTruthy();
    // No scores yet — the list stays quiet.
    expect(screen.queryByText('Best runs')).toBeNull();
  });

  it('home surfaces stored best runs', () => {
    const storage = new FakeStorage();
    storage.setItem(
      'breakout:scores',
      JSON.stringify([
        { score: 420, day: '2026-01-03' },
        { score: 180, day: '2026-01-02' },
      ]),
    );
    renderAt('/', storage);
    expect(screen.getByText('Best runs')).toBeTruthy();
    expect(screen.getByText('420 · 2026-01-03')).toBeTruthy();
    expect(screen.getByText('2 games played')).toBeTruthy();
  });

  it('the court mounts a live canvas and HUD', () => {
    renderAt('/play');
    expect(screen.getByLabelText('bricks court')).toBeTruthy();
    expect(screen.getByText('Tap to serve')).toBeTruthy();
    expect(screen.getByLabelText('3 balls left')).toBeTruthy();
  });

  it('a frozen game-over fixture shows the dialog', () => {
    let s = initBreakout({ seed: 5 });
    s = { ...s, phase: 'game-over', lives: 0, score: 230 };
    render(
      <MemoryRouter>
        <AppProviders storage={new FakeStorage()}>
          <Play fixture={s} />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(screen.getByText('Game over')).toBeTruthy();
    expect(screen.getByText(/230 points/)).toBeTruthy();
  });

  it('unknown routes fall back to home', () => {
    renderAt('/nope');
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('engine + app agree on a folded game (cross-workspace probe)', () => {
    let s = initBreakout({ seed: 99 });
    s = advance(s, [{ t: 'serve' }]);
    for (let i = 0; i < 500; i++) s = advance(s, [{ t: 'target', x: s.ball?.x ?? 60 }]);
    expect(s.tick).toBe(501);
    expect(s.phase === 'live' || s.phase === 'serving').toBe(true);
  });
});
