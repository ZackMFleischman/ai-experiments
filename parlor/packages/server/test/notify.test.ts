// T7.8: the guest-list push fan-out. RoomTrigger is a capability beyond
// SharedTrigger (the DrawTrigger pattern) precisely so that adding these three
// does not make an existing game's buildPayload switch non-exhaustive — the
// siblings must stay untouched.
import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  actorOf,
  countActionable,
  defaultRoomPayload,
  type NotifyConfig,
  type TriggerArgs,
} from '../src/index.js';

const args = (over: Partial<TriggerArgs> = {}): TriggerArgs => ({
  gameId: 'g1',
  opponentName: 'Sam',
  ...over,
});

describe('actorOf', () => {
  it('prefers the N-seat name and falls back to the two-seat one', () => {
    expect(actorOf(args())).toBe('Sam');
    expect(actorOf(args({ actorName: 'Ada' }))).toBe('Ada');
  });
});

describe('defaultRoomPayload', () => {
  it('deep-links to the game and tags by it, so a room never stacks notifications', () => {
    for (const trigger of ['invited', 'player-joined', 'game-started'] as const) {
      const payload = defaultRoomPayload(trigger, args({ actorName: 'Ada' }));
      expect(payload.link).toBe('/game/g1');
      expect(payload.tag).toBe('game-g1');
      expect(payload.title.length).toBeGreaterThan(0);
      expect(payload.body.length).toBeGreaterThan(0);
    }
  });

  it('names the actor in the invitation and the arrival', () => {
    expect(defaultRoomPayload('invited', args({ actorName: 'Ada' })).title).toContain('Ada');
    expect(defaultRoomPayload('player-joined', args({ actorName: 'Ada' })).title).toContain('Ada');
  });

  it('says seats are not reserved — the invitation grants nothing but a heads-up', () => {
    expect(defaultRoomPayload('invited', args()).body).toMatch(/first come, first served/i);
  });

  it('lets a caller override the body', () => {
    expect(defaultRoomPayload('game-started', args({ outcome: 'You are second to play' })).body).toBe(
      'You are second to play',
    );
  });
});

/** A Firestore stand-in for countActionable's two queries. */
function fakeDb(active: unknown[], open: unknown[]): Firestore {
  const snap = (docs: unknown[]) => ({ docs: docs.map((d) => ({ data: () => d })) });
  return {
    collection: () => ({
      where: () => ({
        where: (_f: string, _op: string, status: string) => ({
          get: () => Promise.resolve(snap(status === 'active' ? active : open)),
        }),
      }),
    }),
  } as unknown as Firestore;
}

const config: NotifyConfig = {
  buildPayload: () => ({ title: '', body: '', link: '', tag: '' }),
  isMyTurn: (game, uid) => (game as { toMove?: string }).toMove === uid,
};

describe('countActionable', () => {
  it('counts a pending 3+ invitation, exactly as it counts a challenge', async () => {
    const db = fakeDb(
      [],
      [
        { challenge: { to: 'ada' } },
        { invited: [{ uid: 'ada', name: 'Ada' }] },
        { invited: [{ uid: 'sam', name: 'Sam' }] }, // somebody else's invitation
        { roster: [{ uid: 'ada', name: 'Ada' }] }, // already in — nothing to answer
      ],
    );
    expect(await countActionable(db, config, 'ada')).toBe(2);
  });

  it('still counts games on your move and freshly activated ones', async () => {
    const db = fakeDb(
      [{ toMove: 'ada' }, { toMove: 'sam' }, { toMove: 'sam', moveCount: 0, activatedBy: 'sam' }],
      [],
    );
    expect(await countActionable(db, config, 'ada')).toBe(2);
  });

  it('is zero when nothing is waiting on you', async () => {
    expect(await countActionable(fakeDb([{ toMove: 'sam' }], []), config, 'ada')).toBe(0);
  });
});
