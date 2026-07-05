// ported from hive/e2e/playwright.offline.config.ts (adapted)
// T5.1 offline suite: a real production multiplayer build (service worker
// active) served by vite preview, against the emulator suite. Wrapped in
// `firebase emulators:exec` by `pnpm validate:m5`.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './offline',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 90_000,
  use: {
    baseURL: 'http://127.0.0.1:5190',
    trace: 'retain-on-failure',
    viewport: { width: 1024, height: 768 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'env VITE_FIREBASE_EMULATORS=1 pnpm --filter @lex/app build:mp && pnpm --filter @lex/app preview --port 5190 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5190',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
