// ported from hive/e2e/multiplayer/game.spec.ts (adapted)
// T4.8 gate: the two-browser full-game e2e (DESIGN §10 M4) — create → invite
// (FR-10 summary card) → join → alternating live plays → 7-tile bingo →
// exchange (count-only) → reload-mid-game resume → resign → rematch with the
// turn order swapped → direct challenge → declined challenge. Two isolated
// browser contexts against the emulator suite; the sync assertions are the
// point: each side must see the other's actions arrive through Firestore.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { resetEmulators, rigGameByCode, signInAs } from './harness';

test.describe.configure({ mode: 'serial' });

/** Tap-place by LETTER (slot arrangement is presentation state, not fixed). */
async function placeLetter(page: Page, letter: string, cell: string) {
  await page.locator(`[data-rack-slot]:has([data-tile="${letter}"])`).first().click();
  await page.locator(`[data-cell="${cell}"]`).click();
  await expect(page.locator(`[data-cell="${cell}"] [data-tile]`)).toBeVisible();
  await page.waitForTimeout(380); // stay clear of the double-tap window
}

async function playWord(page: Page) {
  const play = page.getByRole('button', { name: /^play$/i });
  await expect(play).toBeEnabled(); // checkPlay ok + all words valid
  await play.click();
}

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

/** All seven rack slots hold real tiles (refill landed, no placeholders). */
async function rackSettled(page: Page) {
  await expect(page.locator('[data-rack-slot] [data-tile]')).toHaveCount(7, { timeout: 15_000 });
  await expect(page.getByTestId('rack-drawing')).toHaveCount(0);
}

