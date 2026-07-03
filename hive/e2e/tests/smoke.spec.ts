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

test('piece guide opens from the game screen and names every piece', async ({ page }) => {
  await page.goto('/game/local');
  await page.getByRole('button', { name: /piece guide/i }).click();
  const dialog = page.getByRole('dialog');
  // exact: the rules summary at the bottom also mentions the Queen Bee
  await expect(dialog.getByText('Queen Bee', { exact: true })).toBeVisible();
  for (const name of ['Ant', 'Spider', 'Grasshopper', 'Beetle', 'Mosquito', 'Ladybug', 'Pillbug']) {
    await expect(dialog.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(dialog.locator('use').first()).toBeVisible(); // glyphs resolve
  await expect(dialog.getByTestId('rules-summary')).toBeVisible(); // the rest of the rules
  await dialog.getByRole('button', { name: /close/i }).click();
  await expect(dialog).not.toBeVisible();
});

test('bear mode reskins the pieces and survives a reload', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('checkbox', { name: /bear mode/i }).check();
  await page.goto('/game/local');
  await expect(page.locator('use[href="#bear-ant"]').first()).toBeVisible();
  await expect(page.locator('use[href="#bug-ant"]')).toHaveCount(0);
  // the guide teaches the mapping
  await page.getByRole('button', { name: /piece guide/i }).click();
  await expect(page.getByRole('dialog').getByText(/Brown bear/)).toBeVisible();
  await page.getByRole('button', { name: /close/i }).click();
  // persisted
  await page.reload();
  await expect(page.locator('use[href="#bear-ant"]').first()).toBeVisible();
  // and off again
  await page.goto('/settings');
  await page.getByRole('checkbox', { name: /bear mode/i }).uncheck();
  await page.goto('/game/local');
  await expect(page.locator('use[href="#bug-ant"]').first()).toBeVisible();
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
