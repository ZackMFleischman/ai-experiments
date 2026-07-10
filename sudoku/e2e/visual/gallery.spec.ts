// validate:visual: walk the registry × 3 viewports × 2 themes via
// @parlor/harness, with the sudoku machine checks — the board renders all 81
// cells and fits the viewport, and every given cell shows its digit.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { walkGallery } from '@parlor/harness/walk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', '..', 'artifacts', 'screens');

test('gallery: every entry renders clean at every viewport and theme', async ({ page }) => {
  const { captures, failures } = await walkGallery(page, {
    outDir: OUT,
    minEntries: 8,
    settleMs: 300,
    checks: async (p, label, vp) => {
      const found: string[] = [];

      const board = p.locator('[role="grid"][aria-label="sudoku board"]').first();
      if ((await board.count()) > 0) {
        // All 81 cells present, and no filled cell missing its glyph (a cell
        // is filled iff its aria-label carries a digit suffix).
        const { cells, missing } = await p.evaluate(() => {
          const cellEls = [...document.querySelectorAll('[role="gridcell"]')];
          return {
            cells: cellEls.length,
            missing: cellEls.filter((el) => {
              // Filled cells are labelled "rNcN <digit>"; empty ones just "rNcN".
              const labelled = /\s\d$/.test(el.getAttribute('aria-label') ?? '');
              return labelled && !(el.textContent ?? '').trim();
            }).length,
          };
        });
        if (cells !== 81) found.push(`${label}: board has ${cells} cells, expected 81`);
        if (missing > 0) found.push(`${label}: ${missing} filled cells with no digit glyph`);

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
