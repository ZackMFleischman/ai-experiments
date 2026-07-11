// ported from hive/packages/functions/test/ping.test.ts (adapted)
import { describe, expect, it } from 'vitest';

// Runs inside `firebase emulators:exec` (see package.json test script) — the
// functions/firestore/auth emulators are already up on their firebase.json ports.
const FUNCTIONS = 'http://127.0.0.1:5001/demo-checkers/us-central1';
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-checkers/databases/(default)/documents';

describe('emulator wiring', () => {
  it('ping callable answers over the functions emulator', async () => {
    const res = await fetch(`${FUNCTIONS}/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { echo: 'hello' } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { pong: boolean; echo: string | null } };
    expect(body.result).toEqual({ pong: true, echo: 'hello' });
  });

  it('firestore emulator imported the committed seed fixture', async () => {
    // "Bearer owner" = emulator admin bypass; rules are exercised in M4 (T4.3).
    const res = await fetch(`${FIRESTORE}/users/demo-user`, {
      headers: { Authorization: 'Bearer owner' },
    });
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { fields?: { displayName?: { stringValue?: string } } };
    expect(doc.fields?.displayName?.stringValue).toBe('Demo User');
  });

  it('auth emulator is up', async () => {
    const res = await fetch('http://127.0.0.1:9099/');
    expect(res.status).toBe(200);
  });
});
