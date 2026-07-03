/// <reference lib="webworker" />
// Custom service worker (T5.1/T5.2): precached app shell with SPA navigation
// fallback, plus Web Push display + tap-to-deep-link (DESIGN §7). Functions
// send data-only FCM webpush messages ({title, body, link, tag}) so this
// handler owns the exact rendering.
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
  data?: { title?: string; body?: string; link?: string; tag?: string };
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    return;
  }
  const { title, body, link, tag } = payload.data ?? {};
  if (!title) return;
  event.waitUntil(
    self.registration.showNotification(title, {
      ...(body ? { body } : {}),
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      ...(tag ? { tag } : {}),
      data: { link: link ?? '/' },
    }),
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
