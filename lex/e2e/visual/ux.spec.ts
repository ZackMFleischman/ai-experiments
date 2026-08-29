// validate:ux (T3.11, §4.2): the DESIGN §7.2 flows via REAL pointer events —
// drag place, drop-off-board return, recall, tap-tap place + cancel, blank
// designation, exchange select/confirm, pan/zoom mid-placement — asserting
// controller state (window.__lex) and capturing before/during/after frames.
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { RULESETS } from '../../packages/engine/src/index.js';
import { riggedBagOrder } from '../../packages/engine/test/helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', '..', 'artifacts', 'screens', 'ux');

// Rigged hot-seat game: known racks, real dictionary. Blank at slot 4.
const P0_RACK = ['C', 'A', 'T', 'S', '?', 'E', 'R'] as const;
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

test.beforeAll(() => {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
});

// The catch-up player needs a table of three or four, which the hot-seat route
// cannot deal — those tests drive the gallery's four-handed entry instead and
// skip this two-seat setup.
const TABLE_SUITE = 'catch-up review (four seats)';

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.titlePath.includes(TABLE_SUITE)) return;
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key!, value!),
    ['lex.hotseat.v1', JSON.stringify(STORED)] as const,
  );
  await page.goto('/game/local');
  await page.getByTestId('pass-device').click(); // reveal Player 1's rack
  await expect(page.getByTestId('rack-tray')).toBeVisible();
});

interface Snap {
  pending: string[];
  selection: number | null;
  exchange: number[] | null;
  toMove: number;
  moveCount: number;
  rack: (string | null)[];
  zoom: number | null;
}

async function snap(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    const lex = (window as unknown as { __lex?: { controller: { getSnapshot(): unknown } } }).__lex;
    const s = lex?.controller.getSnapshot() as {
      pending: Map<string, unknown>;
      selection: number | null;
      exchange: Set<number> | null;
      toMove: number;
      state: { moveCount: number };
      rack: (string | null)[];
      view: { zoom: number } | null;
    };
    return {
      pending: [...s.pending.keys()],
      selection: s.selection,
      exchange: s.exchange ? [...s.exchange] : null,
      toMove: s.toMove,
      moveCount: s.state.moveCount,
      rack: [...s.rack],
      zoom: s.view?.zoom ?? null,
    };
  });
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

async function center(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drag a rack tile to a target board cell with raw pointer movements —
 * drops land at the cell under the finger (the ghost snaps into it), so the
 * finger aims straight at the cell center. */
async function dragRackTile(page: Page, slot: number, cell: string) {
  const from = await center(page, `[data-rack-slot="${slot}"]`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 4, from.y - 60, { steps: 4 }); // leave the tray
  const to = await center(page, `[data-cell="${cell}"]`);
  await page.mouse.move(to.x, to.y, { steps: 6 });
  return to;
}

test('drag place happy path + drop-off-board return', async ({ page }) => {
  await shot(page, 'drag-before');
  await dragRackTile(page, 0, '7,7');
  await shot(page, 'drag-over-board');
  await page.mouse.up();
  let s = await snap(page);
  expect(s.pending).toEqual(['7,7']);
  expect(s.rack[0]).toBeNull();
  await shot(page, 'drag-placed');

  // Off-board drop: pick up another tile, release above the board.
  const from = await center(page, '[data-rack-slot="1"]');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 60, { steps: 4 });
  const viewport = await page.locator('[data-testid="board-viewport"]').boundingBox();
  await page.mouse.move(viewport!.x + 8, viewport!.y + 8, { steps: 4 });
  await page.mouse.up();
  s = await snap(page);
  expect(s.pending).toEqual(['7,7']); // unchanged
  expect(s.rack[1]).toBe('A'); // still racked
  await shot(page, 'drag-offboard-returned');
});

