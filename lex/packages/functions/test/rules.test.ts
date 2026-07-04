// ported from hive/packages/functions/test/rules.test.ts (adapted)
// T4.3: security rules per DESIGN §6.2/§3.3 — clients get no write access to
// games/* or invites/*; game docs + move logs are readable only by their two
// players; racks/{uid} is OWNER-read only; private/* (the bag) is readable by
// no client at all. The negative cases here are a security invariant, not a
// convention. Runs inside `firebase emulators:exec` (see package.json).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lex',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'games/g1'), {
      players: { p0: 'ada', p1: 'sam' },
      playerNames: { p0: 'Ada', p1: 'Sam' },
      playerIds: ['ada', 'sam'],
      options: { rulesetId: 'classic', dictionaryId: 'enable1', timeControl: null },
      status: 'active',
      toMove: 'p0',
      moveCount: 1,
      scores: { p0: 24, p1: 0 },
      bagCount: 79,
      rackCounts: { p0: 7, p1: 7 },
      updatedAt: 1,
    });
    await setDoc(doc(db, 'games/g1/moves/0'), {
      n: 0,
      kind: 'play',
      play: { placements: [], words: [{ word: 'CATS', score: 24 }], score: 24, bingo: false },
      by: 'ada',
      at: 1,
    });
    await setDoc(doc(db, 'games/g1/racks/ada'), { tiles: 'AEINRT?' });
    await setDoc(doc(db, 'games/g1/racks/sam'), { tiles: 'BCDGLOU' });
    await setDoc(doc(db, 'games/g1/private/bag'), {
      order: 'EEEEAAAIIOONNRRTTLLSSUUDDGBCMPFHVWYKJXQZ',
      drawn: 21,
      events: [],
    });
    await setDoc(doc(db, 'invites/CODE42'), { gameId: 'g1', createdBy: 'ada', expiresAt: 9 });
    await setDoc(doc(db, 'users/ada'), { displayName: 'Ada' });
    // clearFirestore wipes the committed emulator seed too — restore it so
    // suites that assert on it (ping.test.ts) stay order-independent.
    await setDoc(doc(db, 'users/demo-user'), { displayName: 'Demo User' });
  });
});

describe('users/{uid}', () => {
  it('own doc is readable and writable', async () => {
    const db = env.authenticatedContext('ada').firestore();
    await assertSucceeds(getDoc(doc(db, 'users/ada')));
    await assertSucceeds(setDoc(doc(db, 'users/ada'), { displayName: 'Ada L' }));
  });

  it("someone else's doc is neither readable nor writable", async () => {
    const db = env.authenticatedContext('sam').firestore();
    await assertFails(getDoc(doc(db, 'users/ada')));
    await assertFails(setDoc(doc(db, 'users/ada'), { displayName: 'nope' }));
  });

  it('unauthenticated gets nothing', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users/ada')));
  });
});

describe('games/{gameId} (public tier)', () => {
  it('players can read their game', async () => {
    const db = env.authenticatedContext('ada').firestore();
    await assertSucceeds(getDoc(doc(db, 'games/g1')));
  });

  it('non-players cannot read the game', async () => {
    const db = env.authenticatedContext('eve').firestore();
    await assertFails(getDoc(doc(db, 'games/g1')));
  });

  it('players cannot write the game doc (mutations go through callables)', async () => {
    const db = env.authenticatedContext('ada').firestore();
    await assertFails(updateDoc(doc(db, 'games/g1'), { toMove: 'p1' }));
    await assertFails(updateDoc(doc(db, 'games/g1'), { 'scores.p0': 999 }));
  });

  it('the lobby query works for a player', async () => {
    const db = env.authenticatedContext('ada').firestore();
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'games'),
          where('playerIds', 'array-contains', 'ada'),
          where('status', '==', 'active'),
          orderBy('updatedAt', 'desc'),
        ),
      ),
    );
  });

  it('an unconstrained games list is rejected', async () => {
    const db = env.authenticatedContext('eve').firestore();
    await assertFails(getDocs(collection(db, 'games')));
  });
});

describe('games/{gameId}/moves', () => {
  it('players can read the move log', async () => {
    const db = env.authenticatedContext('sam').firestore();
    await assertSucceeds(getDoc(doc(db, 'games/g1/moves/0')));
    await assertSucceeds(getDocs(query(collection(db, 'games/g1/moves'), orderBy('n'))));
  });

  it('non-players cannot read the move log', async () => {
    const db = env.authenticatedContext('eve').firestore();
    await assertFails(getDoc(doc(db, 'games/g1/moves/0')));
  });

  it('players cannot append moves directly', async () => {
    const db = env.authenticatedContext('ada').firestore();
    await assertFails(setDoc(doc(db, 'games/g1/moves/1'), { n: 1, kind: 'pass', by: 'ada' }));
  });
});

describe('games/{gameId}/racks/{uid} (owner tier — hidden information)', () => {
  it('a player can read their own rack', async () => {
    const db = env.authenticatedContext('ada').firestore();
    await assertSucceeds(getDoc(doc(db, 'games/g1/racks/ada')));
  });

  it("the OPPONENT's rack is denied", async () => {
    const db = env.authenticatedContext('ada').firestore();
    await assertFails(getDoc(doc(db, 'games/g1/racks/sam')));
  });

  it('a non-player cannot read any rack', async () => {
    const db = env.authenticatedContext('eve').firestore();
    await assertFails(getDoc(doc(db, 'games/g1/racks/ada')));
  });

  it('racks cannot be listed (would leak the opponent rack)', async () => {
    const db = env.authenticatedContext('ada').firestore();
    await assertFails(getDocs(collection(db, 'games/g1/racks')));
  });

  it('nobody writes a rack from the client — not even their own', async () => {
    const db = env.authenticatedContext('ada').firestore();
    await assertFails(setDoc(doc(db, 'games/g1/racks/ada'), { tiles: 'ZZZZZZZ' }));
  });
});

describe('games/{gameId}/private (server tier — hidden information)', () => {
  it('the BAG is denied to players', async () => {
    const db = env.authenticatedContext('ada').firestore();
    await assertFails(getDoc(doc(db, 'games/g1/private/bag')));
  });

  it('the bag is denied to everyone else too', async () => {
    await assertFails(getDoc(doc(env.authenticatedContext('eve').firestore(), 'games/g1/private/bag')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'games/g1/private/bag')));
  });

  it('private docs cannot be listed or written', async () => {
    const db = env.authenticatedContext('ada').firestore();
    await assertFails(getDocs(collection(db, 'games/g1/private')));
    await assertFails(setDoc(doc(db, 'games/g1/private/bag'), { order: 'AAAA', drawn: 0 }));
  });
});

describe('invites/{code}', () => {
  it('any signed-in holder of the code can read the invite', async () => {
    const db = env.authenticatedContext('eve').firestore();
    await assertSucceeds(getDoc(doc(db, 'invites/CODE42')));
  });

  it('unauthenticated cannot read invites', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'invites/CODE42')));
  });

  it('invites cannot be listed or written by clients', async () => {
    const db = env.authenticatedContext('eve').firestore();
    await assertFails(getDocs(collection(db, 'invites')));
    await assertFails(setDoc(doc(db, 'invites/FORGED'), { gameId: 'g1', createdBy: 'eve' }));
  });
});
