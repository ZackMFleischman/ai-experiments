// T5.3: notification payloads + delivery. buildPayload is pure — the exact
// payload per trigger is asserted here (DESIGN §5.5: mocked transport; real
// device push is the ⚑ manual M5 check). sendPush runs against the emulator's
// Firestore with a fake transport: token fan-out and stale-token pruning.
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPayload, sendPush, type PushTransport } from '../src/notify';

beforeAll(() => {
  // Admin SDK against the emulator (FIRESTORE_EMULATOR_HOST is set by
  // emulators:exec); a bare app is enough.
  if (getApps().length === 0) initializeApp({ projectId: 'demo-hive' });
});

describe('buildPayload', () => {
  it('opponent moved', () => {
    expect(buildPayload('opponent-moved', { gameId: 'g1', opponentName: 'Sam' })).toEqual({
      title: 'Your move vs. Sam',
      body: 'Sam played — the hive awaits.',
      link: '/game/g1',
      tag: 'game-g1',
    });
  });

  it('game joined', () => {
    expect(buildPayload('game-joined', { gameId: 'g1', opponentName: 'Sam' })).toEqual({
      title: 'Sam joined your game',
      body: 'The game is on — white opens.',
      link: '/game/g1',
      tag: 'game-g1',
    });
  });

  it('rematch offered', () => {
    expect(buildPayload('rematch-offered', { gameId: 'g2', opponentName: 'Sam' })).toEqual({
      title: 'Sam wants a rematch',
      body: 'The return game is ready — colors swapped.',
      link: '/game/g2',
      tag: 'game-g2',
    });
  });

  it('draw offered', () => {
    expect(buildPayload('draw-offered', { gameId: 'g1', opponentName: 'Sam' })).toEqual({
      title: 'Sam offers a draw',
      body: 'Accept or decline in the game.',
      link: '/game/g1',
      tag: 'game-g1',
    });
  });

  it('game over', () => {
    expect(
      buildPayload('game-over', { gameId: 'g1', opponentName: 'Sam', outcome: 'You won!' }),
    ).toEqual({
      title: 'You won!',
      body: 'Game vs. Sam is over — see the final board.',
      link: '/game/g1',
      tag: 'game-g1',
    });
  });

  it('deadline warning', () => {
    expect(
      buildPayload('deadline-warning', { gameId: 'g1', opponentName: 'Sam', hoursLeft: 24 }),
    ).toEqual({
      title: 'Your move vs. Sam expires soon',
      body: 'About 24h left before the game is forfeit.',
      link: '/game/g1',
      tag: 'game-g1',
    });
  });
});

class FakeTransport implements PushTransport {
  sent: Array<{ tokens: string[]; data: Record<string, string> }> = [];
  failWith = new Set<string>();

  async sendEachForMulticast(message: { tokens: string[]; data: Record<string, string> }) {
    this.sent.push({ tokens: message.tokens, data: message.data });
    return {
      responses: message.tokens.map((t) =>
        this.failWith.has(t)
          ? {
              success: false,
              error: { code: 'messaging/registration-token-not-registered' },
            }
          : { success: true },
      ),
    };
  }
}

describe('sendPush', () => {
  it('is a no-op for users without tokens', async () => {
    const db = getFirestore();
    const transport = new FakeTransport();
    await db.doc('users/no-tokens').set({ displayName: 'Nobody' });
    await sendPush(db, transport, 'no-tokens', buildPayload('opponent-moved', { gameId: 'g', opponentName: 'X' }));
    expect(transport.sent).toHaveLength(0);
  });

  it('fans out to every stored token with the data-only payload', async () => {
    const db = getFirestore();
    const transport = new FakeTransport();
    await db.doc('users/two-devices').set({ fcmTokens: ['tok-a', 'tok-b'] });
    const payload = buildPayload('opponent-moved', { gameId: 'g7', opponentName: 'Sam' });
    await sendPush(db, transport, 'two-devices', payload);
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]?.tokens).toEqual(['tok-a', 'tok-b']);
    expect(transport.sent[0]?.data).toEqual({
      title: 'Your move vs. Sam',
      body: 'Sam played — the hive awaits.',
      link: '/game/g7',
      tag: 'game-g7',
    });
  });

  it('prunes tokens the push service no longer recognizes', async () => {
    const db = getFirestore();
    const transport = new FakeTransport();
    transport.failWith.add('tok-dead');
    await db.doc('users/pruney').set({ fcmTokens: ['tok-dead', 'tok-live'] });
    await sendPush(db, transport, 'pruney', buildPayload('game-joined', { gameId: 'g', opponentName: 'S' }));
    const doc = await db.doc('users/pruney').get();
    expect(doc.data()?.['fcmTokens']).toEqual(['tok-live']);
  });
});
