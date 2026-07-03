// validate:ux (T3.10): the §6.2 drag and tap flows via REAL pointer events,
// with before/during/after frames captured to artifacts/screens/ux/.
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { expect, test, type Page } from '@playwright/test';

const OUT = join(__dirname, '..', '..', 'artifacts', 'screens', 'ux');

test.beforeAll(() => {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
});

async function snapState(page: Page) {
  return page.evaluate(() => {
    const hive = (window as unknown as { __hive?: { controller: { getSnapshot(): unknown } } }).__hive;
    const s = hive?.controller.getSnapshot() as {
      selection?: unknown;
      drag?: { allowed: boolean };
      state: { board: Map<string, unknown> };
      toMove: string;
    };
    return {
      hasSelection: !!s.selection,
      dragAllowed: s.drag?.allowed ?? null,
      cells: [...s.state.board.keys()],
      toMove: s.toMove,
    };
  });
}

async function freshGame(page: Page) {
  await page.goto('/game/local');
  await page.evaluate(() => window.localStorage.clear());
  await page.getByRole('button', { name: 'game menu' }).click();
  await page.getByText('New game').click();
  await page.getByTestId('confirm-action').click();
  await expect(page.getByTestId('hand-tray')).toBeVisible();
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

/** Place a bug by tap-tap: tray → first ghost. */
async function tapPlace(page: Page, kind: string, ghostIndex = 0) {
  await page.getByTestId(`tray-${kind}`).click();
  const ghost = page.locator('[data-testid^="ghost-"]').nth(ghostIndex);
  await ghost.click();
}

async function opening(page: Page) {
  await tapPlace(page, 'S'); // wS1 at origin
  await tapPlace(page, 'S'); // bS1 somewhere adjacent
  await tapPlace(page, 'Q'); // wQ
  await tapPlace(page, 'Q'); // bQ
}

test('tap-tap move with cancel path', async ({ page }) => {
  await freshGame(page);
  await opening(page);
  await shot(page, 'tap-before');

  // Tap a movable piece: ghosts appear.
  const movable = page.locator('.hive-movable').first();
  const cellKey = await movable
    .locator('xpath=ancestor::*[@data-cell]')
    .first()
    .getAttribute('data-cell');
  await movable.click();
  expect((await snapState(page)).hasSelection).toBe(true);
  await expect(page.locator('[data-testid^="ghost-"]').first()).toBeVisible();
  await shot(page, 'tap-selected');

  // Tap elsewhere cancels.
  await page.locator('[data-testid="board-view"]').click({ position: { x: 12, y: 12 } });
  expect((await snapState(page)).hasSelection).toBe(false);
  await shot(page, 'tap-cancelled');

  // Select again and commit on a ghost.
  await page.locator(`[data-cell="${cellKey}"]`).click();
  const before = (await snapState(page)).cells;
  await page.locator('[data-testid^="ghost-"]').first().click();
  const after = await snapState(page);
  expect(after.cells).not.toEqual(before);
  await shot(page, 'tap-after-move');
});

test('drag happy path, drop-on-invalid spring-back, Esc cancel, pan/zoom mid-drag', async ({ page }) => {
  await freshGame(page);
  await opening(page);
  await shot(page, 'drag-before');

  const movable = page.locator('.hive-movable').first();
  const start = (await movable.boundingBox())!;
  const sx = start.x + start.width / 2;
  const sy = start.y + start.height / 2;

  // — happy path: press, move past the threshold, hover a ghost, drop.
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 30, sy + 30, { steps: 3 });
  expect((await snapState(page)).hasSelection).toBe(true);
  const ghost = page.locator('[data-testid^="ghost-"]').first();
  const g = (await ghost.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2, { steps: 4 });
  expect((await snapState(page)).dragAllowed).toBe(true);
  await shot(page, 'drag-over-target');
  const before = (await snapState(page)).cells;
  await page.mouse.up();
  expect((await snapState(page)).cells).not.toEqual(before);
  await shot(page, 'drag-dropped');

  // — invalid drop springs back (black's move now: use its movable piece).
  const movable2 = page.locator('.hive-movable').first();
  const b2 = (await movable2.boundingBox())!;
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + 60, b2.y + 60, { steps: 3 });
  const cellsBefore = (await snapState(page)).cells;
  await page.mouse.move(30, 500, { steps: 4 }); // far off-hive
  expect((await snapState(page)).dragAllowed).toBe(false);
  await shot(page, 'drag-over-invalid');
  await page.mouse.up();
  const s2 = await snapState(page);
  expect(s2.cells).toEqual(cellsBefore);
  expect(s2.hasSelection).toBe(false);
  await shot(page, 'drag-sprung-back');

  // — Esc cancels a drag in flight.
  const movable3 = page.locator('.hive-movable').first();
  const b3 = (await movable3.boundingBox())!;
  await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height / 2);
  await page.mouse.down();
  await page.mouse.move(b3.x + 50, b3.y + 50, { steps: 3 });
  await page.keyboard.press('Escape');
  expect((await snapState(page)).hasSelection).toBe(false);
  await page.mouse.up();

  // — pan/zoom mid-drag: wheel-zoom while holding a piece, then drop on a ghost.
  const movable4 = page.locator('.hive-movable').first();
  const b4 = (await movable4.boundingBox())!;
  await page.mouse.move(b4.x + b4.width / 2, b4.y + b4.height / 2);
  await page.mouse.down();
  await page.mouse.move(b4.x + 40, b4.y + 40, { steps: 3 });
  await page.mouse.wheel(0, -240); // zoom in mid-drag
  await page.waitForTimeout(120);
  const ghost4 = page.locator('[data-testid^="ghost-"]').first();
  const g4 = (await ghost4.boundingBox())!;
  await page.mouse.move(g4.x + g4.width / 2, g4.y + g4.height / 2, { steps: 4 });
  expect((await snapState(page)).dragAllowed).toBe(true);
  await shot(page, 'drag-mid-zoom');
  const before4 = (await snapState(page)).cells;
  await page.mouse.up();
  expect((await snapState(page)).cells).not.toEqual(before4);
});
