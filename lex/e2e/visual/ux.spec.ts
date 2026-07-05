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

test.beforeEach(async ({ page }) => {
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
