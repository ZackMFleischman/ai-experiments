// validate:visual: walk the registry × 3 viewports × 2 themes via
// @parlor/harness, with the breakout machine checks — the court canvas
// exists, has real size, fits the viewport, and the HUD is present on play
// entries. (Canvas pixels aren't DOM-inspectable; the gates are clean
// render + geometry + the HUD's live values.)
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { walkGallery } from '@parlor/harness/walk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', '..', 'artifacts', 'screens');

test('gallery: every entry renders clean at every viewport and theme', async ({ page }) => {
  const { captures, failures } = await walkGallery(page, {
    outDir: OUT,
    minEntries: 6,
    settleMs: 300,
    checks: async (p, label, vp) => {
      const found: string[] = [];

      const court = p.locator('canvas[aria-label="bricks court"]').first();
      if ((await court.count()) > 0) {
        const box = await court.boundingBox();
        if (!box || box.width <= 0 || box.height <= 0) {
          found.push(`${label}: court canvas has no size`);
        } else if (box.x < -1 || box.y < -1 || box.x + box.width > vp.width + 1 || box.y + box.height > vp.height + 1) {
          found.push(`${label}: court overflows viewport: ${JSON.stringify(box)}`);
        }
        // The backing store was actually sized by fitCanvas (not the 300×150
        // default of an untouched canvas).
        const backing = await court.evaluate((el) => {
          const canvas = el as HTMLCanvasElement;
          return { w: canvas.width, h: canvas.height };
        });
        if (backing.w === 300 && backing.h === 150) {
          found.push(`${label}: court backing store never sized (default 300×150)`);
        }
        if ((await p.locator('[data-hud]').count()) === 0) {
          found.push(`${label}: court without HUD`);
        }
      }
      return found;
    },
  });

  // The list the agent reviews — printed even on success.
  console.log(`\ncaptured ${captures.length} screenshots to ${OUT}`);
  expect(failures, failures.join('\n')).toEqual([]);
});
