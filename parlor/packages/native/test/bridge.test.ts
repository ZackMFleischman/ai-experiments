// The Phase-3a discipline under test: every wrapper no-ops cleanly in a
// plain browser (no bridge), forwards 1:1 to the bridge plugins on native,
// and swallows native failures — nothing here may ever interrupt play.
// The bridge is mocked as the injected global, exactly as a shell provides it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  allowSleep,
  callPlugin,
  cancelNotification,
  hapticImpact,
  hapticNotification,
  hapticSelection,
  isNative,
  keepAwake,
  nativePlatform,
  PARLOR_NATIVE,
  requestNotificationPermission,
  requestReview,
  scheduleNotification,
  shareContent,
  startBackgroundAudio,
  stopBackgroundAudio,
  syncStatusBar,
  usePremium,
} from '../src/index.js';

type BridgeGlobal = { Capacitor?: unknown };

function installBridge(platform: 'ios' | 'android', plugins: Record<string, unknown>): void {
  (globalThis as BridgeGlobal).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => platform,
    Plugins: plugins,
  };
}

afterEach(() => {
  delete (globalThis as BridgeGlobal).Capacitor;
});

describe('@parlor/native seed', () => {
  it('exposes the wiring probe', () => {
    expect(PARLOR_NATIVE).toEqual({ workspace: 'parlor', package: 'native' });
  });
});

describe('plain browser (no bridge)', () => {
  it('reports non-native and free', () => {
    expect(isNative()).toBe(false);
    expect(nativePlatform()).toBeNull();
    expect(usePremium()).toBe(false);
  });

  it('every wrapper resolves without touching anything', async () => {
    await expect(hapticImpact('medium')).resolves.toBeUndefined();
    await expect(hapticNotification('success')).resolves.toBeUndefined();
    await expect(hapticSelection()).resolves.toBeUndefined();
    await expect(shareContent({ title: 't' })).resolves.toBe(false);
    await expect(syncStatusBar('dark', '#000000')).resolves.toBeUndefined();
    await expect(requestReview()).resolves.toBeUndefined();
    await expect(requestNotificationPermission()).resolves.toBe(false);
    await expect(
      scheduleNotification({ id: 1, title: 't', body: 'b', at: new Date(0) }),
    ).resolves.toBe(false);
    await expect(cancelNotification(1)).resolves.toBeUndefined();
    await expect(keepAwake()).resolves.toBeUndefined();
    await expect(allowSleep()).resolves.toBeUndefined();
    await expect(startBackgroundAudio({ src: 'a.mp3' })).resolves.toBe(false);
    await expect(stopBackgroundAudio()).resolves.toBeUndefined();
  });

  it('a web-only Capacitor bridge (isNativePlatform false) stays a no-op', async () => {
    const impact = vi.fn();
    (globalThis as BridgeGlobal).Capacitor = {
      isNativePlatform: () => false,
      Plugins: { Haptics: { impact } },
    };
    await hapticImpact();
    expect(impact).not.toHaveBeenCalled();
    expect(usePremium()).toBe(false);
  });
});

