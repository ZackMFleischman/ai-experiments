// T7.17 gate: the three-browser room e2e (DESIGN §10 M7) — create a 4-seat
// room → one guest arrives by LINK, another by CODE → the host starts EARLY
// with the fourth seat empty → a full three-seat game → a withdrawal mid-game
// → the standings podium. `game.spec.ts` is untouched: the two-seat path is
// preserved, not migrated, so it keeps its own unedited proof.
//
// The load-bearing assertion is the last one. Sam bingoes, leads by a mile,
// and walks out; the podium still places him BELOW everyone who finished
// (DECISIONS 2026-08-28). That rule is what stops "resign while ahead" being
// the winning move, and this is the only test that proves it travels all the
// way from the engine through Firestore to the screen.
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { resetEmulators, rigStartedRoom, signInAs } from './harness';

test.describe.configure({ mode: 'serial' });

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

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

/** Whose turn it is, as every seat's player bar reports it. */
async function expectToMove(pages: readonly Page[], seat: number) {
  for (const page of pages) {
    await expect(page.locator(`[data-testid="score-seat-${seat}"][data-to-move="true"]`)).toBeVisible({
      timeout: 15_000,
    });
  }
}

/** Leave a running 3+ game through the overflow menu. At three seats this is a
 * WITHDRAWAL, not a resignation: the game carries on without you. */
async function withdraw(page: Page) {
  await page.getByTestId('more-actions').click();
  await page.getByTestId('resign-action').click();
  // The confirm's CTA is "Withdraw" at 3+ and "Resign" at two — the menu item
  // and the dialog both rename themselves off the seat count.
  await page.getByRole('dialog').getByRole('button', { name: /^withdraw$/i }).click();
}

/** A rendered score, minus sign and all. The player bar shows a queue numeral
 * and the podium an adjustment line, so this reads the score ELEMENT rather
 * than fishing a number out of a row's text. */
async function scoreOf(cell: Locator): Promise<number> {
  const text = (await cell.textContent()) ?? '';
  const match = /^\s*(−|-)?\d+\s*$/.exec(text);
  if (!match) throw new Error(`not a score: ${JSON.stringify(text)}`);
  return Number(text.trim().replace('−', '-'));
}

