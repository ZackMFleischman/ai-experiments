// @vitest-environment jsdom
// The Apple-4.2 wiring under a mocked Capacitor bridge (the Phase-3a test
// discipline): a serve haptic, success haptic + throttled review ask on game
// over, share from the game-over dialog — and all of it invisible in a plain
// browser.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { KeyValueStorage } from '@parlor/arcade';
import { initBreakout } from '@breakout/engine';
import { AppProviders } from '../src/App';
import { Play } from '../src/screens/Play';

afterEach(() => {
  cleanup();
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
});

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
  const proto = window.HTMLCanvasElement.prototype as unknown as {
    getContext: (kind: string) => unknown;
  };
  proto.getContext = (kind: string) =>
    kind === '2d'
      ? new Proxy({ fillStyle: '', globalAlpha: 1 }, { get: (t, p) => (p in t ? t[p as keyof typeof t] : () => {}) })
      : null;
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
  window.cancelAnimationFrame = (h) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>);
  (window as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

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

function renderGameOver(storage: FakeStorage) {
  // A frozen game-over fixture drives the dialog without playing a game.
  const s = { ...initBreakout({ seed: 5 }), phase: 'game-over' as const, lives: 0, score: 120 };
  return render(
    <MemoryRouter>
      <AppProviders storage={storage}>
        <Play fixture={s} />
      </AppProviders>
    </MemoryRouter>,
  );
}

describe('native wiring (mocked bridge)', () => {
  it('serving fires a launch haptic from the live loop', async () => {
    const plugins = installBridge();
    render(
      <MemoryRouter>
        <AppProviders storage={new FakeStorage()}>
          <Play />
        </AppProviders>
      </MemoryRouter>,
    );
    fireEvent.pointerDown(screen.getByLabelText('bricks court'));
    await waitFor(() => expect(plugins.Haptics.impact).toHaveBeenCalled(), { timeout: 3000 });
  });

  it('share works from the game-over dialog on a device', async () => {
    const plugins = installBridge();
    renderGameOver(new FakeStorage());
    const share = await screen.findByRole('button', { name: 'Share' });
    fireEvent.click(share);
    await waitFor(() => expect(plugins.Share.share).toHaveBeenCalled());
    const call = plugins.Share.share.mock.calls[0]?.[0] as { text: string };
    expect(call.text).toContain('120');
  });

  it('the status bar syncs to the color mode on a device', async () => {
    const plugins = installBridge();
    renderGameOver(new FakeStorage());
    await waitFor(() => expect(plugins.StatusBar.setStyle).toHaveBeenCalled());
  });

  it('a plain browser shows none of it', () => {
    renderGameOver(new FakeStorage());
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });
});
