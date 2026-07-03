// Hot-seat scripted e2e (T3.10): the full all-expansions fixture game — every
// move played through the UI in tap-mode (including the pillbug toss, played by
// tapping the tossed enemy piece) — through the beat to the victory overlay.
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

async function tapCell(page: Page, key: string) {
  // Prefer ghost/climb targets when present (they overlay occupied cells).
  const climb = page.locator(`[data-testid="climb-${key}"]`);
  if ((await climb.count()) > 0) {
    await climb.click();
    return;
  }
  const ghost = page.locator(`[data-testid="ghost-${key}"]`);
  if ((await ghost.count()) > 0) {
    await ghost.click();
    return;
  }
  await page.locator(`[data-cell="${key}"]`).first().click();
}

test('a full all-expansions game plays to the victory overlay in tap-mode', async ({ page }) => {
  test.slow();
  await page.goto('/game/local');
  await page.evaluate(() => window.localStorage.clear());
  await page.getByRole('button', { name: 'game menu' }).click();
  await page.getByText('New game').click();
  await page.getByTestId('confirm-action').click();
  await expect(page.getByTestId('hand-tray')).toBeVisible();

  let state: GameState = initialState(OPTIONS);
  for (const uhp of MOVES) {
    const move = parseUhp(uhp, state);
    if (move.type === 'place') {
      await page.getByTestId(`tray-${move.tile.kind}`).click();
      await tapCell(page, `${move.to.q},${move.to.r}`);
    } else if (move.type === 'move' || move.type === 'toss') {
      // Tap the piece that MOVES (for tosses that is the tossed piece — enemy
      // pieces are selectable exactly when tossable), then its destination.
      await tapCell(page, `${move.from.q},${move.from.r}`);
      await tapCell(page, `${move.to.q},${move.to.r}`);
    }
    state = applyMove(state, move);
    // The board reflects the move before the next ply begins.
    await expect(page.locator(`[data-cell="${cellOf(move)}"]`)).toBeVisible();
  }

  // Final move surrounds the black queen: beat first (pulse), then the overlay.
  await expect(page.getByTestId('result-overlay')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId('result-overlay')).toContainText('Queen surrounded!');
  await expect(page.getByTestId('result-overlay')).toContainText('White wins');
  await expect(page.getByTestId('result-overlay')).toContainText('27 moves');
});

function cellOf(move: { type: string; to?: { q: number; r: number } }): string {
  return move.to ? `${move.to.q},${move.to.r}` : '0,0';
}

test('refresh mid-game resumes the hot-seat game (T3.11)', async ({ page }) => {
  await page.goto('/game/local');
  await page.evaluate(() => window.localStorage.clear());
  await page.getByRole('button', { name: 'game menu' }).click();
  await page.getByText('New game').click();
  await page.getByTestId('confirm-action').click();

  let state: GameState = initialState(OPTIONS);
  for (const uhp of MOVES.slice(0, 6)) {
    const move = parseUhp(uhp, state);
    if (move.type === 'place') {
      await page.getByTestId(`tray-${move.tile.kind}`).click();
      await tapCell(page, `${move.to.q},${move.to.r}`);
    }
    state = applyMove(state, move);
  }
  await expect(page.locator('[data-cell]')).toHaveCount(6);

  await page.reload();
  await expect(page.locator('[data-cell]')).toHaveCount(6, { timeout: 10_000 });
  await expect(page.getByTestId('player-bar-w')).toHaveAttribute('data-active', 'true');

  // "New game" clears the stored game.
  await page.getByRole('button', { name: 'game menu' }).click();
  await page.getByText('New game').click();
  await page.getByTestId('confirm-action').click();
  await page.reload();
  await expect(page.locator('[data-cell]')).toHaveCount(0);
});
