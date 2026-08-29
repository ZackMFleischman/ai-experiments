// ported from hive/e2e/multiplayer/harness.ts (adapted)
// Shared multiplayer test harness: all emulator-specific plumbing for the M4
// suite lives here — reset, test sign-in, and the deterministic-rack rig
// (admin-bypass writes to the server-private tier, so the spec can script
// real words). Emulators are booted around the whole run by
// `firebase emulators:exec` (see validate:m4 in the root package.json).
import { expect, type Page } from '@playwright/test';
import {
  RULESETS,
  initialState,
  serializePublic,
  serializeState,
  type TileFace,
} from '../../packages/engine/src/index.js';

const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const PROJECT = 'demo-lex';
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;

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

// ── deterministic hidden state (admin bypass) ────────────────────────────────

/** The scripted deal: Ada (p0) CATSNTI — CATS leaves NTI, the next four draws
 * are S,E,R,A, so her second play is the 7-tile ANTISERA bingo under the A.
 * Sam (p1) REDOGNU — REDS extends the S. */
export const P0_RACK = 'CATSNTI';
export const P1_RACK = 'REDOGNU';
const NEXT_DRAWS = 'SERA';

export function riggedOrder(): TileFace[] {
  const classic = RULESETS['classic']!;
  const remaining = new Map<string, number>(Object.entries(classic.tiles.counts));
  for (const face of P0_RACK + P1_RACK + NEXT_DRAWS) {
    const left = (remaining.get(face) ?? 0) - 1;
    if (left < 0) throw new Error(`rig overdraws '${face}'`);
    remaining.set(face, left);
  }
  const rest: string[] = [];
  for (const [face, count] of remaining) {
    for (let i = 0; i < count; i++) rest.push(face);
  }
  return [...P0_RACK, ...P1_RACK, ...NEXT_DRAWS, ...rest] as TileFace[];
}

function encodeValue(v: unknown): Record<string, unknown> {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } };
}
function encodeFields(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encodeValue(v)]));
}

async function adminSet(path: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${DOCS}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  if (!res.ok) throw new Error(`adminSet ${path} failed: ${await res.text()}`);
}

async function adminGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${DOCS}/${path}`, { headers: { Authorization: 'Bearer owner' } });
  if (!res.ok) throw new Error(`adminGet ${path} failed: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

function str(doc: Record<string, unknown>, field: string): string {
  const fields = doc['fields'] as Record<string, { stringValue?: string }>;
  const v = fields[field]?.stringValue;
  if (!v) throw new Error(`missing field ${field}`);
  return v;
}

/** Replace a just-created (still open) game's hidden state with the scripted
 * deal: creator's rack + the full private bag. The joiner's rack is dealt
 * from this order when they accept (seatRackDoc), so rigging before the join
 * covers both seats. Returns the gameId. */
export async function rigGameByCode(code: string): Promise<string> {
  const invite = await adminGet(`invites/${code}`);
  const gameId = str(invite, 'gameId');
  const createdBy = str(invite, 'createdBy');

  const classic = RULESETS['classic']!;
  const order = riggedOrder();
  const state = initialState(classic, order, 2);
  await adminSet(`games/${gameId}/racks/${createdBy}`, { tiles: P0_RACK, n: 0 });
  await adminSet(`games/${gameId}/private/bag`, {
    order: order.join(''),
    drawn: 2 * classic.rackSize,
    state: serializeState(state),
    events: [],
  });
  return gameId;
}

// ── a rigged deal for a 3+ ROOM game (T7.17) ─────────────────────────────────
// A two-seat game is dealt by createGame, so `rigGameByCode` can script it
// while the game is still open. A room has no seats until the host starts, so
// the deal only exists AFTER startGame — the rig therefore lands on a running
// game and has to keep the public mirror (`public`, `scores`, `bagCount`,
// `rackCounts`) consistent with the private bag it replaces.

/** The scripted 3-seat deal. Ada opens small; Sam bingoes and then walks out
 * while comfortably ahead — the case the ranking rule exists for. */
export const ROOM_RACKS = ['CATSNTI', 'NTISERA', 'BLEMPHO'] as const;

export function roomOrder(): TileFace[] {
  const classic = RULESETS['classic']!;
  const remaining = new Map<string, number>(Object.entries(classic.tiles.counts));
  for (const face of ROOM_RACKS.join('')) {
    const left = (remaining.get(face) ?? 0) - 1;
    if (left < 0) throw new Error(`room rig overdraws '${face}'`);
    remaining.set(face, left);
  }
  const rest: string[] = [];
  for (const [face, count] of remaining) {
    for (let i = 0; i < count; i++) rest.push(face);
  }
  return [...ROOM_RACKS.join(''), ...rest] as TileFace[];
}

/** PATCH only the named fields. `adminSet`'s maskless PATCH REPLACES a
 * document, which would strip `players`/`status` off a live game doc. */
async function adminPatch(path: string, data: Record<string, unknown>): Promise<void> {
  const mask = Object.keys(data)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join('&');
  const res = await fetch(`${DOCS}/${path}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  if (!res.ok) throw new Error(`adminPatch ${path} failed: ${await res.text()}`);
}

/** Seat key → uid, from a started game's `players` map. */
function playersOf(doc: Record<string, unknown>): Record<string, string> {
  const fields = doc['fields'] as Record<string, unknown>;
  const map = fields['players'] as { mapValue?: { fields?: Record<string, { stringValue?: string }> } };
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(map?.mapValue?.fields ?? {})) {
    if (value.stringValue) out[key] = value.stringValue;
  }
  return out;
}

/**
 * Replace a just-started room game's deal with the scripted one. Callers
 * should reload every open page afterwards: the rig lands through the same
 * listeners the app is already using, and a reload is the cheapest way to be
 * certain no page is rendering a rack from the deal we just threw away.
 */
export async function rigStartedRoom(gameId: string): Promise<void> {
  const classic = RULESETS['classic']!;
  const order = roomOrder();
  const seats = ROOM_RACKS.length;
  const state = initialState(classic, order, seats);
  const players = playersOf(await adminGet(`games/${gameId}`));

  await adminSet(`games/${gameId}/private/bag`, {
    order: order.join(''),
    drawn: seats * classic.rackSize,
    state: serializeState(state),
    events: [],
  });
  const seatKeys = ['p0', 'p1', 'p2'];
  for (let seat = 0; seat < seats; seat++) {
    const uid = players[seatKeys[seat]!];
    if (!uid) throw new Error(`room rig: seat ${seatKeys[seat]} is empty`);
    await adminSet(`games/${gameId}/racks/${uid}`, { tiles: ROOM_RACKS[seat]!, n: 0 });
  }
  const perSeat = <T,>(value: (seat: number) => T): Record<string, T> =>
    Object.fromEntries(seatKeys.map((key, seat) => [key, value(seat)]));
  await adminPatch(`games/${gameId}`, {
    public: serializePublic(state),
    bagCount: state.bag.length,
    scores: perSeat(() => 0),
    rackCounts: perSeat((seat) => state.racks[seat]!.length),
  });
}
