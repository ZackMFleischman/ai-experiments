import { useSettings } from '../state/settings';

// In-tab / installed-PWA notifications now; the service worker (src/sw.ts) also wires
// `push` + `notificationclick`, so a VAPID backend can deliver these when the app is
// fully closed with no client change. Real 24/7 background delivery lands with the
// backend detector — both need the server — but the click→deep-link→fullscreen path
// is fully working today via local notifications.

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined';
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}

/** A feed's fullscreen deep link — the target of a Bearapalooza notification tap. */
export function fullscreenDeepLink(streamId: string): string {
  return `${import.meta.env.BASE_URL}?stream=${encodeURIComponent(streamId)}&full=1`;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

interface ShowOpts {
  body: string;
  tag: string;
  deepLink: string;
}

async function show(title: string, { body, tag, deepLink }: ShowOpts): Promise<void> {
  if (!useSettings.getState().notificationsEnabled) return;
  if (!notificationsSupported() || Notification.permission !== 'granted') return;

  const reg = await registration();
  if (reg) {
    await reg.showNotification(title, {
      body,
      tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { deepLink },
    });
    return;
  }
  const n = new Notification(title, { body, tag, icon: '/icons/icon-192.png', data: { deepLink } });
  n.onclick = () => {
    window.focus();
    location.assign(deepLink);
    n.close();
  };
}

export function notifyBearAlert(streamId: string, title: string, count: number, threshold: number): Promise<void> {
  return show(`${count} bears on ${title}`, {
    body: `That's over your alert line of ${threshold}. Tap to watch.`,
    tag: `alert-${streamId}`,
    deepLink: fullscreenDeepLink(streamId),
  });
}

export function notifyBearapalooza(streamId: string, title: string, count: number): Promise<void> {
  return show(`🐻 BEARAPALOOZA on ${title}!`, {
    body: `${count} bears on screen at once. This is not a drill. Tap for fullscreen.`,
    tag: `bearapalooza-${streamId}`,
    deepLink: fullscreenDeepLink(streamId),
  });
}
