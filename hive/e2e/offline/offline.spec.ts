// T5.1 gate: installable PWA + offline app shell. Against a real production
// build: manifest reachable, service worker activates, and after going
// offline the app shell still serves — with the lobby rendering the cached
// game read-only (Firestore persistent cache).
import { expect, test, type Page } from '@playwright/test';

const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const PROJECT = 'demo-hive';

async function resetEmulators(): Promise<void> {
  for (const url of [
    `${AUTH}/emulator/v1/projects/${PROJECT}/accounts`,
    `${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
  ]) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`emulator reset failed: ${url} → ${res.status}`);
  }
}

async function signInAs(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByTestId('test-email').fill(email);
  await page.getByTestId('test-sign-in').click();
  await expect(page.getByRole('heading', { level: 1, name: /your games/i })).toBeVisible();
}

test('manifest + service worker + offline shell with cached lobby', async ({ page, context }) => {
  await resetEmulators();

  // installability surface
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.status()).toBe(200);
  const m = (await manifest.json()) as { name: string; icons: unknown[]; display: string };
  expect(m.name).toBe('HIVE');
  expect(m.display).toBe('standalone');
  expect(m.icons.length).toBeGreaterThanOrEqual(3);
  expect((await page.request.get('/icons/badge-72.png')).status()).toBe(200);

  // sign in, create a game so the lobby has content to cache
  await signInAs(page, 'ada@example.com');
  await page.getByRole('link', { name: 'New game' }).click();
  await page.getByTestId('create-game').click();
  await expect(page.getByTestId('invite-link-view')).toBeVisible();
  await page.goto('/lobby');
  await expect(page.getByTestId('group-waiting')).toBeVisible();

  // service worker controls the page
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, undefined, {
    timeout: 30_000,
  });

  // go offline: reload still serves the shell, lobby shows the cached game
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /your games/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('group-waiting')).toBeVisible({ timeout: 20_000 });

  await context.setOffline(false);
});
