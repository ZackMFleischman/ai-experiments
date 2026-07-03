// T4.1 gate: auth against the emulator suite — sign-in, route guard, session
// persistence, sign-out.
import { expect, test } from '@playwright/test';
import { resetEmulators, signInAs } from './harness';

test.beforeEach(async () => {
  await resetEmulators();
});

test('test-account sign-in lands in the lobby with the user identity', async ({ page }) => {
  await signInAs(page, 'ada@example.com');
  await expect(page.getByTestId('lobby-user')).toContainText('ada');
});

test('signed-out visitors are redirected from /lobby to the sign-in landing', async ({ page }) => {
  await page.goto('/lobby');
  await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
});

test('the session survives a reload', async ({ page }) => {
  await signInAs(page, 'ada@example.com');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /your games/i })).toBeVisible();
});

test('sign-out returns to the landing screen', async ({ page }) => {
  await signInAs(page, 'ada@example.com');
  await page.getByTestId('sign-out').click();
  await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible();
});

test('the hot-seat game stays reachable signed out', async ({ page }) => {
  await page.goto('/game/local');
  await expect(page.getByTestId('hand-tray')).toBeVisible();
});
