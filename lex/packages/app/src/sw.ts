/// <reference lib="webworker" />
// ported from hive/packages/app/src/sw.ts (adapted)
// Custom service worker (T5.1, DESIGN §8): precached app shell (dictionaries
// included) with SPA navigation fallback, plus Web Push display +
// tap-to-deep-link. Functions send data-only FCM webpush messages
// ({title, body, link, tag, badge}) so this handler owns the exact rendering,
// and every open client gets a push-sync postMessage — the push proves
// something changed even when a Firestore stream has silently died (§8.6).
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

interface PushPayload {
  data?: { title?: string; body?: string; link?: string; tag?: string; badge?: string };
}

/** Icon badge (Badging API): iOS 16.4+ badges installed PWAs from the SW, so
 * the count updates even while the app is closed. Functions send the fresh
 * actionable count with every push — apply it verbatim, clear on zero. */
function applyIconBadge(badge: string | undefined): void {
  const count = Number(badge);
  if (badge === undefined || !Number.isFinite(count)) return;
  const nav = self.navigator as WorkerNavigator & {
    setAppBadge?: (n: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) void nav.setAppBadge?.(count).catch(() => {});
  else void nav.clearAppBadge?.().catch(() => {});
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    return;
  }
  const { title, body, link, tag, badge } = payload.data ?? {};
  if (!title) return;
  event.waitUntil(
    (async () => {
      applyIconBadge(badge);
      const target = link ?? '/';
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Every open client gets the sync signal — the push proves something
      // changed even when a Firestore stream has silently died (mobile Safari).
      for (const win of wins) win.postMessage({ type: 'push-sync', link: target });
      // Already looking at that screen? No banner — the board updates instead.
      const pathname = new URL(target, self.location.origin).pathname;
      const watching = wins.some(
        (win) => win.visibilityState === 'visible' && new URL(win.url).pathname === pathname,
      );
      if (watching) return;
      await self.registration.showNotification(title, {
        ...(body ? { body } : {}),
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        ...(tag ? { tag } : {}),
        data: { link: target },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data as { link?: string } | undefined)?.link ?? '/';
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          await client.navigate(link);
          return;
        }
      }
      await self.clients.openWindow(link);
    })(),
  );
});
