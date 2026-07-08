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
  // 6 cams in the catalog.
  await expect(page.locator('.tile')).toHaveCount(6);
});

test('every cam autoplays on load (no tap, no facades)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tile__facade')).toHaveCount(0);
  // All six cams ship with a live id, so all mount an iframe on load.
  await expect(page.locator('.player__iframe')).toHaveCount(6);
});

test('hiding a stream removes its tile; re-enabling restores it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tile')).toHaveCount(6);

  await page.getByRole('button', { name: 'Hide Brooks Falls', exact: true }).click();
  await expect(page.locator('.tile')).toHaveCount(5);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('checkbox', { name: 'Brooks Falls', exact: true }).check();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.tile')).toHaveCount(6);
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
