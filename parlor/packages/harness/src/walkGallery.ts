// ported from hive/e2e/visual/gallery.spec.ts (adapted, genericized)
// The validate:visual core: walk the gallery registry × viewports × themes,
// screenshot every combination, and collect machine-check failures (console
// errors/warnings + game-injected per-capture checks). The caller asserts
// the failure list is empty; the review pass is the agent READING the
// captures afterwards.
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

export interface Viewport {
  name: string;
  width: number;
  height: number;
}

export const DEFAULT_VIEWPORTS: readonly Viewport[] = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'phone', width: 390, height: 844 },
];

export interface WalkGalleryOptions {
  /** Where screenshots land (created if missing). */
  outDir: string;
  galleryPath?: string; // default '/dev/gallery'
  viewports?: readonly Viewport[];
  themes?: readonly ('light' | 'dark')[];
  /** Sanity floor: fail if the registry has fewer entries than this. */
  minEntries?: number;
  /** ms to let an entry settle after navigation / resize. */
  settleMs?: number;
  /** Game-specific per-capture checks; return failure strings. */
  checks?: (page: Page, label: string, viewport: Viewport) => Promise<string[]>;
}

export interface WalkGalleryResult {
  captures: string[];
  failures: string[];
}

export async function walkGallery(page: Page, options: WalkGalleryOptions): Promise<WalkGalleryResult> {
  const {
    outDir,
    galleryPath = '/dev/gallery',
    viewports = DEFAULT_VIEWPORTS,
    themes = ['light', 'dark'],
    minEntries = 1,
    settleMs = 250,
    checks,
  } = options;

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  await page.goto(galleryPath);
  await page.waitForSelector('[data-entry-id]', { timeout: 30_000 });
  const ids = await page
    .locator('[data-gallery-index] [data-entry-id]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-entry-id') as string));

  const failures: string[] = [];
  const captures: string[] = [];
  if (ids.length < minEntries) {
    failures.push(`registry has ${ids.length} entries — expected at least ${minEntries}`);
  }

  let label = '';
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      failures.push(`${label}: console.${msg.type()}: ${msg.text().slice(0, 160)}`);
    }
  });
  page.on('pageerror', (err) => failures.push(`${label}: pageerror: ${String(err).slice(0, 160)}`));

  for (const id of ids) {
    for (const theme of themes) {
      label = `${id}--${theme}`;
      await page.goto(`${galleryPath}?entry=${id}&static=1&theme=${theme}`);
      await page.waitForSelector('[data-gallery-entry]', { timeout: 15_000 });
      await page.waitForTimeout(settleMs);

      for (const vp of viewports) {
        label = `${id}--${vp.name}--${theme}`;
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForTimeout(Math.max(60, settleMs / 3));

        if (checks) failures.push(...(await checks(page, label, vp)));

        const path = join(outDir, `${label}.png`);
        await page.screenshot({ path, fullPage: false });
        captures.push(path);
      }
    }
  }

  return { captures, failures };
}