test('tap-tap place, cancel, bounce-back, recall', async ({ page }) => {
  // Arm slot 0, tap a cell: placed.
  await page.locator('[data-rack-slot="0"]').click();
  expect((await snap(page)).selection).toBe(0);
  await shot(page, 'taptap-armed');
  await page.locator('[data-cell="7,7"]').click();
  let s = await snap(page);
  expect(s.pending).toEqual(['7,7']);
  expect(s.selection).toBeNull();
  await shot(page, 'taptap-placed');

  // Arm again, tap the board background: cancelled.
  await page.waitForTimeout(400); // stay out of the double-tap window
  await page.locator('[data-rack-slot="1"]').click();
  expect((await snap(page)).selection).toBe(1);
  const viewport = await page.locator('[data-testid="board-viewport"]').boundingBox();
  await page.mouse.click(viewport!.x + 8, viewport!.y + 8);
  expect((await snap(page)).selection).toBeNull();

  // Tap the staged tile: bounces home.
  await page.waitForTimeout(400);
  await page.locator('[data-cell="7,7"] [data-pending="true"]').click();
  s = await snap(page);
  expect(s.pending).toEqual([]);
  expect(s.rack[0]).toBe('C');

  // Stage two and recall.
  await page.waitForTimeout(400);
  await page.locator('[data-rack-slot="0"]').click();
  await page.locator('[data-cell="7,7"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-rack-slot="1"]').click();
  await page.locator('[data-cell="7,8"]').click();
  expect((await snap(page)).pending).toHaveLength(2);
  await page.getByRole('button', { name: /^recall$/i }).click();
  s = await snap(page);
  expect(s.pending).toEqual([]);
  expect(s.rack.filter(Boolean)).toHaveLength(7);
  await shot(page, 'taptap-recalled');
});

test('blank designation via the picker sheet', async ({ page }) => {
  await page.locator('[data-rack-slot="4"]').click(); // the blank
  await page.locator('[data-cell="7,7"]').click();
  await expect(page.getByTestId('blank-picker')).toBeVisible();
  await shot(page, 'blank-picker-open');
  await page.getByTestId('blank-picker').getByRole('button', { name: 'S', exact: true }).click();
  const s = await snap(page);
  expect(s.pending).toEqual(['7,7']);
  const letter = await page
    .locator('[data-cell="7,7"] [data-tile]')
    .getAttribute('data-tile');
  expect(letter).toBe('S');
  await shot(page, 'blank-designated');
});

test('exchange: select, confirm bar, costs the turn', async ({ page }) => {
  await page.getByRole('button', { name: /exchange/i }).click();
  expect((await snap(page)).exchange).toEqual([]);
  await page.locator('[data-rack-slot="0"]').click();
  await page.waitForTimeout(150);
  await page.locator('[data-rack-slot="1"]').click();
  expect((await snap(page)).exchange).toEqual([0, 1]);
  await expect(page.getByTestId('exchange-bar')).toContainText('Exchange 2 tiles');
  await shot(page, 'exchange-selected');
  await page.getByTestId('exchange-bar').getByRole('button', { name: /^exchange$/i }).click();
  // Turn passed to Player 2: the pass-device interstitial covers the racks.
  await expect(page.getByTestId('pass-device')).toBeVisible();
  await shot(page, 'exchange-handoff');
  await page.getByTestId('pass-device').click();
  const s = await snap(page);
  expect(s.moveCount).toBe(1);
  expect(s.toMove).toBe(1);
});

test('pan/zoom mid-placement never invalidates the hit-test', async ({ page }) => {
  await page.locator('[data-rack-slot="0"]').click();
  await page.locator('[data-cell="7,7"]').click();
  expect((await snap(page)).pending).toEqual(['7,7']);

  // Wheel-zoom in over the board, then pan a bit.
  const viewport = await page.locator('[data-testid="board-viewport"]').boundingBox();
  const cx = viewport!.x + viewport!.width / 2;
  const cy = viewport!.y + viewport!.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -400);
  await page.mouse.wheel(0, -400);
  expect((await snap(page)).zoom).toBeGreaterThan(1);
  // Pan from a point clear of the staged tile — a press on a pending tile
  // (rightly) starts a tile drag, not a pan.
  await page.mouse.move(cx + 90, cy + 90);
  await page.mouse.down();
  await page.mouse.move(cx + 30, cy + 50, { steps: 5 });
  await page.mouse.up();
  await shot(page, 'zoomed-mid-placement');

  // Drop the next tile on the (transformed) neighbour cell — still exact.
  await dragRackTile(page, 1, '7,8');
  await page.mouse.up();
  const s = await snap(page);
  expect(s.pending.sort()).toEqual(['7,7', '7,8']);
  await shot(page, 'zoomed-drop-exact');
});

test('the last-play score expands into the words that made it', async ({ page }) => {
  const place = async (slot: number, cell: string) => {
    await page.locator(`[data-rack-slot="${slot}"]`).click();
    await page.locator(`[data-cell="${cell}"]`).click();
    await page.waitForTimeout(400); // stay out of the double-tap window
  };
  // Tap-tap the whole word: with a tile armed the preview card's grip must be
  // inert, or the tap meant for the cell under it never lands.
  await place(0, '7,7');
  await place(1, '7,8');
  await place(2, '7,9');
  await place(3, '7,10');
  expect((await snap(page)).pending).toHaveLength(4);
  await page.getByRole('button', { name: /^play$/i }).click();
  await page.getByTestId('pass-device').click();

  const badge = page.getByTestId('last-play-score');
  await expect(badge).toBeVisible();
  await page.waitForTimeout(500); // let the tile animate-in settle
  await shot(page, 'last-play-badge');
  await badge.click();
  const panel = page.getByTestId('last-play-breakdown');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('CATS');
  // Playwright counts an element mid-transition as visible, so the capture
  // needs the Grow (and the last-play tile animate-in) to finish first.
  await page.waitForTimeout(500);
  await shot(page, 'last-play-breakdown');
  await expect(panel).toContainText('12');
});

