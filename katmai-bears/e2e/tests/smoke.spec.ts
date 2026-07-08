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
  // 7 cams in the catalog.
  await expect(page.locator('.tile')).toHaveCount(7);
});

test('every cam with an id autoplays on load (no tap needed)', async ({ page }) => {
  await page.goto('/');
  // Video-wall default: players mount immediately, no facades.
  await expect(page.locator('.tile__facade')).toHaveCount(0);
  // The two seeded cams mount live iframes; the rest degrade to explore.org fallbacks.
  await expect(page.locator('.player__iframe')).toHaveCount(2);
  await expect(page.locator('.player--fallback').first()).toBeVisible();
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

test('a fish-catch is recorded to the clip gallery', async ({ page }) => {
  await page.goto('/');
  // Drive a deterministic catch via the debug surface.
  await page.evaluate(() => {
    window.__katmai?.ingest({
      streamId: 'underwater',
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
