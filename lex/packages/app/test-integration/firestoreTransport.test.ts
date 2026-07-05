// ported from hive/packages/app/test-integration/firestoreTransport.test.ts
// (adapted — lex is hidden-information)
// T4.6 gate: the real FirestoreTransport under a GameController against the
// emulator suite. This client plays p0 through the controller; the opponent
// (p1) plays through raw callable HTTP like a second device. Covers the
// optimistic play + "drawing…" refill reconciliation, opponent-move adoption,
// exchange privacy at the client, rejection rollback, and the resigned-game
// view from both seats.
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { RULESETS, applyMove, initialState, serializeState, type GameState, type TileFace } from '@lex/engine';
import { loadDictionarySync } from '@lex/dict/node';
import { configureFirebase, getAppAuth } from '@parlor/web/firebase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GameController } from '../src/controller/GameController';
import * as api from '../src/sync/gameApi';
import { FirestoreTransport, canonicalBagOrder } from '../src/sync/firestoreTransport';
import type { GameOptions } from '../src/controller/entries';

const AUTH = 'http://127.0.0.1:9099';
const FUNCTIONS = 'http://127.0.0.1:5001/demo-lex/us-central1';
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-lex/databases/(default)/documents';

configureFirebase({ emulatorProjectId: 'demo-lex', emulators: true });

const classic = RULESETS['classic']!;
const dict = loadDictionarySync('enable1');

// Deterministic rig (same shape as the functions suite): p0 = CATSQJX.
const RACK0 = 'CATSQJX';
const RACK1 = 'DOGERNU';
const BAG_ORDER: TileFace[] = (() => {
  const remaining = new Map<string, number>(Object.entries(classic.tiles.counts));
  for (const face of RACK0 + RACK1) remaining.set(face, (remaining.get(face) ?? 0) - 1);
  const rest: string[] = [];
  for (const [face, count] of remaining) {
    for (let i = 0; i < count; i++) rest.push(face);
  }
  return [...RACK0, ...RACK1, ...rest] as TileFace[];
})();
const RIGGED: GameState = initialState(classic, BAG_ORDER, 2);

interface RestUser {
  uid: string;
  token: string;
  email: string;
}

async function restSignUp(name: string): Promise<RestUser> {
  const email = `${name.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'pw123456', displayName: name, returnSecureToken: true }),
  });
  const body = (await res.json()) as { idToken: string; localId: string };
  if (!res.ok) throw new Error(`signUp failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken, email };
}

