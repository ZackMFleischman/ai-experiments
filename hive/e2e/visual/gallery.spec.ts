// validate:visual (T3.10): walk the registry × 3 viewports × 2 themes,
// screenshot each entry, and machine-check console cleanliness, sprite <use>
// resolution (non-empty bbox) and board-fits-viewport. One navigation per
// entry × theme; viewports resize in place (the layouts are responsive).
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', '..', 'artifacts', 'screens');
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'phone', width: 390, height: 844 },
] as const;
const THEMES = ['light', 'dark'] as const;

test('gallery: every entry renders clean at every viewport and theme', async ({ page }) => {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  // Discover the registry from the gallery index.
  await page.goto('/dev/gallery');
  await page.waitForSelector('[data-entry-id]', { timeout: 30_000 });
  const ids = await page.locator('[data-gallery-index] [data-entry-id]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-entry-id') as string),
  );
  expect(ids.length).toBeGreaterThan(10);

  const failures: string[] = [];
  const captures: string[] = [];
  let label = '';

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      failures.push(`${label}: console.${msg.type()}: ${msg.text().slice(0, 160)}`);
    }
  });
  page.on('pageerror', (err) => failures.push(`${label}: pageerror: ${String(err).slice(0, 160)}`));

  for (const id of ids) {
    for (const theme of THEMES) {
      label = `${id}--${theme}`;
      await page.goto(`/dev/gallery?entry=${id}&static=1&theme=${theme}`);
      await page.waitForTimeout(220);

      for (const vp of VIEWPORTS) {
        label = `${id}--${vp.name}--${theme}`;
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForTimeout(90);

        // Every sprite reference must resolve to something drawable.
        const badUses = await page.evaluate(() =>
          [...document.querySelectorAll('use')].filter((u) => {
            const b = (u as SVGGraphicsElement).getBBox();
            return b.width === 0 || b.height === 0;
          }).length,
        );
        if (badUses > 0) failures.push(`${label}: ${badUses} <use> refs with empty bbox`);

        // Auto-fit boards must sit inside the viewport.
        const board = page.locator('[data-testid="board-view"]').first();
        if ((await board.count()) > 0) {
          const box = await board.boundingBox();
          if (!box || box.width <= 0 || box.height <= 0) failures.push(`${label}: board has no size`);
          else if (box.x < -1 || box.y < -1 || box.x + box.width > vp.width + 1) {
            failures.push(`${label}: board overflows viewport: ${JSON.stringify(box)}`);
          }
        }

        const path = join(OUT, `${label}.png`);
        await page.screenshot({ path, fullPage: false });
        captures.push(path);
      }
    }
  }

  // The list the agent reviews (§0.2.5) — printed even on success.
  console.log(`\ncaptured ${captures.length} screenshots to ${OUT}`);
  expect(failures, failures.join('\n')).toEqual([]);
});
