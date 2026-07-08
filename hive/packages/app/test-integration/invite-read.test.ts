// Repro for the JoinFlow "invalid invite" e2e failure: a signed-in client
// reading invites/{code} through the client SDK (rules path), like JoinFlow.
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { configureFirebase, getAppAuth, getDb } from '@parlor/web/firebase';
import * as api from '../src/sync/gameApi';

configureFirebase({ emulatorProjectId: 'demo-hive', emulators: true });

const OPTIONS = { mosquito: true, ladybug: true, pillbug: true, tournamentOpening: true };

describe('invite read via client SDK', () => {
  it('a signed-in holder of the code can read the invite doc', async () => {
    await createUserWithEmailAndPassword(
      getAppAuth(),
      `holder-${Date.now()}@example.com`,
      'pw123456',
    );
    const { code } = await api.createGame({ options: OPTIONS, color: 'w' });
    const snap = await getDoc(doc(getDb(), 'invites', code));
    expect(snap.exists()).toBe(true);
    const data = snap.data() as { hostName: string; expiresAt: { toMillis(): number } };
    expect(data.expiresAt.toMillis()).toBeGreaterThan(Date.now());
  });
});