describe('mocked native bridge', () => {
  it('reports native platform and premium (decision A2)', () => {
    installBridge('ios', {});
    expect(isNative()).toBe(true);
    expect(nativePlatform()).toBe('ios');
    expect(usePremium()).toBe(true);
  });

  it('forwards haptics with official option shapes', async () => {
    const impact = vi.fn();
    const notification = vi.fn();
    const selectionChanged = vi.fn();
    installBridge('ios', { Haptics: { impact, notification, selectionChanged } });
    await hapticImpact('heavy');
    await hapticImpact();
    await hapticNotification('warning');
    await hapticSelection();
    expect(impact).toHaveBeenNthCalledWith(1, { style: 'HEAVY' });
    expect(impact).toHaveBeenNthCalledWith(2, { style: 'LIGHT' });
    expect(notification).toHaveBeenCalledWith({ type: 'WARNING' });
    expect(selectionChanged).toHaveBeenCalledOnce();
  });

  it('share resolves true on success, false when the sheet is dismissed', async () => {
    const share = vi.fn().mockResolvedValue({ activityType: 'x' });
    installBridge('android', { Share: { share } });
    await expect(shareContent({ text: 'hi', url: 'https://e.g' })).resolves.toBe(true);
    expect(share).toHaveBeenCalledWith({ text: 'hi', url: 'https://e.g' });
    share.mockRejectedValueOnce(new Error('Share canceled'));
    await expect(shareContent({ text: 'hi' })).resolves.toBe(false);
  });

  it('syncStatusBar sets style everywhere, background color only on android', async () => {
    const setStyle = vi.fn();
    const setBackgroundColor = vi.fn();
    installBridge('ios', { StatusBar: { setStyle, setBackgroundColor } });
    await syncStatusBar('dark', '#111111');
    expect(setStyle).toHaveBeenCalledWith({ style: 'DARK' });
    expect(setBackgroundColor).not.toHaveBeenCalled();

    installBridge('android', { StatusBar: { setStyle, setBackgroundColor } });
    await syncStatusBar('light', '#f5f3ee');
    expect(setStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' });
    expect(setBackgroundColor).toHaveBeenCalledWith({ color: '#f5f3ee' });
  });

  it('local notifications: permission, schedule, cancel', async () => {
    const requestPermissions = vi.fn().mockResolvedValue({ display: 'granted' });
    const schedule = vi.fn().mockResolvedValue({});
    const cancel = vi.fn();
    installBridge('android', { LocalNotifications: { requestPermissions, schedule, cancel } });
    await expect(requestNotificationPermission()).resolves.toBe(true);
    const at = new Date('2026-07-11T09:00:00Z');
    await expect(scheduleNotification({ id: 7, title: 'Sit', body: 'Timer done', at })).resolves.toBe(true);
    expect(schedule).toHaveBeenCalledWith({
      notifications: [{ id: 7, title: 'Sit', body: 'Timer done', schedule: { at } }],
    });
    await cancelNotification(7);
    expect(cancel).toHaveBeenCalledWith({ notifications: [{ id: 7 }] });

    requestPermissions.mockResolvedValueOnce({ display: 'denied' });
    await expect(requestNotificationPermission()).resolves.toBe(false);
  });

  it('keep-awake, in-app review, and background audio forward', async () => {
    const kaKeepAwake = vi.fn();
    const kaAllowSleep = vi.fn();
    const review = vi.fn();
    const play = vi.fn().mockResolvedValue({});
    const stop = vi.fn();
    installBridge('ios', {
      KeepAwake: { keepAwake: kaKeepAwake, allowSleep: kaAllowSleep },
      InAppReview: { requestReview: review },
      BackgroundAudio: { play, stop },
    });
    await keepAwake();
    await allowSleep();
    await requestReview();
    await expect(startBackgroundAudio({ src: 'rain.mp3', loop: true })).resolves.toBe(true);
    await stopBackgroundAudio();
    expect(kaKeepAwake).toHaveBeenCalledOnce();
    expect(kaAllowSleep).toHaveBeenCalledOnce();
    expect(review).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith({ src: 'rain.mp3', loop: true });
    expect(stop).toHaveBeenCalledOnce();
  });

  it('a throwing plugin never propagates (containment)', async () => {
    const impact = vi.fn(() => {
      throw new Error('native blew up');
    });
    installBridge('ios', { Haptics: { impact } });
    await expect(hapticImpact()).resolves.toBeUndefined();
    await expect(callPlugin('Haptics', 'impact')).resolves.toBeNull();
  });

  it('a missing plugin on the bridge is a silent no-op', async () => {
    installBridge('ios', {});
    await expect(shareContent({ text: 'x' })).resolves.toBe(false);
    await expect(keepAwake()).resolves.toBeUndefined();
  });
});
