// validate:m3 (T3.13): a full hot-seat game — two scoring plays, then passes
// to the scoreless limit — driven end-to-end through the pass-device flow to
// the victory sequence, in a TAP variant and a DRAG variant, at 390×844
// against the production build (no dev-only hooks; DOM assertions only).
import { expect, test, type Page } from '@playwright/test';
import { RULESETS } from '../../packages/engine/src/index.js';
import { riggedBagOrder } from '../../packages/engine/test/helpers.js';

const P0_RACK = ['C', 'A', 'T', 'S', 'E', 'R', 'N'] as const;
const P1_RACK = ['D', 'O', 'G', 'L', 'I', 'P', 'U'] as const;
const STORED = {
  options: {
    rulesetId: 'classic',
    dictionaryId: '2of12inf',
    bagOrder: riggedBagOrder(RULESETS['classic']!, [P0_RACK, P1_RACK]),
    seats: 2,
  },
  log: [],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key!, value!),
    ['lex.hotseat.v1', JSON.stringify(STORED)] as const,
  );
  await page.goto('/game/local');
});

/** Tap through the pass-device interstitial for the named player. */
async function handoff(page: Page, player: string) {
  const overlay = page.getByTestId('pass-device');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText(player);
  await overlay.click();
  await expect(overlay).not.toBeVisible();
}

async function committedTile(page: Page, cell: string): Promise<string | null> {
  const tile = page.locator(`[data-cell="${cell}"] [data-tile]:not([data-pending])`);
  return (await tile.count()) > 0 ? tile.getAttribute('data-tile') : null;
}

async function tapPlace(page: Page, slot: number, cell: string) {
  await page.locator(`[data-rack-slot="${slot}"]`).click();
  await page.locator(`[data-cell="${cell}"]`).click();
  await expect(page.locator(`[data-cell="${cell}"] [data-tile]`)).toBeVisible();
  await page.waitForTimeout(380); // stay clear of the double-tap window
}

/** The drag ghost's center rides this far above the finger (GameBoard's
 * GHOST_LIFT) — drops land at the GHOST, so aim the finger below the cell. */
const GHOST_LIFT = 40;

async function dragPlace(page: Page, slot: number, cell: string) {
  const slotBox = (await page.locator(`[data-rack-slot="${slot}"]`).boundingBox())!;
  await page.mouse.move(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(slotBox.x + slotBox.width / 2, slotBox.y - 60, { steps: 4 });
  const cellBox = (await page.locator(`[data-cell="${cell}"]`).boundingBox())!;
  await page.mouse.move(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height / 2 + GHOST_LIFT, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(page.locator(`[data-cell="${cell}"] [data-tile]`)).toBeVisible();
}

async function playWord(page: Page) {
  const play = page.getByRole('button', { name: /^play$/i });
  await expect(play).toBeEnabled(); // checkPlay ok + all words valid
  await play.click();
}

async function passTurn(page: Page, player: string) {
  await handoff(page, player);
  await page.getByRole('button', { name: /^pass$/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(/pass your turn/i);
  await dialog.getByRole('button', { name: /^pass$/i }).click();
}

/** After both plays: pass to the scoreless limit, then verify the victory
 * sequence — beat, overlay with score story, banner after dismissal. */
async function finishAndVerify(page: Page) {
  for (let i = 0; i < 6; i++) {
    await passTurn(page, `Player ${(i % 2) + 1}`);
  }
  // Scoreless limit reached: the board beat plays first; tap skips it.
  const beat = page.getByTestId('end-beat');
  await expect(beat).toBeVisible();
  await beat.click();
  const overlay = page.getByTestId('result-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText(/Player 1 wins!/);
  await expect(overlay).toContainText(/scoreless limit/i);
  await expect(overlay).toContainText(/unplayed tiles/);
  await expect(overlay).toContainText(/8 moves/);
  // View board leaves a persistent banner that reopens the result.
  await overlay.getByRole('button', { name: /view board/i }).click();
  await expect(page.getByTestId('result-banner')).toBeVisible();
  await page.getByText(/view result/i).click();
  await expect(page.getByTestId('result-overlay')).toBeVisible();
}

test('full hot-seat game to the victory sequence — tap variant', async ({ page }) => {
  await handoff(page, 'Player 1');
  // P0: CATS across the star (tap-tap).
  await tapPlace(page, 0, '7,7');
  await tapPlace(page, 1, '7,8');
  await tapPlace(page, 2, '7,9');
  await tapPlace(page, 3, '7,10');
  await expect(page.locator('[data-testid="preview-chip"]')).toContainText('CATS');
  await playWord(page);

  // The turn flipped: Player 2's interstitial, then their rack.
  await handoff(page, 'Player 2');
  await expect(await committedTile(page, '7,7')).toBe('C');
  await expect(page.getByTestId('score-bar')).toContainText('12');
  // P1: O under the T → "TO".
  await tapPlace(page, 1, '8,9');
  await playWord(page);

  await finishAndVerify(page);
});

test('full hot-seat game to the victory sequence — drag variant', async ({ page }) => {
  await handoff(page, 'Player 1');
  await dragPlace(page, 0, '7,7');
  await dragPlace(page, 1, '7,8');
  await dragPlace(page, 2, '7,9');
  await dragPlace(page, 3, '7,10');
  await expect(page.locator('[data-testid="preview-chip"]')).toContainText('12');
  await playWord(page);

  await handoff(page, 'Player 2');
  await dragPlace(page, 1, '8,9');
  await playWord(page);

  await finishAndVerify(page);
});
