// T4.3: security rules per DESIGN §5.2/§5.3 — clients get no write access to
// games/* or invites/*; game docs are readable only by their two players;
// invites by anyone signed in holding the code; users/{uid} is own-doc only.
// Runs inside `firebase emulators:exec` (see package.json test script).
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
    projectId: 'demo-hive',
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
      players: { white: 'ada', black: 'sam' },
      playerIds: ['ada', 'sam'],
      status: 'active',
      toMove: 'w',
      updatedAt: 1,
    });
    await setDoc(doc(db, 'games/g1/moves/0'), { n: 0, kind: 'move', uhp: 'wS1', by: 'ada' });
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

describe('games/{gameId}', () => {
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
    await assertFails(updateDoc(doc(db, 'games/g1'), { toMove: 'b' }));
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
    await assertFails(setDoc(doc(db, 'games/g1/moves/1'), { n: 1, kind: 'move', uhp: 'bS1 wS1-', by: 'ada' }));
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
