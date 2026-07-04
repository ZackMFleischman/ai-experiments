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

  it('challenge received', () => {
    expect(buildPayload('challenge-received', { gameId: 'g3', opponentName: 'Sam' })).toEqual({
      title: 'Sam challenges you',
      body: 'Accept or decline in your lobby.',
      link: '/game/g3',
      tag: 'game-g3',
    });
  });

  it('challenge accepted', () => {
    expect(buildPayload('challenge-accepted', { gameId: 'g3', opponentName: 'Sam' })).toEqual({
      title: 'Sam accepted your challenge',
      body: 'The game is on — white opens.',
      link: '/game/g3',
      tag: 'game-g3',
    });
  });

  it('challenge declined', () => {
    expect(buildPayload('challenge-declined', { gameId: 'g3', opponentName: 'Sam' })).toEqual({
      title: 'Sam declined your challenge',
      body: 'Maybe another time — start a new game from the lobby.',
      link: '/lobby',
      tag: 'game-g3',
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
      badge: '0',
    });
  });

  it('sends the recipient actionable count as the badge (turns, challenges, fresh games)', async () => {
    const db = getFirestore();
    const transport = new FakeTransport();
    await db.doc('users/badgey').set({ fcmTokens: ['tok-badge'] });
    const seat = (white: string, black: string | null) => ({
      playerIds: ['badgey', 'opp'],
      players: { white, black },
    });
    // Counts: an active game on badgey's move (fresh too — no double count),
    // an incoming challenge, and an opponent-activated game at move zero even
    // though it's not badgey's move (accepted invite / rematch offer).
    await db.doc('games/badge-my-turn').set({
      ...seat('badgey', 'opp'), status: 'active', toMove: 'w', moveCount: 0, activatedBy: 'opp',
    });
    await db.doc('games/badge-challenge-in').set({
      ...seat('opp', null),
      status: 'open',
      challenge: { from: 'opp', fromName: 'Opp', to: 'badgey', toName: 'Badgey' },
    });
    await db.doc('games/badge-fresh-accepted').set({
      ...seat('opp', 'badgey'), status: 'active', toMove: 'w', moveCount: 0, activatedBy: 'opp',
    });
    // Doesn't count: a fresh game badgey activated themselves, opponent's move
    // mid-game, outgoing challenge, finished game.
    await db.doc('games/badge-fresh-mine').set({
      ...seat('opp', 'badgey'), status: 'active', toMove: 'w', moveCount: 0, activatedBy: 'badgey',
    });
    await db.doc('games/badge-their-turn').set({
      ...seat('badgey', 'opp'), status: 'active', toMove: 'b', moveCount: 4,
    });
    await db.doc('games/badge-challenge-out').set({
      ...seat('badgey', null),
      status: 'open',
      challenge: { from: 'badgey', fromName: 'Badgey', to: 'opp', toName: 'Opp' },
    });
    await db.doc('games/badge-finished').set({ ...seat('badgey', 'opp'), status: 'finished', toMove: 'w' });

    await sendPush(db, transport, 'badgey', buildPayload('opponent-moved', { gameId: 'g', opponentName: 'Opp' }));
    expect(transport.sent[0]?.data['badge']).toBe('3');
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
