// ported from hive/packages/functions/test/forfeit.test.ts (adapted)
// T5.5: async clocks — deadline stamping through the callables, the forfeit
// sweep (fired directly with pinned times), warning pushes, invite culling.
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createForfeitHandlers, type PushTransport } from '@parlor/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { lexServerConfig } from '../src/config';
import { OPTIONS, adminGetDoc, adminListDocs, call, createJoinedGame, signUp } from './helpers';

beforeAll(() => {
  if (getApps().length === 0) initializeApp({ projectId: 'demo-lex' });
});

const { runForfeitSweep } = createForfeitHandlers(lexServerConfig);
const DAY_MS = 24 * 60 * 60 * 1000;

class CaptureTransport implements PushTransport {
  sent: Array<{ tokens: string[]; data: Record<string, string> }> = [];
  async sendEachForMulticast(m: { tokens: string[]; data: Record<string, string> }) {
    this.sent.push(m);
    return { responses: m.tokens.map(() => ({ success: true })) };
  }
}

describe('deadline stamping', () => {
  it('createGame stores the time control; joinGame stamps deadlineAt', async () => {
    const ada = await signUp('Ada');
    const sam = await signUp('Sam');
    const created = await call(
      'createGame',
      { options: { ...OPTIONS, timeControl: { days: 3 } }, seat: 'me' },
      ada,
    );
    expect(created.status).toBe(200);
    const { gameId, code } = created.result as { gameId: string; code: string };
    let game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['timeControl']).toEqual({ days: 3 });
    expect(game?.['deadlineAt'] ?? null).toBeNull(); // clock starts at activation

    await call('joinGame', { code }, sam);
    game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['deadlineAt']).toBeTruthy();
  });

  it('untimed games carry no deadline', async () => {
    const { gameId } = await createJoinedGame();
    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['timeControl']).toBeNull();
    expect(game?.['deadlineAt'] ?? null).toBeNull();
  });
});

async function timedGame(): Promise<{ gameId: string; p0Uid: string; p1Uid: string }> {
  const ada = await signUp('Ada');
  const sam = await signUp('Sam');
  const created = await call(
    'createGame',
    { options: { ...OPTIONS, timeControl: { days: 1 } }, seat: 'me' },
    ada,
  );
  const { gameId, code } = created.result as { gameId: string; code: string };
  await call('joinGame', { code }, sam);
  return { gameId, p0Uid: ada.uid, p1Uid: sam.uid };
}

describe('runForfeitSweep', () => {
  it('forfeits a past-deadline game with a timeout meta event', async () => {
    const { gameId, p0Uid } = await timedGame();
    const db = getFirestore();
    // p0 (to move) blew the deadline an hour ago
    await db
      .doc(`games/${gameId}`)
      .update({ deadlineAt: Timestamp.fromMillis(Date.now() - 3_600_000) });

    const transport = new CaptureTransport();
    const res = await runForfeitSweep(db, Date.now(), transport);
    expect(res.forfeited).toBeGreaterThanOrEqual(1);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('finished');
    expect(game?.['result']).toBe('p1');
    expect(game?.['endedBy']).toBe('timeout');
    const log = (await adminListDocs(`games/${gameId}/moves`)).sort(
      (a, b) => (a['n'] as number) - (b['n'] as number),
    );
    expect(log.at(-1)).toMatchObject({ kind: 'timeout', by: p0Uid });
  });

  it('warns (once) inside the 24h window and pushes to stored tokens', async () => {
    const { gameId, p0Uid } = await timedGame();
    const db = getFirestore();
    await db
      .doc(`games/${gameId}`)
      .update({ deadlineAt: Timestamp.fromMillis(Date.now() + 3_600_000 * 5) });
    await db.doc(`users/${p0Uid}`).set({ fcmTokens: ['tok-p0'] });

    const transport = new CaptureTransport();
    const first = await runForfeitSweep(db, Date.now(), transport);
    expect(first.warned).toBeGreaterThanOrEqual(1);
    const warning = transport.sent.find((m) => m.data['title']?.includes('expires soon'));
    expect(warning?.tokens).toEqual(['tok-p0']);
    expect(warning?.data['link']).toBe(`/game/${gameId}`);

    const again = await runForfeitSweep(db, Date.now(), transport);
    const warnedGame = await adminGetDoc(`games/${gameId}`);
    expect(warnedGame?.['deadlineWarnedAt']).toBeTruthy();
    expect(again.warned).toBe(0); // this game, at least, is not re-warned
  });

  it('culls expired invites and keeps live ones', async () => {
    const ada = await signUp('Ada');
    const created = await call('createGame', { options: { ...OPTIONS }, seat: 'me' }, ada);
    const { code } = created.result as { code: string };
    const db = getFirestore();
    await db
      .doc(`invites/${code}`)
      .update({ expiresAt: Timestamp.fromMillis(Date.now() - DAY_MS) });
    const live = await call('createGame', { options: { ...OPTIONS }, seat: 'me' }, ada);
    const liveCode = (live.result as { code: string }).code;

    const res = await runForfeitSweep(db, Date.now(), new CaptureTransport());
    expect(res.invitesCulled).toBeGreaterThanOrEqual(1);
    expect(await adminGetDoc(`invites/${code}`)).toBeNull();
    expect(await adminGetDoc(`invites/${liveCode}`)).toBeTruthy();
  });
});

