// ported from lex/e2e/playwright.visual.config.ts (adapted)
// validate:visual runs against the DEV server — the gallery is stripped from
// production builds. Machine checks only in CI; the review pass is the agent
// reading artifacts/screens/.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './visual',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 1_200_000,
  use: {
    baseURL: 'http://127.0.0.1:5202',
    // Phone-sized by default; gallery captures set their own viewports.
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  },
  webServer: {
    command: 'pnpm --filter @tafl/app dev --port 5202 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5202',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
