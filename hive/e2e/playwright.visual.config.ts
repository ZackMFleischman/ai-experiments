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
    baseURL: 'http://127.0.0.1:5187',
  },
  webServer: {
    command: 'pnpm --filter @hive/app dev --port 5187 --strictPort',
    url: 'http://127.0.0.1:5187',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
