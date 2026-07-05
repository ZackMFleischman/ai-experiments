// T4.1: callable factory + the cross-game api surface — name wiring and
// res.data unwrapping, with firebase/functions mocked out.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: Array<{ name: string; data: unknown }> = [];

vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string) => async (data: unknown) => {
    calls.push({ name, data });
    return { data: { echoedFrom: name } };
  },
}));

vi.mock('../src/firebase', () => ({
  getFns: () => ({}),
}));

import { callable, createGameApi } from '../src/gameApi';

beforeEach(() => {
  calls.length = 0;
});

describe('callable factory', () => {
  it('invokes the named callable and unwraps res.data', async () => {
    const ping = callable<{ x: number }, { echoedFrom: string }>('ping');
    const res = await ping({ x: 1 });
    expect(res).toEqual({ echoedFrom: 'ping' });
    expect(calls).toEqual([{ name: 'ping', data: { x: 1 } }]);
  });
});

describe('createGameApi', () => {
  it('wires every shared callable to its canonical name', async () => {
    const api = createGameApi<{ rulesetId: string }, 'me' | 'them' | 'random'>();
    await api.createGame({ options: { rulesetId: 'classic' }, seat: 'random' });
    await api.joinGame({ code: 'ABC123' });
    await api.cancelGame({ gameId: 'g1' });
    await api.challengeUser({ opponentUid: 'u2', options: { rulesetId: 'classic' }, seat: 'me' });
    await api.respondChallenge({ gameId: 'g1', accept: true });
    await api.resign({ gameId: 'g1' });
    await api.rematch({ gameId: 'g1' });
    expect(calls.map((c) => c.name)).toEqual([
      'createGame',
      'joinGame',
      'cancelGame',
      'challengeUser',
      'respondChallenge',
      'resign',
      'rematch',
    ]);
  });

  it('passes payloads through untouched', async () => {
    const api = createGameApi<{ dictionaryId: string }, 'them'>();
    await api.challengeUser({ opponentUid: 'u9', options: { dictionaryId: 'enable1' }, seat: 'them' });
    expect(calls[0]?.data).toEqual({
      opponentUid: 'u9',
      options: { dictionaryId: 'enable1' },
      seat: 'them',
    });
  });
});
