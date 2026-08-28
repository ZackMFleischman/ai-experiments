// validate:m3: the hot-seat SETUP flow against the real production build —
// starting a game from the form and confirming the chosen invalid-words rule
// actually reaches the board.
//
// This is the flow a PR preview exercises: a preview deploys the static
// hot-seat build alone, so before this screen existed the per-game options
// (board, dictionary, invalid words) could not be reached there at all.
//
// Deliberately no rigged bag: the point is the REAL path, form to board, with
// a genuinely shuffled deal. That means the rack is unknown, so the assertions
// are the ones that hold for any two tiles — the verdict column is withheld
// and Play is live — rather than anything about specific letters.
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // No stored game: /game/local must offer the setup form, not a board.
  // Cleared ONCE via evaluate rather than addInitScript — an init script runs
  // on every navigation, including the reload one of these tests performs,
  // which would wipe the very game it is checking survives.
  await page.goto('/');
  await page.evaluate((key) => window.localStorage.removeItem(key), 'lex.hotseat.v1');
  await page.goto('/game/local');
});

async function revealRack(page: Page) {
  const overlay = page.getByTestId('pass-device');
  await expect(overlay).toBeVisible();
  await overlay.click();
  await expect(overlay).not.toBeVisible();
}

/** The rack slots holding a designated letter, skipping any blank. A blank
 * opens the letter-picker instead of placing, and a staged-but-undesignated
 * blank suppresses the preview card entirely (`needsBlank`) — so with a really
 * shuffled deal, reaching for slots 0 and 1 flakes whenever one of the two
 * blanks lands there. Which it did, once, before this. */
async function letteredSlots(page: Page): Promise<number[]> {
  const slots = page.locator('[data-rack-slot]');
  const out: number[] = [];
  for (let i = 0; i < (await slots.count()); i++) {
    const slot = slots.nth(i);
    const tile = slot.locator('[data-tile]');
    if ((await tile.count()) === 0) continue;
    if ((await tile.getAttribute('data-blank')) === 'true') continue;
    out.push(Number(await slot.getAttribute('data-rack-slot')));
  }
  return out;
}

/** Two tiles across the star — a legal first play whatever the deal gave us. */
async function stageTwo(page: Page) {
  const [first, second] = await letteredSlots(page);
  expect(first).toBeDefined();
  expect(second).toBeDefined();
  await page.locator(`[data-rack-slot="${first}"]`).click();
  await page.locator('[data-cell="7,7"]').click();
  await expect(page.locator('[data-cell="7,7"] [data-tile]')).toBeVisible();
  await page.waitForTimeout(380); // clear of the double-tap window
  await page.locator(`[data-rack-slot="${second}"]`).click();
  await page.locator('[data-cell="7,8"]').click();
  await expect(page.locator('[data-cell="7,8"] [data-tile]')).toBeVisible();
}

test('with nothing stored, the hot-seat entry point is the setup form', async ({ page }) => {
  await expect(page.getByTestId('hotseat-setup')).toBeVisible();
  await expect(page.getByTestId('game-board')).toHaveCount(0);
  // One device: no turn-order or clock sections to mislead anyone.
  await expect(page.getByTestId('seat-random')).toHaveCount(0);
  await expect(page.getByTestId('time-3d')).toHaveCount(0);
  // …and nothing to go back to, so no escape hatch is offered.
  await expect(page.getByTestId('setup-cancel')).toHaveCount(0);
});

test('"cost your turn" reaches the board: the preview withholds its verdict', async ({ page }) => {
  await page.getByTestId('invalid-words-costs-turn').click();
  await page.getByTestId('dictionary-2of12inf').click();
  await page.getByTestId('start-hotseat').click();

  await expect(page.getByTestId('game-board')).toBeVisible();
  await revealRack(page);
  await stageTwo(page);

  // The setting is live: no verdict on the word, and Play is enabled anyway.
  const word = page.getByTestId('preview-word').first();
  await expect(word).toHaveAttribute('data-valid', 'unknown');
  // Nothing stands in for the verdict: no tick, no cross, no placeholder.
  await expect(word).not.toContainText('✓');
  await expect(word).not.toContainText('✗');
  await expect(word).not.toContainText('—');
  // Scoped to the action row: the preview card's drag grip is also a `button`
  // whose accessible name contains "play".
  await expect(page.getByTestId('game-actions').getByRole('button', { name: 'Play' })).toBeEnabled();

  // The game menu restates the rule that was chosen.
  await page.getByTestId('game-info').click();
  await expect(page.getByTestId('info-invalid-words')).toContainText(/cost your turn/i);
});

test('the default rule still blocks: same flow, verdicts shown', async ({ page }) => {
  // Left on "Can't be played" — the control for the test above.
  await page.getByTestId('start-hotseat').click();

  await expect(page.getByTestId('game-board')).toBeVisible();
  await revealRack(page);
  await stageTwo(page);

  // Whatever two tiles came up, the card commits to a verdict either way —
  // and draws it.
  const word = page.getByTestId('preview-word').first();
  await expect(word).toHaveAttribute('data-valid', /^(true|false)$/);
  await expect(word).toContainText(/[✓✗]/);
});

test('a started game resumes on reload rather than re-asking', async ({ page }) => {
  await page.getByTestId('invalid-words-costs-turn').click();
  await page.getByTestId('start-hotseat').click();
  await expect(page.getByTestId('game-board')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('game-board')).toBeVisible();
  await expect(page.getByTestId('hotseat-setup')).toHaveCount(0);

  // A resume puts the privacy screen back up (§7.3) — it covers the chrome
  // too, so it has to be dismissed before the info button is reachable.
  await revealRack(page);

  // The rule survived the reload with the game.
  await page.getByTestId('game-info').click();
  await expect(page.getByTestId('info-invalid-words')).toContainText(/cost your turn/i);
});
