// ported from hive/e2e/tests/smoke.spec.ts (adapted)
// T0.4 smoke: the stub shell boots cleanly and every DESIGN §7.1 route
// renders. Real flows land with their milestones.
import { expect, test } from '@playwright/test';

test('app boots with a clean console', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'LEX' })).toBeVisible();
  await page.getByRole('link', { name: /your games/i }).click();
  await expect(page.getByRole('heading', { name: /your games/i })).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('every stub route renders its screen', async ({ page }) => {
  await page.goto('/new');
  await expect(page.getByRole('heading', { name: 'New game' })).toBeVisible();

  await page.goto('/join/abc123');
  // Static build: the summary card renders with the invalid-invite copy
  // (invite lookup is full-mode only — T4.7).
  await expect(page.getByTestId('join-card')).toBeVisible();
  await expect(page.getByText(/no longer valid/i)).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await page.goto('/game/local');
  await expect(page.getByTestId('game-screen')).toBeVisible();
});

test('landing links into the hot-seat game screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /play hot-seat/i }).click();
  await expect(page.getByTestId('game-screen')).toBeVisible();
});
