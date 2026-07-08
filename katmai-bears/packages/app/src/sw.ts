/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

// Custom service worker (injectManifest). Precaches the app shell and — critically for
// the background-alert seam — handles `push` and `notificationclick`. A future VAPID
// backend posts a push payload `{ title, body, deepLink }`; tapping it deep-links
// straight to the feed's fullscreen. Live video is never cached (it can't be); offline
// just serves the shell.

// vite-plugin-pwa string-replaces the LITERAL `self.__WB_MANIFEST`, so we must keep it
// verbatim and augment the type rather than alias `self`.
declare global {
  interface Window {
    __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
  }
}

// A ServiceWorker-typed view of the same global for the SW-only APIs (lib.dom types
// `self` as a Window, so aliasing avoids the "cannot redeclare self" clash).
const sw = self as unknown as ServiceWorkerGlobalScope;

sw.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

interface PushPayload {
  title?: string;
  body?: string;
  deepLink?: string;
}

sw.addEventListener('push', (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {};
  } catch {
    payload = {};
  }
  const title = payload.title ?? '🐻 Katmai Bearcams';
  event.waitUntil(
    sw.registration.showNotification(title, {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { deepLink: payload.deepLink ?? '/' },
    }),
  );
});

sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data as { deepLink?: string } | undefined;
  const deepLink = data?.deepLink ?? '/';
  event.waitUntil(
    (async () => {
      const clients = (await sw.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })) as readonly WindowClient[];
      for (const client of clients) {
        await client.focus();
        await client.navigate(deepLink).catch(() => undefined);
        return;
      }
      await sw.clients.openWindow(deepLink);
    })(),
  );
});
