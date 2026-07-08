// T4.6 gate: the real FirestoreTransport under a GameController against the
// emulator suite. This client plays white through the controller; the
// opponent (black) plays through raw callable HTTP like a second device.
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { beforeAll, describe, expect, it } from 'vitest';
import { GameController } from '../src/controller/GameController';
import { configureFirebase, getAppAuth } from '@parlor/web/firebase';
import * as api from '../src/sync/gameApi';
import { FirestoreTransport } from '../src/sync/firestoreTransport';

configureFirebase({ emulatorProjectId: 'demo-hive', emulators: true });

const AUTH = 'http://127.0.0.1:9099';
const FUNCTIONS = 'http://127.0.0.1:5001/demo-hive/us-central1';

const OPTIONS = { mosquito: true, ladybug: true, pillbug: true, tournamentOpening: true };

interface RestUser {
  uid: string;
  token: string;
}

async function restSignUp(name: string): Promise<RestUser> {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `${name}-${Date.now()}@example.com`,
      password: 'pw123456',
      displayName: name,
      returnSecureToken: true,
    }),
  });
  const body = (await res.json()) as { idToken: string; localId: string };
  return { uid: body.localId, token: body.idToken };
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

async function serverMoveCount(gameId: string): Promise<number> {
  const res = await fetch(
    `http://127.0.0.1:8080/v1/projects/demo-hive/databases/(default)/documents/games/${gameId}`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  const body = (await res.json()) as {
    fields?: { moveCount?: { integerValue?: string } };
  };
  return Number(body.fields?.moveCount?.integerValue ?? -1);
}

async function waitForAsync(
  predicate: () => Promise<boolean>,
  what: string,
  ms = 10000,
): Promise<void> {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function waitFor(predicate: () => boolean, what: string, ms = 10000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

let myUid: string;

beforeAll(async () => {
  const email = `white-${Date.now()}@example.com`;
  const cred = await createUserWithEmailAndPassword(getAppAuth(), email, 'pw123456').catch(() =>
    signInWithEmailAndPassword(getAppAuth(), email, 'pw123456'),
  );
  myUid = cred.user.uid;
});

describe('FirestoreTransport integration', () => {
  it('plays both directions live: optimistic local moves, remote via listener', async () => {
    const { gameId, code } = await api.createGame({ options: { ...OPTIONS, timeControl: null }, seat: 'w' });
    const black = await restSignUp('Sam');
    await restCall('joinGame', { code }, black);

    const transport = new FirestoreTransport(gameId, myUid);
    const info = await transport.open();
    expect(info.myColor).toBe('w');
    expect(info.status).toBe('active');

    const controller = new GameController(transport, info.options, info.myColor);
    await controller.init();

    // my move (optimistic → server accepts)
    controller.selectHandBug('S');
    controller.selectCell({ q: 0, r: 0 });
    expect(controller.getSnapshot().log).toHaveLength(1); // optimistic, instant
    await waitForAsync(async () => (await serverMoveCount(gameId)) === 1, 'server accepted move');

    // opponent moves on "another device"; arrives through the snapshot listener
    await restCall('submitMove', { gameId, expectedMoveCount: 1, uhpMove: 'bS1 wS1-' }, black);
    await waitFor(
      () => controller.getSnapshot().state.board.size === 2,
      'remote move via listener',
    );
    expect(controller.getSnapshot().toMove).toBe('w');

    // remote draw offer surfaces; accepting ends the game everywhere
    await restCall('offerDraw', { gameId }, black);
    await waitFor(() => controller.getSnapshot().pendingDrawOffer === 'b', 'remote draw offer');
    controller.respondDraw('w', true);
    await waitFor(() => controller.getSnapshot().end?.by === 'draw-agreed', 'draw agreed');
    await waitForAsync(async () => (await serverMoveCount(gameId)) === 4, 'accept landed');

    controller.dispose();

    // reload-resume: a fresh controller reconstructs the finished game
    const again = new FirestoreTransport(gameId, myUid);
    const info2 = await again.open();
    const resumed = new GameController(again, info2.options, info2.myColor);
    await resumed.init();
    expect(resumed.getSnapshot().log.length).toBe(4);
    expect(resumed.getSnapshot().end?.by).toBe('draw-agreed');
    resumed.dispose();
  });

  it('open() rejects non-players', async () => {
    const stranger = await restSignUp('Eve');
    const created = (await restCall(
      'createGame',
      { options: { ...OPTIONS, timeControl: null }, seat: 'w' },
      stranger,
    )) as { gameId: string };
    const transport = new FirestoreTransport(created.gameId, myUid);
    await expect(transport.open()).rejects.toThrow();
  });
});
