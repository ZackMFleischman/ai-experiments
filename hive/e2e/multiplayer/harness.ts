// Shared multiplayer test harness (DESIGN §8): all emulator-specific plumbing
// for the M4 suite lives here — reset, fake users, sign-in — so the specs stay
// backend-agnostic. Emulators are booted around the whole run by
// `firebase emulators:exec` (see validate:m4 in the root package.json).
import { expect, type Page } from '@playwright/test';

const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const PROJECT = 'demo-hive';

/** Wipe auth users and game data between tests (the seed is not relied on). */
export async function resetEmulators(): Promise<void> {
  const del = async (url: string) => {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`emulator reset failed: ${url} → ${res.status}`);
  };
  await del(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`);
  await del(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`);
}

/** Sign in through the landing screen's emulator-only test-account form. */
export async function signInAs(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByTestId('test-email').fill(email);
  await page.getByTestId('test-sign-in').click();
  await expect(page.getByRole('heading', { level: 1, name: /your games/i })).toBeVisible();
}
