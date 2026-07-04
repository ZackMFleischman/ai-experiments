// validate:visual (T3.11): walk the registry × 3 viewports × 2 themes via
// @parlor/harness, with the lex machine checks — board fits the viewport at
// fit-view, and every committed tile cell renders a letter glyph.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { walkGallery } from '@parlor/harness/walk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', '..', 'artifacts', 'screens');

test('gallery: every entry renders clean at every viewport and theme', async ({ page }) => {
  const { captures, failures } = await walkGallery(page, {
    outDir: OUT,
    minEntries: 15,
    settleMs: 300,
    checks: async (p, label, vp) => {
      const found: string[] = [];

      // Committed tiles must render a letter (blanks are designated on the
      // board); undesignated pending blanks are the one exception.
      const missingGlyphs = await p.evaluate(() =>
        [...document.querySelectorAll('[data-cell] [data-tile]')].filter(
          (el) => el.getAttribute('data-pending') !== 'true' && !(el.textContent ?? '').trim(),
        ).length,
      );
      if (missingGlyphs > 0) found.push(`${label}: ${missingGlyphs} tile cells with no letter glyph`);

      // At fit-view (all entries render view=null) the board sits inside the
      // viewport. getBoundingClientRect accounts for the CSS transform.
      const board = p.locator('[data-board]').first();
      if ((await board.count()) > 0) {
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

  // The list the agent reviews (§0.2.5) — printed even on success.
  console.log(`\ncaptured ${captures.length} screenshots to ${OUT}`);
  expect(failures, failures.join('\n')).toEqual([]);
});
