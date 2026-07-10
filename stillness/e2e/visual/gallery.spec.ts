// validate:visual: walk the registry × 3 viewports × 2 themes via
// @parlor/harness, with the stillness machine checks — a sit face shows a
// well-formed mm:ss and nothing overflows the viewport.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { walkGallery } from '@parlor/harness/walk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', '..', 'artifacts', 'screens');

test('gallery: every entry renders clean at every viewport and theme', async ({ page }) => {
  const { captures, failures } = await walkGallery(page, {
    outDir: OUT,
    minEntries: 5,
    settleMs: 300,
    checks: async (p, label, vp) => {
      const found: string[] = [];

      const face = p.locator('[role="timer"][aria-label="time remaining"]').first();
      if ((await face.count()) > 0) {
        const text = ((await face.textContent()) ?? '').trim();
        if (!/^\d+:\d{2}$/.test(text)) found.push(`${label}: timer face reads '${text}', expected m:ss`);

        const box = await face.boundingBox();
        if (!box || box.width <= 0 || box.height <= 0) {
          found.push(`${label}: timer face has no size`);
        } else if (box.x < -1 || box.y < -1 || box.x + box.width > vp.width + 1 || box.y + box.height > vp.height + 1) {
          found.push(`${label}: timer face overflows viewport: ${JSON.stringify(box)}`);
        }
      }
      return found;
    },
  });

  // The list the agent reviews — printed even on success.
  console.log(`\ncaptured ${captures.length} screenshots to ${OUT}`);
  expect(failures, failures.join('\n')).toEqual([]);
});
