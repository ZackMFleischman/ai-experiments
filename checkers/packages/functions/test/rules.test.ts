// Security rules — the parlor base three tiers, verbatim (checkers is perfect-
// information: no rack/bag override). Clients get no write access to games/*
// or invites/*; game docs + move logs are readable only by their two
// players; the only client-writable doc is your own users/{uid}. The
// negative cases here are a security invariant, not a convention. Runs
// inside `firebase emulators:exec` (see package.json).
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
import { initialCheckers, serializeCheckers } from '@checkers/engine';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-checkers',
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
      players: { attackers: 'ada', defenders: 'sam' },
      playerNames: { attackers: 'Ada', defenders: 'Sam' },
      playerIds: ['ada', 'sam'],
      options: { timeControl: null },
      status: 'active',
      toMove: 'attackers',
      moveCount: 1,
      state: serializeCheckers(initialCheckers()),
      updatedAt: 1,
    });
    await setDoc(doc(db, 'games/g1/moves/0'), {
      n: 0,
      kind: 'move',
      from: 10,
      to: 7,
      name: 'd6-a6',
      by: 'ada',
      at: 1,
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

describe('games/{gameId}', () => {
  it('players read their game; outsiders and anon do not', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('ada').firestore(), 'games/g1')));
    await assertSucceeds(getDoc(doc(env.authenticatedContext('sam').firestore(), 'games/g1')));
    await assertFails(getDoc(doc(env.authenticatedContext('eve').firestore(), 'games/g1')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'games/g1')));
  });

  it('nobody writes a game doc from the client — not even a player', async () => {
    const db = env.authenticatedContext('ada').firestore();
    await assertFails(updateDoc(doc(db, 'games/g1'), { toMove: 'defenders' }));
    await assertFails(updateDoc(doc(db, 'games/g1'), { status: 'finished', result: 'attackers' }));
    await assertFails(setDoc(doc(db, 'games/g2'), { players: {}, playerIds: ['ada'] }));
  });

  it('players list their own games; a stranger cannot query others in', async () => {
    const mine = env.authenticatedContext('ada').firestore();
    await assertSucceeds(
      getDocs(query(collection(mine, 'games'), where('playerIds', 'array-contains', 'ada'))),
    );
    const eve = env.authenticatedContext('eve').firestore();
    await assertFails(
      getDocs(query(collection(eve, 'games'), where('playerIds', 'array-contains', 'ada'))),
    );
  });

  it('the move log is player-read, never client-written', async () => {
    const ada = env.authenticatedContext('ada').firestore();
    await assertSucceeds(getDocs(query(collection(ada, 'games/g1/moves'), orderBy('n'))));
    const eve = env.authenticatedContext('eve').firestore();
    await assertFails(getDocs(query(collection(eve, 'games/g1/moves'), orderBy('n'))));
    await assertFails(
      setDoc(doc(ada, 'games/g1/moves/1'), { n: 1, kind: 'move', from: 17, to: 14, by: 'ada' }),
    );
  });
});

describe('invites/{code}', () => {
  it('any signed-in code-holder may get; list and writes are denied', async () => {
    const sam = env.authenticatedContext('sam').firestore();
    await assertSucceeds(getDoc(doc(sam, 'invites/CODE42')));
    await assertFails(getDocs(collection(sam, 'invites')));
    await assertFails(setDoc(doc(sam, 'invites/HACK'), { gameId: 'g1' }));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'invites/CODE42')));
  });
});

describe('default deny', () => {
  it('anything outside the three tiers is unreachable', async () => {
    const db = env.authenticatedContext('ada').firestore();
    await assertFails(getDoc(doc(db, 'anything/else')));
    await assertFails(setDoc(doc(db, 'anything/else'), { x: 1 }));
  });
});
