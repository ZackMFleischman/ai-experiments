// validate:m3 (T3.13): the hot-seat acceptance e2e runs against the REAL
// production build (the deployable artifact), phone-sized only — the §7.2
// flows must work at 390×844.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './m3',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  timeout: 120_000,
  projects: [
    {
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true },
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'pnpm --filter @lex/dict build && pnpm --filter @lex/app build && pnpm --filter @lex/app preview --port 4174 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
