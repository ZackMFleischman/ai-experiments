import { expect, test } from '@playwright/test';

interface CatchFrame {
  streamId: string;
  ts: number;
  bearCount: number;
  boxes: Array<{ x: number; y: number; w: number; h: number; label: string; score: number }>;
  fishCatch: { id: string; confidence: number };
}
declare global {
  interface Window {
    __katmai?: { ingest: (frame: CatchFrame) => void };
  }
}

test('dashboard renders every cam tile', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Katmai Bearcams' })).toBeVisible();
  await expect(page.getByText('Brooks Falls', { exact: true })).toBeVisible();
  // 5 cams in the catalog.
  await expect(page.locator('.tile')).toHaveCount(5);
});

test('every cam autoplays on load (no tap, no facades)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tile__facade')).toHaveCount(0);
  // All five cams ship with a live id, so all mount an iframe on load.
  await expect(page.locator('.player__iframe')).toHaveCount(5);
});

test('hiding a stream removes its tile; re-enabling restores it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tile')).toHaveCount(5);

  await page.getByRole('button', { name: 'Hide Brooks Falls', exact: true }).click();
  await expect(page.locator('.tile')).toHaveCount(4);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('checkbox', { name: 'Brooks Falls', exact: true }).check();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.tile')).toHaveCount(5);
});

test('a tile can be resized bigger and smaller', async ({ page }) => {
  await page.goto('/');
  const tile = page.locator('.tile').first();
  // Size is applied as a square grid span in the tile's inline style.
  await expect(tile).toHaveAttribute('style', /span 1/);

  // Two clicks of "bigger" walk sm(1) → md(2) → lg(3), where the control disables at the max.
  await page.getByRole('button', { name: 'Make Brooks Falls bigger' }).click();
  await expect(tile).toHaveAttribute('style', /span 2/);
  await page.getByRole('button', { name: 'Make Brooks Falls bigger' }).click();
  await expect(tile).toHaveAttribute('style', /span 3/);
  await expect(page.getByRole('button', { name: 'Make Brooks Falls bigger' })).toBeDisabled();

  // "smaller" walks back down.
  await page.getByRole('button', { name: 'Make Brooks Falls smaller' }).click();
  await expect(tile).toHaveAttribute('style', /span 2/);
});

test('dragging a tile by its grip reorders the wall', async ({ page }) => {
  await page.goto('/');
  const titlesBefore = await page.locator('.tile__title').allTextContents();
  expect(titlesBefore[0]).toBe('Brooks Falls');

  // Reveal the chrome (hover on desktop; always-on for touch), then drag the first tile's
  // grip onto the adjacent tile via raw pointer events.
  await page.locator('.tile').first().hover();
  const from = await page.locator('.tile').first().locator('.tile__grip').boundingBox();
  const target = await page.locator('.tile').nth(1).boundingBox();
  if (!from || !target) throw new Error('missing bounding boxes');

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect
    .poll(async () => (await page.locator('.tile__title').allTextContents())[0])
    .not.toBe('Brooks Falls');
  expect(await page.locator('.tile__title').allTextContents()).toContain('Brooks Falls');
});

test('deep link opens fullscreen and next cycles cams', async ({ page }) => {
  await page.goto('/?stream=brooks-falls&full=1');
  const fs = page.locator('.fs');
  await expect(fs).toBeVisible();
  await expect(fs.locator('.fs__title')).toContainText('Brooks Falls');

  await fs.getByRole('button', { name: 'Next cam' }).click();
  // After advancing, the title should no longer be the first cam.
  await expect(fs.locator('.fs__title')).toContainText('Brooks Falls Low');
});

test('detection UI is hidden by default (prod flag off)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.stat')).toHaveCount(0);
  await expect(page.locator('.badge--count')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clips & Daily Reel' })).toHaveCount(0);
});

test('a fish-catch is recorded to the clip gallery', async ({ page }) => {
  // Detection is flagged off by default; ?detection=1 opts the e2e run in.
  await page.goto('/?detection=1');
  // Drive a deterministic catch via the debug surface.
  await page.evaluate(() => {
    window.__katmai?.ingest({
      streamId: 'underwater-salmon',
      ts: Date.now(),
      bearCount: 3,
      boxes: [{ x: 0.2, y: 0.3, w: 0.12, h: 0.16, label: 'bear', score: 0.9 }],
      fishCatch: { id: 'e2e-catch', confidence: 0.95 },
    });
  });

  await page.getByRole('button', { name: 'Clips & Daily Reel' }).click();
  // Recording runs ~6s; allow generous time for it to land in the gallery.
  await expect(page.locator('.clip')).toHaveCount(1, { timeout: 15_000 });
});
