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

      // At fit-view (all entries render view=null) the GAME board sits inside
      // the viewport. getBoundingClientRect accounts for the CSS transform.
      // MiniBoard reuses the real renderer for lobby thumbnails and the board
      // picker's premium-map preview, so those carry data-board too — they are
      // decorative, have no fit-view, and may legitimately scroll out of a tall
      // form, so they are excluded rather than the assertion loosened.
      const box = await p.evaluate(() => {
        const el = [...document.querySelectorAll('[data-board]')].find(
          (b) => !b.closest('[data-decorative]'),
        );
        return el ? { ...el.getBoundingClientRect().toJSON() } : null;
      });
      if (box) {
        if (box.width <= 0 || box.height <= 0) {
          found.push(`${label}: board has no size`);
        } else if (box.x < -1 || box.y < -1 || box.x + box.width > vp.width + 1 || box.y + box.height > vp.height + 1) {
          found.push(`${label}: board overflows viewport: ${JSON.stringify(box)}`);
        }
      }

      // No score floater may sit on a letter — the whole point of T3.7's
      // rework. The preview card must additionally stay fully on screen (its
      // per-word chip ancestors managed neither). One evaluate, not a
      // boundingBox round-trip per tile: this runs on all 264 captures.
      const floaters = await p.evaluate(() => {
        const box = (el: Element) => el.getBoundingClientRect();
        const hits = (a: DOMRect, b: DOMRect) =>
          a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const covers = (el: Element | null, selector: string): boolean =>
          el !== null &&
          [...document.querySelectorAll(selector)].some((t) => hits(box(el), box(t)));
        const card = document.querySelector('[data-testid="preview-card"]');
        return {
          badgeCoversTile: covers(
            document.querySelector('[data-testid="last-play-score"]'),
            '[data-cell] [data-tile]',
          ),
          cardCoversStaged: covers(card, '[data-cell] [data-pending="true"]'),
          cardBox: card ? { ...box(card).toJSON() } : null,
        };
      });
      if (floaters.badgeCoversTile) found.push(`${label}: last-play badge covers a tile`);
      if (floaters.cardCoversStaged) found.push(`${label}: preview card covers a staged tile`);
      const cb = floaters.cardBox;
      if (cb && (cb.x < -1 || cb.y < -1 || cb.x + cb.width > vp.width + 1 || cb.y + cb.height > vp.height + 1)) {
        found.push(`${label}: preview card off screen: ${JSON.stringify(cb)}`);
      }
      return found;
    },
  });

  // The list the agent reviews (§0.2.5) — printed even on success.
  console.log(`\ncaptured ${captures.length} screenshots to ${OUT}`);
  expect(failures, failures.join('\n')).toEqual([]);
});
