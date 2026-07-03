import { expect, test } from '@playwright/test';

test('app boots with a clean console', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'HIVE' })).toBeVisible();
  await page.getByRole('link', { name: 'Play' }).click();
  await expect(page.getByRole('heading', { name: /your games/i })).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('new game and settings screens can be exited back to the lobby', async ({ page }) => {
  await page.goto('/lobby');
  await page.getByRole('link', { name: 'New game' }).click();
  await expect(page.getByRole('heading', { name: 'New game' })).toBeVisible();
  await page.getByRole('link', { name: /back to lobby/i }).click();
  await expect(page.getByRole('heading', { name: /your games/i })).toBeVisible();

  await page.goto('/settings');
  await page.getByRole('link', { name: /back to lobby/i }).click();
  await expect(page.getByRole('heading', { name: /your games/i })).toBeVisible();
});

// Regression: the landing hero draws tiles via <use href="#bug-*">, so the
// sprite sheet must be in the document on every route — not just the game
// screen. Without it the hero renders bare hexes and the stacked tile reads
// as a misaligned duplicate.
test('sprite sheet is mounted on the landing route', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('landing-hero')).toBeVisible();
  await expect(page.locator('svg #bug-queen')).toHaveCount(1);
});