test('two browsers play a full multiplayer game', async ({ browser }) => {
  test.setTimeout(240_000);
  await resetEmulators();

  const ada = await newPage(browser); // p0, the host — moves first
  const sam = await newPage(browser); // p1, the guest

  // ── create → invite ───────────────────────────────────────────────────────
  await signInAs(ada, 'ada@example.com');
  await ada.getByRole('link', { name: 'New game' }).click();
  await ada.getByTestId('seat-me').click(); // Ada opens (p0)
  await ada.getByTestId('create-game').click();
  const url = await ada.getByTestId('invite-url').inputValue();
  const code = url.split('/join/')[1]!;
  expect(code).toMatch(/^[A-Z2-9]{8}$/);

  // Deterministic deal (admin bypass) BEFORE anyone opens the board.
  await rigGameByCode(code);

  await ada.getByTestId('open-created-game').click();
  // No opponent yet: the board is withheld; the invite stays re-shareable
  // (link + code) right on the game screen (§8.10).
  await expect(ada.getByTestId('waiting-for-opponent')).toBeVisible();
  await expect(ada.getByTestId('invite-code')).toHaveText(code);

  // ── join (FR-10: the invitee sees the rules before accepting) ────────────
  await signInAs(sam, 'sam@example.com');
  await sam.goto(`/join/${code}`);
  await expect(sam.getByTestId('join-card')).toContainText('ada invited you');
  await expect(sam.getByTestId('join-card')).toContainText("You'll go second");
  await expect(sam.getByTestId('join-card')).toContainText('Classic board');
  await expect(sam.getByTestId('join-card')).toContainText('Everyday words');
  await sam.getByTestId('join-accept').click();
  await expect(sam.getByTestId('rack-tray')).toBeVisible({ timeout: 15_000 });
  // ada's waiting screen flips to the live board without a reload
  await expect(ada.getByTestId('rack-tray')).toBeVisible({ timeout: 15_000 });
  await expect(ada.locator('[data-testid="score-seat-0"][data-to-move="true"]')).toBeVisible();

  // ── alternating live plays ────────────────────────────────────────────────
  // Ada: CATS across the center (rack C A T S N T I).
  await placeLetter(ada, 'C', '7,7');
  await placeLetter(ada, 'A', '7,8');
  await placeLetter(ada, 'T', '7,9');
  await placeLetter(ada, 'S', '7,10');
  await playWord(ada);
  // sam sees ada's move arrive through the listener; score lands on both bars
  await expect(sam.locator('[data-cell="7,10"] [data-tile]')).toBeVisible({ timeout: 15_000 });
  await expect(sam.getByTestId('score-seat-0')).toContainText('12');
  await expect(ada.getByTestId('score-seat-0')).toContainText('12', { timeout: 15_000 });

  // Sam: REDS down to the S (rack R E D O G N U).
  await expect(sam.locator('[data-testid="score-seat-1"][data-to-move="true"]')).toBeVisible();
  await placeLetter(sam, 'R', '4,10');
  await placeLetter(sam, 'E', '5,10');
  await placeLetter(sam, 'D', '6,10');
  await playWord(sam);
  await expect(ada.locator('[data-cell="4,10"] [data-tile]')).toBeVisible({ timeout: 15_000 });

  // ── the 7-tile bingo ──────────────────────────────────────────────────────
  // Ada's refill drew S,E,R,A to join her kept N,T,I: ANTISERA down from the
  // A she played — all seven tiles leave the rack.
  await rackSettled(ada);
  await placeLetter(ada, 'N', '8,8');
  await placeLetter(ada, 'T', '9,8');
  await placeLetter(ada, 'I', '10,8');
  await placeLetter(ada, 'S', '11,8');
  await placeLetter(ada, 'E', '12,8');
  await placeLetter(ada, 'R', '13,8');
  await placeLetter(ada, 'A', '14,8');
  await playWord(ada);
  await expect(sam.locator('[data-cell="14,8"] [data-tile]')).toBeVisible({ timeout: 15_000 });

  // ── exchange: the opponent sees a count, never the letters ────────────────
  await rackSettled(sam);
  await sam.getByRole('button', { name: /^exchange$/i }).click();
  await sam.locator('[data-rack-slot="0"]').click();
  await sam.waitForTimeout(150);
  await sam.locator('[data-rack-slot="1"]').click();
  await expect(sam.getByTestId('exchange-bar')).toContainText('Exchange 2 tiles');
  await sam.getByTestId('exchange-bar').getByRole('button', { name: /^exchange$/i }).click();
  // the turn comes back to ada on both sides
  await expect(ada.locator('[data-testid="score-seat-0"][data-to-move="true"]')).toBeVisible({
    timeout: 15_000,
  });
  await expect(sam.locator('[data-testid="score-seat-0"][data-to-move="true"]')).toBeVisible();

  // ── reload-mid-game resume ────────────────────────────────────────────────
  await ada.reload();
  await expect(ada.locator('[data-cell] [data-tile]')).toHaveCount(14, { timeout: 15_000 });
  await expect(ada.getByTestId('score-seat-0')).toContainText('ada');
  await rackSettled(ada);

  // ── resign → overlay on both sides ────────────────────────────────────────
  await sam.getByRole('button', { name: /^resign$/i }).click();
  await sam.getByRole('dialog').getByRole('button', { name: /^resign$/i }).click();
  await expect(sam.getByTestId('result-overlay')).toBeVisible({ timeout: 15_000 });
  await expect(sam.getByTestId('result-overlay')).toContainText(/sam resigned/i);
  await expect(ada.getByTestId('result-overlay')).toBeVisible({ timeout: 15_000 });
  await expect(ada.getByTestId('result-overlay')).toContainText(/sam resigned/i);

  // ── rematch: both players converge on the order-swapped return game ──────
  await ada.getByRole('button', { name: /^rematch$/i }).click();
  await expect(ada.getByTestId('rack-tray')).toBeVisible({ timeout: 15_000 });
  await expect(ada.locator('[data-cell] [data-tile]')).toHaveCount(0);
  const adaUrl = ada.url();

  await sam.getByRole('button', { name: /^rematch$/i }).click();
  await expect(sam).toHaveURL(adaUrl, { timeout: 15_000 }); // idempotent: same return game
  await expect(sam.getByTestId('rack-tray')).toBeVisible({ timeout: 15_000 });

  // Turn order swapped: sam (now p0) opens the return game.
  await expect(sam.locator('[data-testid="score-seat-0"][data-to-move="true"]')).toBeVisible({
    timeout: 15_000,
  });
  await expect(sam.getByTestId('score-seat-0')).toContainText('sam');

  // both games show up in the lobby
  await ada.goto('/lobby');
  await expect(ada.getByTestId('group-waiting')).toBeVisible({ timeout: 15_000 });
  await expect(ada.getByTestId('group-finished')).toBeVisible();

  // ── direct challenge: past opponents need no code (DESIGN §6.3) ───────────
  await ada.getByRole('link', { name: 'New game' }).click();
  // sam is a past opponent, so the opponent picker offers him
  await ada.locator('[data-testid^="opponent-"]', { hasText: 'sam' }).click();
  await ada.getByTestId('seat-me').click();
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
  // Document-title badge (T5.4): the rematch game on sam's move + the
  // incoming challenge = 2 actionable.
  await expect(sam).toHaveTitle('(2) LEX', { timeout: 15_000 });
  await sam.locator('[data-testid^="challenge-accept-"]').click();
  await expect(sam.getByTestId('rack-tray')).toBeVisible({ timeout: 15_000 });
  // Leaving the lobby clears the title badge.
  await expect(sam).toHaveTitle('LEX', { timeout: 15_000 });
  // ada's waiting screen flips live; she picked first move
  await expect(ada.getByTestId('rack-tray')).toBeVisible({ timeout: 15_000 });
  await expect(ada.locator('[data-testid="score-seat-0"][data-to-move="true"]')).toBeVisible();

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
