import { defineConfig, devices } from '@playwright/test';

// Multiplayer suite (M4): runs the app in full mode against the Firebase
// emulator suite. The whole `playwright test` invocation is wrapped in
// `firebase emulators:exec` by `pnpm validate:m4` — emulators are assumed up.
// Dev server (not preview): full mode connects to emulators via DEV.
export default defineConfig({
  testDir: './multiplayer',
  fullyParallel: false, // tests share one emulator instance; keep them ordered
  workers: 1, // …and files too: resetEmulators() in one file must not wipe another's game
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:5189',
    trace: 'retain-on-failure',
    viewport: { width: 1024, height: 768 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'pnpm --filter @hive/app exec vite --mode multiplayer --port 5189 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5189',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
