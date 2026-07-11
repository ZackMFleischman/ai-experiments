// validate:visual: walk the registry × 3 viewports × 2 themes via
// @parlor/harness, with the checkers machine checks — every board renders all
// 49 squares and fits the viewport.
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
    settleMs: 350,
    checks: async (p, label, vp) => {
      const found: string[] = [];
      const board = p.locator('[role="grid"][aria-label="checkers board"]').first();
      if ((await board.count()) > 0) {
        const cells = await p.locator('[role="gridcell"]').count();
        if (cells !== 49) found.push(`${label}: board has ${cells} cells, expected 49`);
        const box = await board.boundingBox();
        if (!box || box.width <= 0 || box.height <= 0) {
          found.push(`${label}: board has no size`);
        } else if (box.x < -1 || box.y < -1 || box.x + box.width > vp.width + 1 || box.y + box.height > vp.height + 1) {
          found.push(`${label}: board overflows viewport: ${JSON.stringify(box)}`);
        }
      }
      return found;
    },
  });

  // The list the agent reviews — printed even on success.
  console.log(`\ncaptured ${captures.length} screenshots to ${OUT}`);
  expect(failures, failures.join('\n')).toEqual([]);
});
