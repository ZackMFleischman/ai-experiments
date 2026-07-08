import { existsSync, readdirSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// The managed environment ships a preinstalled Chromium under PLAYWRIGHT_BROWSERS_PATH
// whose build number may differ from the one @playwright/test would fetch. Point at the
// installed full `chrome` binary when present; otherwise fall back to Playwright's own
// resolution (e.g. CI, which runs `playwright install`).
function findChromium(): string | undefined {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dir = readdirSync(base).find((d) => d.startsWith('chromium-'));
    if (dir) {
      const p = `${base}/${dir}/chrome-linux/chrome`;
      if (existsSync(p)) return p;
    }
  } catch {
    // no preinstalled browsers; let Playwright resolve
  }
  return undefined;
}

const chromiumPath = findChromium();

// Builds the app and serves the production preview on 4173, then runs the smoke suite.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'pnpm --filter @katmai/app build && pnpm --filter @katmai/app preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
