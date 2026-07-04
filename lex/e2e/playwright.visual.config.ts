// ported from hive/e2e/playwright.visual.config.ts (adapted)
// validate:visual + validate:ux run against the DEV server — the gallery is
// stripped from production builds. Machine checks only in CI; the review pass
// is the agent reading artifacts/screens/ (IMPLEMENTATION §4.2).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './visual',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 1_200_000,
  use: {
    baseURL: 'http://127.0.0.1:5188',
    // Phone-sized by default: the §7.2 flows must work at 390×844 (gallery
    // captures set their own viewport sizes explicitly).
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  },
  webServer: {
    command: 'pnpm --filter @lex/app dev --port 5188 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5188',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
