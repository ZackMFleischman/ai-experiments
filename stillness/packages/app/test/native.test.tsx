// @vitest-environment jsdom
// The utility-trio wiring under a mocked Capacitor bridge (the Phase-3a test
// discipline): keep-awake while running, the local-notification bell parked
// in the OS (and cancelled on pause/finish), success haptic + share on done —
// and all of it invisible in a plain browser (app.test.tsx covers that side).
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
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

function installBridge() {
  const plugins = {
    Haptics: { impact: vi.fn(), notification: vi.fn(), selectionChanged: vi.fn() },
    Share: { share: vi.fn().mockResolvedValue({}) },
    InAppReview: { requestReview: vi.fn() },
    StatusBar: { setStyle: vi.fn(), setBackgroundColor: vi.fn() },
    KeepAwake: { keepAwake: vi.fn(), allowSleep: vi.fn() },
    LocalNotifications: {
      requestPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
      schedule: vi.fn().mockResolvedValue({}),
      cancel: vi.fn(),
    },
  };
  (globalThis as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    Plugins: plugins,
  };
  return plugins;
}

function renderSit(storage = new FakeStorage(), route = '/sit?m=5') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppProviders storage={storage}>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  );
}

describe('native wiring (mocked bridge)', () => {
  it('running keeps the screen awake and parks the bell in the OS', async () => {
    const plugins = installBridge();
    renderSit();
    await act(async () => {});
    expect(plugins.KeepAwake.keepAwake).toHaveBeenCalled();
    expect(plugins.LocalNotifications.requestPermissions).toHaveBeenCalled();
    expect(plugins.LocalNotifications.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        notifications: [expect.objectContaining({ id: 1, title: 'Stillness' })],
      }),
    );
  });

  it('pausing releases the wake lock and cancels the parked bell', async () => {
    const plugins = installBridge();
    renderSit();
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await act(async () => {});
    expect(plugins.KeepAwake.allowSleep).toHaveBeenCalled();
    expect(plugins.LocalNotifications.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }] });
  });

  it('completion: success haptic, share available, first sit asks no review', async () => {
    vi.useFakeTimers();
    const plugins = installBridge();
    renderSit(new FakeStorage(), '/sit?m=1');
    await act(async () => {});
    act(() => void vi.advanceTimersByTime(61_000));
    await act(async () => {});
    expect(screen.getByText(/That's it\./)).toBeTruthy();
    expect(plugins.Haptics.notification).toHaveBeenCalledWith({ type: 'SUCCESS' });
    expect(plugins.InAppReview.requestReview).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(plugins.Share.share).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Stillness', url: 'https://stillness-zmf.pages.dev' }),
    );
  });

  it('asks for a review from the third sit on', async () => {
    vi.useFakeTimers();
    const plugins = installBridge();
    const storage = new FakeStorage();
    storage.setItem(
      'stillness:stats',
      JSON.stringify([
        { day: '2026-07-08', durationMs: 600000, won: true, bucket: 'sit' },
        { day: '2026-07-09', durationMs: 600000, won: true, bucket: 'sit' },
      ]),
    );
    renderSit(storage, '/sit?m=1');
    await act(async () => {});
    act(() => void vi.advanceTimersByTime(61_000));
    await act(async () => {});
    expect(plugins.InAppReview.requestReview).toHaveBeenCalledOnce();
  });
});