async function restCall(name: string, data: unknown, user: RestUser): Promise<unknown> {
  const res = await fetch(`${FUNCTIONS}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
    body: JSON.stringify({ data }),
  });
  const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(`${name}: ${body.error.message}`);
  return body.result;
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
  const res = await fetch(`${FIRESTORE}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  if (!res.ok) throw new Error(`adminSet ${path} failed: ${await res.text()}`);
}

async function waitFor(predicate: () => boolean, what: string, ms = 15_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const OPTIONS = { rulesetId: 'classic', dictionaryId: 'enable1', timeControl: null };

function controllerOptions(): GameOptions {
  return {
    rulesetId: 'classic',
    dictionaryId: 'enable1',
    bagOrder: canonicalBagOrder('classic'),
    seats: 2,
  };
}

describe('FirestoreTransport + GameController (emulator)', () => {
  let p0: { uid: string; email: string };
  let p1: RestUser;
  let gameId: string;
  let controller: GameController;
  let transport: FirestoreTransport;

  beforeAll(async () => {
    // p0 signs in through the client SDK (the controller's auth context);
    // p1 acts over raw HTTP like a second device.
    const email = `ada-${Date.now()}@example.com`;
    const cred = await createUserWithEmailAndPassword(getAppAuth(), email, 'pw123456');
    p0 = { uid: cred.user.uid, email };
    p1 = await restSignUp('Sam');

    const created = await api.createGame({ options: OPTIONS, seat: 'me' });
    gameId = created.gameId;
    await restCall('joinGame', { code: created.code }, p1);

    // Deterministic hidden state (admin bypass — clients cannot write these).
    await adminSet(`games/${gameId}/racks/${p0.uid}`, { tiles: RACK0, n: 0 });
    await adminSet(`games/${gameId}/racks/${p1.uid}`, { tiles: RACK1, n: 0 });
    await adminSet(`games/${gameId}/private/bag`, {
      order: BAG_ORDER.join(''),
      drawn: 2 * classic.rackSize,
      state: serializeState(RIGGED),
      events: [],
    });

    transport = new FirestoreTransport(gameId, p0.uid);
    controller = new GameController(transport, controllerOptions(), { dict }, 0);
    await controller.init();
  });

  afterAll(async () => {
    controller?.dispose();
    await signOut(getAppAuth()).catch(() => {});
  });

  it('opens with my seat, options, and the REAL rack from the rack doc', async () => {
    const info = await transport.open();
    expect(info.mySeat).toBe(0);
    expect(info.options.rulesetId).toBe('classic');
    expect(info.status).toBe('active');

    const snap = controller.getSnapshot();
    expect(snap.rack.filter(Boolean).join('')).toBe(RACK0);
    expect(snap.interactive).toBe(true);
    expect(snap.drawing).toBe(0);
    expect(snap.bagCount).toBe(100 - 14);
    expect(snap.rackCounts).toEqual([7, 7]);
  });

  it('applies my play optimistically with a drawing placeholder, then reconciles the refill', async () => {
    // Stage CATS through the controller (slots 0-3 hold C A T S).
    controller.placeAt({ row: 7, col: 7 }, 0);
    controller.placeAt({ row: 7, col: 8 }, 1);
    controller.placeAt({ row: 7, col: 9 }, 2);
    controller.placeAt({ row: 7, col: 10 }, 3);
    expect(controller.getSnapshot().preview?.playable).toBe(true);
    controller.submitPlay();

    // Immediately: board updated, score counted, refill IN FLIGHT.
    const optimistic = controller.getSnapshot();
    expect(optimistic.state.board.size).toBe(4);
    expect(optimistic.scores).toEqual([12, 0]);
    expect(optimistic.drawing).toBe(4);
    expect(optimistic.rack.filter(Boolean).join('')).toBe('QJX');
    expect(optimistic.interactive).toBe(false); // opponent's turn now

    // The rack listener lands the real draw — exactly the engine's.
    await waitFor(
      () => controller.getSnapshot().drawing === 0 && controller.getSnapshot().rack.filter(Boolean).length === 7,
      'refill reconciliation',
    );
    const expected = applyMove(
      RIGGED,
      {
        type: 'play',
        placements: [
          { cell: { row: 7, col: 7 }, letter: 'C', isBlank: false },
          { cell: { row: 7, col: 8 }, letter: 'A', isBlank: false },
          { cell: { row: 7, col: 9 }, letter: 'T', isBlank: false },
          { cell: { row: 7, col: 10 }, letter: 'S', isBlank: false },
        ],
      },
      dict,
    );
    const snap = controller.getSnapshot();
    expect([...snap.rack.filter(Boolean)].sort().join('')).toBe(
      [...expected.racks[0]!].sort().join(''),
    );
    expect(snap.sheet).toHaveLength(1);
    expect(snap.sheet[0]).toMatchObject({ by: 0, kind: 'play', word: 'CATS', score: 12 });
  });

  it("adopts the opponent's exchange as a count-only server snapshot", async () => {
    await restCall(
      'submitMove',
      { gameId, expectedMoveCount: 1, move: { type: 'exchange', tiles: ['D', 'O', 'G'] } },
      p1,
    );
    await waitFor(() => controller.getSnapshot().sheet.length === 2, "opponent's exchange row");
    const snap = controller.getSnapshot();
    expect(snap.sheet[1]).toMatchObject({ by: 1, kind: 'exchange', count: 3, score: 0 });
    expect(snap.sheet[1]?.word).toBeNull(); // no letters anywhere client-side
    expect(snap.toMove).toBe(0);
    expect(snap.interactive).toBe(true);
    expect(snap.bagCount).toBe(100 - 14 - 4); // exchange returns what it takes
    expect(snap.rackCounts).toEqual([7, 7]);
    expect(snap.lastPlay).toMatchObject({ by: 1, kind: 'exchange', count: 3 });
  });

  it('rolls back a rejected submit and surfaces a notice', async () => {
    // Freeze this client's view, then play p0's turn from a "second device"
    // (raw HTTP with p0's own token) — the frozen client's submit is stale.
    controller.dispose(); // stop the live listeners: a deliberately stale client
    const p0Token = await getAppAuth().currentUser!.getIdToken();
    const p0Rest: RestUser = { uid: p0.uid, token: p0Token, email: p0.email };
    await restCall('submitMove', { gameId, expectedMoveCount: 2, move: { type: 'pass' } }, p0Rest);

    const before = controller.getSnapshot();
    expect(before.sheet).toHaveLength(2); // frozen pre-pass
    expect(before.interactive).toBe(true); // it still thinks it's p0's turn

    controller.pass(); // optimistic — the server refuses the stale count
    await waitFor(() => controller.getSnapshot().notice !== undefined, 'rejection notice');
    const after = controller.getSnapshot();
    expect(after.sheet).toHaveLength(2); // rolled back
    expect(after.notice?.text).toMatch(/rejected/i);

    // Recover: resync from the transport (what visibility regain does).
    await controller.resync();
    await waitFor(() => controller.getSnapshot().sheet.length === 3, 'resynced state');
    expect(controller.getSnapshot().sheet[2]).toMatchObject({ by: 0, kind: 'pass' });
  });

  it('shows the resign ending from both seats', async () => {
    // p0 resigns through a fresh controller (listeners back on).
    const t2 = new FirestoreTransport(gameId, p0.uid);
    const c2 = new GameController(t2, controllerOptions(), { dict }, 0);
    await c2.init();
    c2.resign();
    await waitFor(() => c2.getSnapshot().end?.by === 'resign', 'p0 sees the resignation');
    expect(c2.getSnapshot().end).toMatchObject({ by: 'resign', winner: 1 });
    c2.dispose();

    // p1's own view (their rack read requires their auth).
    await signOut(getAppAuth());
    await signInWithEmailAndPassword(getAppAuth(), p1.email, 'pw123456');
    const t3 = new FirestoreTransport(gameId, p1.uid);
    const c3 = new GameController(t3, controllerOptions(), { dict }, 1);
    await c3.init();
    await waitFor(() => c3.getSnapshot().end?.by === 'resign', 'p1 sees the resignation');
    const snap = c3.getSnapshot();
    expect(snap.end).toMatchObject({ by: 'resign', winner: 1 });
    expect(snap.rack.filter(Boolean).length).toBe(7); // their own rack, readable
    expect(snap.interactive).toBe(false);
    c3.dispose();
  });
});
