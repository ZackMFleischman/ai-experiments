// Hot-seat smoke: the static PWA path end to end in a real browser — land,
// reach the local game, play the opening exchange by clicking, resign, and
// confirm the outcome. No firebase anywhere on this route.
import { expect, test } from '@playwright/test';

test('hot-seat: land → play two moves → resign → outcome', async ({ page }) => {
  await page.goto('/game/local');
  const board = page.getByRole('grid', { name: 'tafl board' });
  await expect(board).toBeVisible();
  await expect(page.getByTestId('status-line')).toContainText('Attackers to move');

  // Attacker f2 → a2.
  await page.getByRole('gridcell', { name: 'f2 attacker' }).click();
  await page.getByRole('gridcell', { name: 'a2', exact: true }).click();
  await expect(page.getByTestId('status-line')).toContainText('Defenders to move');

  // Defender f4 → c4 (rank 4 is clear to the left).
  await page.getByRole('gridcell', { name: 'f4 defender' }).click();
  await page.getByRole('gridcell', { name: 'c4', exact: true }).click();
  await expect(page.getByTestId('status-line')).toContainText('Attackers to move');

  // Attackers concede.
  await page.getByRole('button', { name: 'Resign' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Resign' }).click();
  await expect(page.getByTestId('outcome')).toContainText('Defenders win');

  // A fresh game deals the initial position again.
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByTestId('status-line')).toContainText('Attackers to move');
});