/** A running three-hand timed game: Ada (p0, to move), Sam (p1), Eve (p2). */
async function timedRoom(): Promise<{
  gameId: string;
  p0Uid: string;
  p1Uid: string;
  p2Uid: string;
}> {
  const ada = await signUp('Ada');
  const sam = await signUp('Sam');
  const eve = await signUp('Eve');
  const created = await call(
    'createGame',
    { options: { ...OPTIONS, timeControl: { days: 1 }, maxPlayers: 3 }, seat: 'me' },
    ada,
  );
  const { gameId, code } = created.result as { gameId: string; code: string };
  for (const guest of [sam, eve]) {
    const joined = await call('joinGame', { code }, guest);
    if (joined.status !== 200) throw new Error(`joinGame failed: ${joined.errorMessage}`);
  }
  return { gameId, p0Uid: ada.uid, p1Uid: sam.uid, p2Uid: eve.uid };
}

/** Open a room with only its host aboard, and back-date its invite so this
 *  sweep — and only the docs this test made — sees an expired code. */
async function expiredRoom(
  maxPlayers: number,
  guests: number,
): Promise<{ gameId: string; code: string }> {
  const host = await signUp('Ada');
  const created = await call(
    'createGame',
    { options: { ...OPTIONS, maxPlayers }, seat: 'me' },
    host,
  );
  const { gameId, code } = created.result as { gameId: string; code: string };
  for (let i = 0; i < guests; i++) {
    const joined = await call('joinGame', { code }, await signUp(`Guest${i}`));
    if (joined.status !== 200) throw new Error(`joinGame failed: ${joined.errorMessage}`);
  }
  await getFirestore()
    .doc(`invites/${code}`)
    .update({ expiresAt: Timestamp.fromMillis(Date.now() - DAY_MS) });
  return { gameId, code };
}

// T7.7: the sweep and `resign` share one withdrawal routine, so a timeout at
// 3+ seats takes a player out instead of ending the game; and a room whose
// code died before it ever had enough players is swept away with it.
describe('runForfeitSweep at 3+ seats', () => {
  it('withdraws the player who ran out of time and plays on', async () => {
    const { gameId, p0Uid } = await timedRoom();
    const db = getFirestore();
    await db
      .doc(`games/${gameId}`)
      .update({ deadlineAt: Timestamp.fromMillis(Date.now() - 3_600_000) });

    const res = await runForfeitSweep(db, Date.now(), new CaptureTransport());
    expect(res.forfeited).toBeGreaterThanOrEqual(1);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('active'); // three seats: a timeout is not an ending
    expect(game?.['withdrawn']).toEqual(['p0']);
    expect(game?.['result']).toBeUndefined();
    expect(game?.['endedBy']).toBeUndefined();
    expect(game?.['toMove']).toBe('p1');
    expect(game?.['rackCounts']).toEqual({ p0: 0, p1: 7, p2: 7 });

    // The clock restarts for whoever is now on the hook — otherwise the next
    // sweep would time the whole table out at once.
    const deadline = new Date(game?.['deadlineAt'] as string).getTime();
    expect(deadline).toBeGreaterThan(Date.now());
    expect(game?.['deadlineWarnedAt']).toBeUndefined();

    const log = (await adminListDocs(`games/${gameId}/moves`)).sort(
      (a, b) => (a['n'] as number) - (b['n'] as number),
    );
    expect(log.at(-1)).toMatchObject({ kind: 'timeout', by: p0Uid });
  });

  it('culls an open room whose invite expired while it was still short-handed', async () => {
    const { gameId, code } = await expiredRoom(3, 0);
    const res = await runForfeitSweep(getFirestore(), Date.now(), new CaptureTransport());

    // The guest list IS the game at 3+, so a dead code leaves an unjoinable,
    // unstartable room in every guest's lobby — it goes with the invite.
    expect(res.roomsCulled).toBe(1);
    expect(await adminGetDoc(`invites/${code}`)).toBeNull();
    expect(await adminGetDoc(`games/${gameId}`)).toBeNull();
  });

  it('keeps an open room that already reached the minimum', async () => {
    const { gameId, code } = await expiredRoom(3, 1);
    const res = await runForfeitSweep(getFirestore(), Date.now(), new CaptureTransport());

    expect(res.roomsCulled).toBe(0);
    expect(await adminGetDoc(`invites/${code}`)).toBeNull(); // the code still expires
    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('open'); // two aboard — the host can still start
    expect((game?.['roster'] as unknown[]).length).toBe(2);
  });
});
