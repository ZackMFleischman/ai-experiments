// The same full all-expansions fixture game, played entirely by DRAG (T3.10):
// tray drags for placements, board drags for moves and tosses.
import { expect, test, type Page } from '@playwright/test';
import { applyMove, initialState, parseUhp } from '@hive/engine';
import type { GameOptions, GameState } from '@hive/engine';

const OPTIONS: GameOptions = { mosquito: true, ladybug: true, pillbug: true, tournamentOpening: true };

const MOVES = [
  'wS1', 'bS1 wS1-', 'wQ -wS1', 'bQ bS1-', 'wP -wQ', 'bA1 bQ-', 'wL \\wQ',
  'bG1 bA1-', 'wM \\wS1', 'bG2 bG1-', 'wL \\bS1', 'bG3 bG2-', 'wM bS1\\',
  'bB1 bG3-', 'wL \\bQ', 'bB1 bG3', 'wG1 \\wP', 'bB1 \\bG3', 'wG1 -wP',
  'bB1 bG3', 'wA1 \\wP', 'bB1 \\bG3', 'wA1 \\bA1', 'bB1 bG3', 'wA2 \\wP',
  'bB1 \\bG3', 'wA2 bQ\\',
];

async function center(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function targetPoint(page: Page, key: string): Promise<{ x: number; y: number }> {
  // Ghosts/badges appear as soon as the piece is picked up.
  await page
    .locator(`[data-testid="climb-${key}"], [data-testid="ghost-${key}"]`)
    .first()
    .waitFor({ timeout: 5_000 });
  for (const sel of [`[data-testid="climb-${key}"]`, `[data-testid="ghost-${key}"]`]) {
    if ((await page.locator(sel).count()) > 0) return center(page, sel);
  }
  return center(page, `[data-cell="${key}"]`);
}

test('a full all-expansions game plays to the victory overlay by DRAG', async ({ page }) => {
  test.slow();
  await page.goto('/game/local');
  await page.evaluate(() => window.localStorage.clear());
  await page.getByRole('button', { name: 'game menu' }).click();
  await page.getByText('New game').click();
  await page.getByTestId('confirm-action').click();
  await expect(page.getByTestId('hand-tray')).toBeVisible();
  // Raw mouse events don't auto-wait: let the confirm dialog's backdrop finish
  // fading out before the first pointerdown.
  await expect(page.locator('.MuiModal-root')).toHaveCount(0);

  let state: GameState = initialState(OPTIONS);
  for (const uhp of MOVES) {
    console.log('ply:', uhp);
    const move = parseUhp(uhp, state);
    if (move.type === 'place') {
      // Drag from the tray onto the target ghost.
      const from = await center(page, `[data-testid="tray-${move.tile.kind}"]`);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x, from.y - 60, { steps: 3 }); // lift toward the board
      const to = await targetPoint(page, `${move.to.q},${move.to.r}`);
      await page.mouse.move(to.x, to.y, { steps: 4 });
      await page.mouse.up();
    } else if (move.type === 'move' || move.type === 'toss') {
      const from = await center(page, `[data-cell="${move.from.q},${move.from.r}"]`);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + 25, from.y + 25, { steps: 3 }); // past the threshold
      const to = await targetPoint(page, `${move.to.q},${move.to.r}`);
      await page.mouse.move(to.x, to.y, { steps: 4 });
      await page.mouse.up();
    }
    state = applyMove(state, move);
    await expect(page.locator(`[data-cell="${move.type === 'pass' ? '0,0' : `${(move as { to: { q: number } }).to.q},${(move as { to: { r: number } }).to.r}`}"]`)).toBeVisible();
  }

  await expect(page.getByTestId('result-overlay')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId('result-overlay')).toContainText('Queen surrounded!');
});