// The badge parks in an EMPTY cell, which is not the same as out of the way —
// beside a tight word it can still sit over the square you want to read, and
// staging a tile used to be its only exit. Only a real browser can show that
// the badge's own tap is not also a board tap (it stops the gesture there).
test('a board tap tucks the last-play score away; another brings it back', async ({ page }) => {
  const place = async (slot: number, cell: string) => {
    await page.locator(`[data-rack-slot="${slot}"]`).click();
    await page.locator(`[data-cell="${cell}"]`).click();
    await page.waitForTimeout(400); // stay out of the double-tap window
  };
  await place(0, '7,7');
  await place(1, '7,8');
  await place(2, '7,9');
  await place(3, '7,10');
  await page.getByRole('button', { name: /^play$/i }).click();
  await page.getByTestId('pass-device').click();

  const badge = page.getByTestId('last-play-score');
  await expect(badge).toBeVisible();
  await page.waitForTimeout(500); // let the tile animate-in settle

  // Tapping the badge opens its breakdown — that gesture must never also
  // count as the board tap that hides it.
  await badge.click();
  await expect(page.getByTestId('last-play-breakdown')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('last-play-breakdown')).toBeHidden();
  await expect(badge).toBeVisible();

  await page.waitForTimeout(400);
  await page.locator('[data-cell="0,0"]').click();
  await expect(badge).toBeHidden();
  // Only the number steps aside: the play stays highlighted.
  expect(await page.locator('[data-last-play]').count()).toBe(4);
  await shot(page, 'last-play-tucked');

  await page.waitForTimeout(400);
  await page.locator('[data-cell="14,14"]').click();
  await expect(badge).toBeVisible();
});

test('the preview card can be dragged by its grip (real pointer capture)', async ({ page }) => {
  // TWO tiles: one is "Two tiles minimum", a transient hint, and hints carry
  // no grip on purpose.
  await page.locator('[data-rack-slot="0"]').click();
  await page.locator('[data-cell="7,7"]').click();
  await page.waitForTimeout(400); // stay out of the double-tap window
  await page.locator('[data-rack-slot="1"]').click();
  await page.locator('[data-cell="7,8"]').click();
  const card = page.getByTestId('preview-card');
  await expect(card).toBeVisible();
  const before = (await card.boundingBox())!;

  // jsdom has no pointer capture, so this drag is only ever exercised here:
  // if the viewport steals the gesture the board pans and the card sits still.
  const grip = (await page.getByTestId('preview-grip').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 40, grip.y + 120, { steps: 8 });
  await page.mouse.up();

  const after = (await card.boundingBox())!;
  expect(Math.round(after.y - before.y)).toBeGreaterThan(60);
  await expect(card).toHaveAttribute('data-manual', 'true');
  await shot(page, 'preview-card-parked');
});

test.describe(TABLE_SUITE, () => {
  // Real pointers on the real bar: the board must actually rewind (later
  // tiles gone) and come back, and the turn must stay takeable throughout.
  test('stepping back rewinds the board; Live brings it back', async ({ page }) => {
    await page.goto('/dev/gallery?entry=catch-up-live&static=1');
    const bar = page.getByTestId('catch-up-bar');
    await expect(bar).toContainText('Kai played');
    const tiles = () => page.locator('[data-cell] [data-tile]').count();
    const live = await tiles();
    expect(live).toBeGreaterThan(0);
    await shot(page, 'catch-up-live');

    await page.getByTestId('catch-up-prev').click();
    await expect(bar).toContainText('Noor played');
    await expect(bar).toContainText('2 of 3');
    // Kai's two tiles are not on the board as of Noor's move — and Noor's
    // play wears the last-play highlight.
    expect(await tiles()).toBe(live - 2);
    expect(await page.locator('[data-last-play]').count()).toBe(3);
    // Reviewing never takes the turn away.
    await expect(page.getByRole('button', { name: /^pass$/i })).toBeEnabled();
    await shot(page, 'catch-up-rewound');

    await page.getByTestId('catch-up-live').click();
    expect(await tiles()).toBe(live);
    await expect(page.getByTestId('catch-up-live')).toBeDisabled();
  });
});