test('three browsers fill a room, start early, play, and rank a walkout last', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  await resetEmulators();

  const ada = await newPage(browser); // host, p0
  const sam = await newPage(browser); // joins by LINK, p1
  const noor = await newPage(browser); // joins by CODE, p2
  const all = [ada, sam, noor];

  // ── the host opens a room for four ────────────────────────────────────────
  await signInAs(ada, 'ada@example.com');
  await ada.getByRole('link', { name: 'New game' }).click();
  await ada.getByTestId('count-4').click();
  // Four seats and no reservation: the room is the game, so create drops the
  // host straight into it rather than through a separate invite step.
  await ada.getByTestId('create-game').click();
  await expect(ada.getByTestId('game-room')).toBeVisible({ timeout: 15_000 });
  await expect(ada.getByTestId('seats-filled')).toContainText('1 of 4');
  await expect(ada.getByTestId('host-badge')).toBeVisible();

  const url = await ada.getByTestId('invite-url').inputValue();
  const code = url.split('/join/')[1]!;
  expect(code).toMatch(/^[A-Z2-9]{8}$/);

  // The host cannot start alone: classic seats two at the minimum.
  await expect(ada.getByTestId('start-game')).toBeDisabled();
  await expect(ada.getByTestId('start-hint')).toContainText('1 more player needed');

  // ── guest one arrives by LINK ─────────────────────────────────────────────
  await signInAs(sam, 'sam@example.com');
  await sam.goto(`/join/${code}`);
  // The room preview, not the two-seat card: no seat to promise, just a roster.
  await expect(sam.getByTestId('join-roster')).toContainText('ada is in');
  await expect(sam.getByTestId('join-seats')).toContainText('1 of 4 seats filled — 3 seats left');
  await expect(sam.getByTestId('join-card')).toContainText('Classic board');
  await sam.getByTestId('join-accept').click();
  await expect(sam.getByTestId('game-room')).toBeVisible({ timeout: 15_000 });
  // The host's room fills live, with no reload.
  await expect(ada.getByTestId('seats-filled')).toContainText('2 of 4', { timeout: 15_000 });
  await expect(ada.getByTestId('start-game')).toBeEnabled();

  // ── guest two arrives by CODE ─────────────────────────────────────────────
  await signInAs(noor, 'noor@example.com');
  await noor.getByTestId('join-by-code').click();
  await noor.getByTestId('join-code-input').fill(code);
  await noor.getByTestId('join-code-go').click();
  await expect(noor.getByTestId('join-seats')).toContainText('2 of 4 seats filled', {
    timeout: 15_000,
  });
  await noor.getByTestId('join-accept').click();
  await expect(noor.getByTestId('game-room')).toBeVisible({ timeout: 15_000 });
  await expect(ada.getByTestId('seats-filled')).toContainText('3 of 4', { timeout: 15_000 });

  // Only the host gets the start bar; a guest gets a way out instead.
  await expect(sam.getByTestId('start-game')).toHaveCount(0);
  await expect(sam.getByTestId('leave-room')).toBeVisible();

  // ── the host pins the order, then starts EARLY ────────────────────────────
  // 'first' rather than 'random': the rest of this test needs to know who is
  // in which seat, and the room is where that is decided.
  await ada.getByTestId('order-mode-first').click();
  await expect(ada.getByTestId('order-first-picker')).toBeVisible();
  await ada.locator('[data-testid^="first-"]', { hasText: 'ada' }).click();

  await ada.getByTestId('start-game').click();
  // Starting with a seat still open is a confirmation, not a silent trim.
  await expect(ada.getByTestId('start-early-title')).toContainText('Start with 3 of 4?');
  await expect(ada.getByTestId('start-early-seats')).toContainText('The last seat stays empty.');
  await ada.getByTestId('start-early-confirm').click();

  // Everyone lands on a live board — the guests' racks are dealt at start.
  for (const page of all) {
    await expect(page.getByTestId('rack-tray')).toBeVisible({ timeout: 20_000 });
  }
  const gameId = ada.url().split('/game/')[1]!;

  // Deterministic deal (admin bypass). A room is only dealt at start, so this
  // lands on a running game; reload so no page renders a discarded rack.
  await rigStartedRoom(gameId);
  for (const page of all) {
    await page.reload();
    await expect(page.locator('[data-rack-slot] [data-tile]')).toHaveCount(7, { timeout: 20_000 });
  }

  // Three seats, numbered 1..3 in turn order, ada to move.
  await expect(ada.getByTestId('score-seat-2')).toBeVisible();
  await expect(ada.getByTestId('score-seat-3')).toHaveCount(0);
  await expectToMove(all, 0);

  // ── a round at three seats ────────────────────────────────────────────────
  // Ada: CATS across the centre (rack C A T S N T I) — a modest opening.
  await placeLetter(ada, 'C', '7,7');
  await placeLetter(ada, 'A', '7,8');
  await placeLetter(ada, 'T', '7,9');
  await placeLetter(ada, 'S', '7,10');
  await playWord(ada);
  // The move reaches BOTH other browsers, not just the next player's.
  await expect(sam.locator('[data-cell="7,10"] [data-tile]')).toBeVisible({ timeout: 15_000 });
  await expect(noor.locator('[data-cell="7,10"] [data-tile]')).toBeVisible({ timeout: 15_000 });
  await expect(noor.getByTestId('score-seat-0')).toContainText('12');
  await expectToMove(all, 1);

  // Sam: ANTISERA down from ada's A — all seven tiles, so a bingo.
  await placeLetter(sam, 'N', '8,8');
  await placeLetter(sam, 'T', '9,8');
  await placeLetter(sam, 'I', '10,8');
  await placeLetter(sam, 'S', '11,8');
  await placeLetter(sam, 'E', '12,8');
  await placeLetter(sam, 'R', '13,8');
  await placeLetter(sam, 'A', '14,8');
  await playWord(sam);
  await expect(ada.locator('[data-cell="14,8"] [data-tile]')).toBeVisible({ timeout: 15_000 });
  await expectToMove(all, 2);

  const samLead = await scoreOf(ada.getByTestId('score-value-1'));
  const adaOpening = await scoreOf(ada.getByTestId('score-value-0'));
  expect(samLead).toBeGreaterThan(adaOpening); // he is ahead when he walks out

  // Noor: ABLE along the bottom off sam's last A (rack B L E M P H O).
  await placeLetter(noor, 'B', '14,9');
  await placeLetter(noor, 'L', '14,10');
  await placeLetter(noor, 'E', '14,11');
  await playWord(noor);
  await expect(ada.locator('[data-cell="14,11"] [data-tile]')).toBeVisible({ timeout: 15_000 });
  await expectToMove(all, 0);

  // ── the withdrawal: the game does NOT end ─────────────────────────────────
  await withdraw(sam);
  // Nobody sees a result overlay — at three seats a departure is a withdrawal.
  for (const page of all) {
    await expect(page.getByTestId('score-seat-1')).toContainText('out', { timeout: 15_000 });
    await expect(page.getByTestId('result-overlay')).toHaveCount(0);
  }
  // Sam watches the rest out: nothing to play, and no second withdrawal on
  // offer. The other two carry on with live boards.
  await expect(sam.getByRole('button', { name: /^play$/i })).toBeDisabled();
  // Nothing behind the ⋯ either: with no turn to take and no seat left to
  // give up, the whole overflow switches off rather than offering a second
  // withdrawal that only the server would refuse.
  await expect(sam.getByTestId('more-actions')).toBeDisabled();
  await expect(ada.getByTestId('rack-tray')).toBeVisible();
  await expect(noor.getByTestId('rack-tray')).toBeVisible();

  // The turn order closes over the empty seat: ada → NOOR, never back to sam.
  await ada.getByRole('button', { name: 'Pass' }).click();
  await ada.getByRole('dialog').getByRole('button', { name: /^pass$/i }).click();
  await expectToMove([ada, noor], 2);
  await expect(ada.locator('[data-testid="score-seat-1"][data-to-move="true"]')).toHaveCount(0);

  // ── last player standing ends it ──────────────────────────────────────────
  await withdraw(noor);
  for (const page of all) {
    await expect(page.getByTestId('result-overlay')).toBeVisible({ timeout: 20_000 });
  }
  await expect(ada.getByTestId('result-overlay')).toContainText(/last player standing/i);

  // ── the podium: a walkout ranks below everyone who finished ───────────────
  const podium = ada.getByTestId('final-standings');
  await expect(podium.getByTestId('result-placing-0')).toHaveText('1st');
  await expect(podium.getByTestId('result-withdrawn-1')).toBeVisible();
  await expect(podium.getByTestId('result-withdrawn-2')).toBeVisible();

  // Sam's frozen score is still the biggest on the board — and he is not first.
  const adaFinal = await scoreOf(podium.getByTestId('result-score-0'));
  const samFinal = await scoreOf(podium.getByTestId('result-score-1'));
  expect(samFinal).toBeGreaterThan(adaFinal);
  expect(await podium.getByTestId('result-placing-1').textContent()).not.toBe('1st');
  await expect(podium.getByTestId('result-withdrawn-note-1')).toContainText(
    'placed below everyone who finished',
  );

  // Rows render in placing order, so the winner is the first one down.
  const order = await podium.locator('[data-testid^="result-seat-"]').evaluateAll((rows) =>
    rows.map((row) => row.getAttribute('data-testid')),
  );
  expect(order[0]).toBe('result-seat-0');

  // ── the table shows up as one game in every lobby ─────────────────────────
  for (const page of all) {
    await page.goto('/lobby');
    const finished = page.getByTestId('group-finished');
    await expect(finished).toBeVisible({ timeout: 15_000 });
    // The card reads by PLACING, so every seat is accounted for on one line.
    await expect(finished).toContainText('1st');
    await expect(finished).toContainText('3rd');
  }
  // And the card says the same thing the podium did: ada is first on 12 with
  // sam's frozen 60 behind her.
  await expect(ada.getByTestId('group-finished')).toContainText('1st You 12');
  await expect(ada.getByTestId('group-finished')).toContainText('2nd sam 60');
  await expect(ada.getByTestId('result-chip')).toHaveText('Won');

  // ── the other way in: a direct invitation ─────────────────────────────────
  // Sam and Noor are past opponents now, so the second room can ASK rather
  // than share a code. This is the half of the model a code cannot show:
  // an invitation is an ask, and it holds nothing.
  await ada.getByRole('link', { name: 'New game' }).click();
  await ada.getByTestId('count-3').click();
  await ada.getByTestId('create-game').click();
  await expect(ada.getByTestId('game-room')).toBeVisible({ timeout: 15_000 });
  const second = ada.url().split('/game/')[1]!;

  // Scoped to the picker: its wrapper's testid shares the `room-invite-`
  // prefix with the chips inside it.
  await ada.getByTestId('room-invite-friends').getByRole('button', { name: 'noor' }).click();
  await expect(ada.getByTestId('guest-list')).toContainText("Hasn't answered yet", {
    timeout: 15_000,
  });
  await expect(ada.getByTestId('guest-list')).toContainText('noor');
  await expect(ada.getByTestId('no-reservation-note')).toBeVisible();
  // Asking somebody does not fill their seat.
  await expect(ada.getByTestId('seats-filled')).toContainText('1 of 3');

  await noor.goto(`/game/${second}`);
  await expect(noor.getByTestId('invitation-received')).toBeVisible({ timeout: 15_000 });
  await expect(noor.getByTestId('invitation-seats')).toContainText('3');
  await noor.getByTestId('invitation-accept').click();
  await expect(noor.getByTestId('game-room')).toBeVisible({ timeout: 15_000 });
  await expect(ada.getByTestId('seats-filled')).toContainText('2 of 3', { timeout: 15_000 });
});
