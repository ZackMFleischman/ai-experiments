// T5.5: async clocks — deadline stamping through the callables, the forfeit
// sweep (fired directly with pinned times), warning pushes, invite culling.
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { runForfeitSweep } from '../src/forfeit';
import type { PushTransport } from '../src/notify';
import { adminGetDoc, adminListDocs, call, createJoinedGame, signUp } from './helpers';

beforeAll(() => {
  if (getApps().length === 0) initializeApp({ projectId: 'demo-hive' });
});

const OPTIONS = { mosquito: true, ladybug: true, pillbug: true, tournamentOpening: true };
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
      { options: OPTIONS, color: 'w', timeControlDays: 3 },
      ada,
    );
    expect(created.status).toBe(200);
    const { gameId, code } = created.result as { gameId: string; code: string };
    let game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['timeControl']).toEqual({ days: 3 });

    await call('joinGame', { code }, sam);
    game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['deadlineAt']).toBeTruthy();
  });

  it('untimed games carry no deadline', async () => {
    const { gameId } = await createJoinedGame(OPTIONS); // no timeControlDays
    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['timeControl']).toBeNull();
    expect(game?.['deadlineAt'] ?? null).toBeNull();
  });

  it('rejects a bogus time control', async () => {
    const ada = await signUp('Ada');
    const res = await call('createGame', { options: OPTIONS, color: 'w', timeControlDays: 2 }, ada);
    expect(res.errorStatus).toBe('INVALID_ARGUMENT');
  });
});

async function timedGame(): Promise<{ gameId: string; whiteUid: string; blackUid: string }> {
  const ada = await signUp('Ada');
  const sam = await signUp('Sam');
  const created = await call(
    'createGame',
    { options: OPTIONS, color: 'w', timeControlDays: 1 },
    ada,
  );
  const { gameId, code } = created.result as { gameId: string; code: string };
  await call('joinGame', { code }, sam);
  return { gameId, whiteUid: ada.uid, blackUid: sam.uid };
}

describe('runForfeitSweep', () => {
  it('forfeits a past-deadline game with a timeout meta event', async () => {
    const { gameId, whiteUid } = await timedGame();
    const db = getFirestore();
    // white (to move) blew the deadline an hour ago
    await db.doc(`games/${gameId}`).update({ deadlineAt: Timestamp.fromMillis(Date.now() - 3_600_000) });

    const transport = new CaptureTransport();
    const res = await runForfeitSweep(db, Date.now(), transport);
    expect(res.forfeited).toBeGreaterThanOrEqual(1);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('finished');
    expect(game?.['result']).toBe('black');
    expect(game?.['endedBy']).toBe('timeout');
    const log = (await adminListDocs(`games/${gameId}/moves`)).sort(
      (a, b) => (a['n'] as number) - (b['n'] as number),
    );
    expect(log.at(-1)).toMatchObject({ kind: 'timeout', by: whiteUid });
  });

  it('warns (once) inside the 24h window and pushes to stored tokens', async () => {
    const { gameId, whiteUid } = await timedGame();
    const db = getFirestore();
    await db.doc(`games/${gameId}`).update({ deadlineAt: Timestamp.fromMillis(Date.now() + 3_600_000 * 5) });
    await db.doc(`users/${whiteUid}`).set({ fcmTokens: ['tok-w'] });

    const transport = new CaptureTransport();
    const first = await runForfeitSweep(db, Date.now(), transport);
    expect(first.warned).toBeGreaterThanOrEqual(1);
    const warning = transport.sent.find((m) => m.data['title']?.includes('expires soon'));
    expect(warning?.tokens).toEqual(['tok-w']);
    expect(warning?.data['link']).toBe(`/game/${gameId}`);

    const again = await runForfeitSweep(db, Date.now(), transport);
    const warnedGames = await adminGetDoc(`games/${gameId}`);
    expect(warnedGames?.['deadlineWarnedAt']).toBeTruthy();
    expect(again.warned).toBe(0); // this game, at least, is not re-warned
  });

  it('culls expired invites and keeps live ones', async () => {
    const ada = await signUp('Ada');
    const created = await call('createGame', { options: OPTIONS, color: 'w' }, ada);
    const { code } = created.result as { code: string };
    const db = getFirestore();
    await db.doc(`invites/${code}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - DAY_MS) });
    const live = await call('createGame', { options: OPTIONS, color: 'w' }, ada);
    const liveCode = (live.result as { code: string }).code;

    const res = await runForfeitSweep(db, Date.now(), new CaptureTransport());
    expect(res.invitesCulled).toBeGreaterThanOrEqual(1);
    expect(await adminGetDoc(`invites/${code}`)).toBeNull();
    expect(await adminGetDoc(`invites/${liveCode}`)).toBeTruthy();
  });
});
