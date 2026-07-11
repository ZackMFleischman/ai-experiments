// Hot-seat smoke: the static PWA path end to end in a real browser — land,
// reach the local game, play the opening exchange by clicking, resign, and
// confirm the outcome. No firebase anywhere on this route.
import { expect, test } from '@playwright/test';

test('hot-seat: land → play two moves → resign → outcome', async ({ page }) => {
  await page.goto('/game/local');
  const board = page.getByRole('grid', { name: 'checkers board' });
  await expect(board).toBeVisible();
  await expect(page.getByTestId('status-line')).toContainText('Dark to move');

  // Dark man b3 → a4.
  await page.getByRole('gridcell', { name: 'b3 dark man' }).click();
  await page.getByRole('gridcell', { name: 'a4', exact: true }).click();
  await expect(page.getByTestId('status-line')).toContainText('Light to move');

  // Light man a6 → b5.
  await page.getByRole('gridcell', { name: 'a6 light man' }).click();
  await page.getByRole('gridcell', { name: 'b5', exact: true }).click();
  await expect(page.getByTestId('status-line')).toContainText('Dark to move');

  // Dark concedes.
  await page.getByRole('button', { name: 'Resign' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Resign' }).click();
  await expect(page.getByTestId('outcome')).toContainText('Light wins');

  // A fresh game deals the initial position again.
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByTestId('status-line')).toContainText('Dark to move');
});
