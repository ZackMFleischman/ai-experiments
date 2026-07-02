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
