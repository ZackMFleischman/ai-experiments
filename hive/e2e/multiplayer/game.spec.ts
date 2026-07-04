// T4.8 gate: the two-browser full-game e2e (DESIGN §10 M4) — create → invite →
// join → alternating live moves → draw offer declined → reload-mid-game
// resume → resign → rematch. Two isolated browser contexts against the
// emulator suite; the sync assertions are the point: each side must see the
// other's actions arrive through Firestore.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { resetEmulators, signInAs } from './harness';

test.describe.configure({ mode: 'serial' });

async function tapCell(page: Page, key: string) {
  const ghost = page.locator(`[data-testid="ghost-${key}"]`);
  if ((await ghost.count()) > 0) {
    await ghost.click();
    return;
  }
  await page.locator(`[data-cell="${key}"]`).first().click();
}

async function place(page: Page, kind: string, cell: string) {
  await page.getByTestId(`tray-${kind}`).click();
  await tapCell(page, cell);
}

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

test('two browsers play a full multiplayer game', async ({ browser }) => {
  test.setTimeout(180_000);
  await resetEmulators();

  const ada = await newPage(browser); // white, the host
  const sam = await newPage(browser); // black, the guest

  // ── create → invite ───────────────────────────────────────────────────────
  await signInAs(ada, 'ada@example.com');
  await ada.getByRole('link', { name: 'New game' }).click();
  await ada.getByTestId('color-w').click();
  await ada.getByTestId('create-game').click();
  const url = await ada.getByTestId('invite-url').inputValue();
  const code = url.split('/join/')[1]!;
  expect(code).toMatch(/^[A-Z2-9]{8}$/);
  await ada.getByTestId('open-created-game').click();
  // No opponent yet: the board is withheld; the invite stays re-shareable
  // (link + code) right on the game screen.
  await expect(ada.getByTestId('waiting-for-opponent')).toBeVisible();
  await expect(ada.getByTestId('invite-code')).toHaveText(code);

  // ── join ──────────────────────────────────────────────────────────────────
  await signInAs(sam, 'sam@example.com');
  await sam.goto(`/join/${code}`);
  await expect(sam.getByTestId('join-card')).toContainText('ada invited you');
  await expect(sam.getByTestId('join-card')).toContainText("You'll play black");
  await sam.getByTestId('join-accept').click();
  await expect(sam.getByTestId('hand-tray')).toBeVisible();
  // ada's waiting screen flips to the live board without a reload
  await expect(ada.getByTestId('hand-tray')).toBeVisible({ timeout: 15_000 });
  await expect(ada.getByTestId('turn-chip')).toHaveText('Your turn');

  // ── alternating live moves ────────────────────────────────────────────────
  await place(ada, 'S', '0,0');
  // sam sees ada's move arrive through the listener
  await expect(sam.locator('[data-cell="0,0"]')).toBeVisible({ timeout: 15_000 });

  await place(sam, 'S', '1,0');
  await expect(ada.locator('[data-cell="1,0"]')).toBeVisible({ timeout: 15_000 });

  // off-turn: sam has no affordances while ada is to move
  await expect(sam.getByTestId('tray-Q')).toBeDisabled();

  // ── draw offer declined ───────────────────────────────────────────────────
  await ada.getByRole('button', { name: 'game menu' }).click();
  await ada.getByRole('menuitem', { name: 'Offer draw' }).click();
  await ada.getByTestId('confirm-action').click();
  // only sam gets the response dialog; declining clears it on both sides
  await expect(sam.getByTestId('draw-decline')).toBeVisible({ timeout: 15_000 });
  await sam.getByTestId('draw-decline').click();
  await expect(sam.getByTestId('draw-decline')).toHaveCount(0);

  // ── play on, then reload-mid-game resume ──────────────────────────────────
  await place(ada, 'Q', '-1,0');
  await expect(sam.locator('[data-cell="-1,0"]')).toBeVisible({ timeout: 15_000 });
  await place(sam, 'Q', '2,0');
  await expect(ada.locator('[data-cell="2,0"]')).toBeVisible({ timeout: 15_000 });

  await ada.reload();
  await expect(ada.locator('[data-cell]')).toHaveCount(4, { timeout: 15_000 });
  await expect(ada.getByTestId('player-bar-w')).toHaveAttribute('data-active', 'true');

  // ── resign → overlay on both sides ────────────────────────────────────────
  await ada.getByRole('button', { name: 'game menu' }).click();
  await ada.getByRole('menuitem', { name: 'Resign' }).click();
  await ada.getByTestId('confirm-action').click();
  await expect(ada.getByTestId('result-overlay')).toBeVisible({ timeout: 15_000 });
  await expect(ada.getByTestId('result-overlay')).toContainText('White resigned');
  await expect(sam.getByTestId('result-overlay')).toBeVisible({ timeout: 15_000 });
  await expect(sam.getByTestId('result-overlay')).toContainText('Black wins');

  // ── rematch: both players converge on the colors-swapped return game ──────
  await ada.getByTestId('overlay-rematch').click();
  await expect(ada.getByTestId('hand-tray')).toBeVisible({ timeout: 15_000 });
  await expect(ada.locator('[data-cell]')).toHaveCount(0);
  const adaUrl = ada.url();

  await sam.getByTestId('overlay-rematch').click();
  await expect(sam).toHaveURL(adaUrl, { timeout: 15_000 }); // idempotent: same return game
  await expect(sam.getByTestId('hand-tray')).toBeVisible({ timeout: 15_000 });

  // colors swapped: sam (new white) is to move and can place; ada cannot
  await expect(sam.locator('[data-testid="tray-S"]')).toBeVisible();
  await place(sam, 'S', '0,0');
  await expect(ada.locator('[data-cell="0,0"]')).toBeVisible({ timeout: 15_000 });

  // both games show up in the lobby
  await ada.goto('/lobby');
  await expect(ada.getByTestId('group-your-turn')).toBeVisible({ timeout: 15_000 });
  await expect(ada.getByTestId('group-finished')).toBeVisible();

  // ── direct challenge: past opponents need no code (DESIGN §5.3) ───────────
  await ada.getByRole('link', { name: 'New game' }).click();
  // sam is a past opponent, so the opponent picker offers him
  await ada.locator('[data-testid^="opponent-"]', { hasText: 'sam' }).click();
  await ada.getByTestId('color-w').click();
  await expect(ada.getByTestId('create-game')).toContainText('Challenge sam');
  await ada.getByTestId('create-game').click();
  // the challenger goes straight to the game: no invite code, just waiting
  await expect(ada.getByTestId('waiting-for-opponent')).toBeVisible({ timeout: 15_000 });
  await expect(ada.getByTestId('waiting-for-opponent')).toContainText('challenge is out to sam');
  await expect(ada.getByTestId('invite-code')).toHaveCount(0);

  // sam's lobby surfaces the challenge; accepting drops him into the game
  await sam.goto('/lobby');
  await expect(sam.getByTestId('group-challenges')).toBeVisible({ timeout: 15_000 });
  await expect(sam.getByTestId('group-challenges')).toContainText('ada challenges you');
  await sam.locator('[data-testid^="challenge-accept-"]').click();
  await expect(sam.getByTestId('hand-tray')).toBeVisible({ timeout: 15_000 });
  // ada's waiting screen flips live; she picked white and opens
  await expect(ada.getByTestId('hand-tray')).toBeVisible({ timeout: 15_000 });
  await place(ada, 'S', '0,0');
  await expect(sam.locator('[data-cell="0,0"]')).toBeVisible({ timeout: 15_000 });

  // ── declined challenge: the game evaporates on both sides ─────────────────
  await sam.goto('/new');
  await sam.locator('[data-testid^="opponent-"]', { hasText: 'ada' }).click();
  await sam.getByTestId('create-game').click();
  await expect(sam.getByTestId('waiting-for-opponent')).toBeVisible({ timeout: 15_000 });
  await ada.goto('/lobby');
  await expect(ada.getByTestId('group-challenges')).toBeVisible({ timeout: 15_000 });
  await ada.locator('[data-testid^="challenge-decline-"]').click();
  await expect(ada.getByTestId('group-challenges')).toHaveCount(0, { timeout: 15_000 });
  // sam's waiting screen learns the doc is gone
  await expect(sam.getByTestId('game-gone')).toBeVisible({ timeout: 15_000 });
});
