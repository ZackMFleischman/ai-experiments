// T4.4: createGame / joinGame / submitMove against the emulator suite —
// happy paths, turn enforcement, the optimistic-concurrency guard, engine
// rejection of illegal moves, non-player callers, and the snapshot ≡ replay
// regression check (DESIGN §5.2/§5.3).
import {
  applyMove,
  deserializeState,
  hash,
  initialState,
  parseUhp,
  type GameOptions,
} from '@hive/engine';
import { describe, expect, it } from 'vitest';
import { adminGetDoc, adminListDocs, call, signUp, type TestUser } from './helpers';

const OPTIONS: GameOptions = {
  mosquito: true,
  ladybug: true,
  pillbug: true,
  tournamentOpening: true,
};

async function createJoined(): Promise<{
  gameId: string;
  white: TestUser;
  black: TestUser;
}> {
  const ada = await signUp('Ada');
  const sam = await signUp('Sam');
  const created = await call('createGame', { options: OPTIONS, color: 'w' }, ada);
  expect(created.status).toBe(200);
  const { gameId, code } = created.result as { gameId: string; code: string };
  const joined = await call('joinGame', { code }, sam);
  expect(joined.status).toBe(200);
  return { gameId, white: ada, black: sam };
}

describe('createGame', () => {
  it('creates an open game + invite and returns both ids', async () => {
    const ada = await signUp('Ada');
    const res = await call('createGame', { options: OPTIONS, color: 'w' }, ada);
    expect(res.status).toBe(200);
    const { gameId, code } = res.result as { gameId: string; code: string };
    expect(gameId).toBeTruthy();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('open');
    expect(game?.['inviteCode']).toBe(code); // re-shareable while open (DESIGN §5.2)
    expect((game?.['players'] as Record<string, unknown>)['white']).toBe(ada.uid);
    expect((game?.['players'] as Record<string, unknown>)['black']).toBeNull();
    expect(game?.['moveCount']).toBe(0);
    // committed snapshot is a valid engine state
    expect(() => deserializeState(game?.['state'] as string)).not.toThrow();

    const invite = await adminGetDoc(`invites/${code}`);
    expect(invite?.['gameId']).toBe(gameId);
    expect(invite?.['hostName']).toBe('Ada');
    expect(invite?.['hostColor']).toBe('w');
  });

  it('requires auth', async () => {
    const res = await call('createGame', { options: OPTIONS, color: 'w' });
    expect(res.errorStatus).toBe('UNAUTHENTICATED');
  });

  it('rejects malformed options', async () => {
    const ada = await signUp('Ada');
    const res = await call('createGame', { options: { mosquito: 'yes' }, color: 'w' }, ada);
    expect(res.errorStatus).toBe('INVALID_ARGUMENT');
  });
});

describe('joinGame', () => {
  it('claims the open seat, activates the game, expires the invite', async () => {
    const ada = await signUp('Ada');
    const sam = await signUp('Sam');
    const created = await call('createGame', { options: OPTIONS, color: 'b' }, ada);
    const { gameId, code } = created.result as { gameId: string; code: string };

    const joined = await call('joinGame', { code }, sam);
    expect(joined.status).toBe(200);
    expect((joined.result as { gameId: string }).gameId).toBe(gameId);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('active');
    expect(game?.['inviteCode']).toBeUndefined(); // deleted on join
    const players = game?.['players'] as Record<string, unknown>;
    expect(players['black']).toBe(ada.uid); // creator picked black
    expect(players['white']).toBe(sam.uid);
    expect(game?.['playerIds']).toEqual(expect.arrayContaining([ada.uid, sam.uid]));

    expect(await adminGetDoc(`invites/${code}`)).toBeNull();

    const again = await call('joinGame', { code }, await signUp('Eve'));
    expect(again.errorStatus).toBe('NOT_FOUND');
  });

  it('rejects joining your own game', async () => {
    const ada = await signUp('Ada');
    const created = await call('createGame', { options: OPTIONS, color: 'w' }, ada);
    const { code } = created.result as { code: string };
    const res = await call('joinGame', { code }, ada);
    expect(res.errorStatus).toBe('FAILED_PRECONDITION');
  });

  it('rejects unknown codes', async () => {
    const res = await call('joinGame', { code: 'NOPE9999' }, await signUp('Eve'));
    expect(res.errorStatus).toBe('NOT_FOUND');
  });
});

describe('submitMove', () => {
  it('accepts a legal move, advances the doc, appends the move log', async () => {
    const { gameId, white } = await createJoined();
    const res = await call('submitMove', { gameId, expectedMoveCount: 0, uhpMove: 'wS1' }, white);
    expect(res.status).toBe(200);
    expect((res.result as { moveCount: number }).moveCount).toBe(1);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['toMove']).toBe('b');
    expect(game?.['moveCount']).toBe(1);
    const moves = await adminListDocs(`games/${gameId}/moves`);
    expect(moves).toHaveLength(1);
    expect(moves[0]?.['uhp']).toBe('wS1');
    expect(moves[0]?.['by']).toBe(white.uid);
  });

  it('enforces turn order', async () => {
    const { gameId, black } = await createJoined();
    const res = await call('submitMove', { gameId, expectedMoveCount: 0, uhpMove: 'bS1' }, black);
    expect(res.errorStatus).toBe('FAILED_PRECONDITION');
    expect(res.errorMessage).toMatch(/turn/i);
  });

  it('rejects a stale expectedMoveCount (optimistic-concurrency guard)', async () => {
    const { gameId, white, black } = await createJoined();
    await call('submitMove', { gameId, expectedMoveCount: 0, uhpMove: 'wS1' }, white);
    await call('submitMove', { gameId, expectedMoveCount: 1, uhpMove: 'bS1 wS1-' }, black);
    const res = await call('submitMove', { gameId, expectedMoveCount: 1, uhpMove: 'wQ -wS1' }, white);
    expect(res.errorStatus).toBe('FAILED_PRECONDITION');
    expect(res.errorMessage).toMatch(/stale/i);
  });

  it('rejects illegal moves via the engine (queen first under tournament opening)', async () => {
    const { gameId, white } = await createJoined();
    const res = await call('submitMove', { gameId, expectedMoveCount: 0, uhpMove: 'wQ' }, white);
    expect(res.errorStatus).toBe('INVALID_ARGUMENT');
  });

  it('rejects non-players', async () => {
    const { gameId } = await createJoined();
    const eve = await signUp('Eve');
    const res = await call('submitMove', { gameId, expectedMoveCount: 0, uhpMove: 'wS1' }, eve);
    expect(res.errorStatus).toBe('PERMISSION_DENIED');
  });

  it('keeps the snapshot consistent with replaying the move log', async () => {
    const { gameId, white, black } = await createJoined();
    const moves = ['wS1', 'bS1 wS1-', 'wQ -wS1', 'bQ bS1-'];
    for (const [i, uhp] of moves.entries()) {
      const player = i % 2 === 0 ? white : black;
      const res = await call('submitMove', { gameId, expectedMoveCount: i, uhpMove: uhp }, player);
      expect(res.status).toBe(200);
    }
    const game = await adminGetDoc(`games/${gameId}`);
    const snapshot = deserializeState(game?.['state'] as string);

    const log = (await adminListDocs(`games/${gameId}/moves`)).sort(
      (a, b) => (a['n'] as number) - (b['n'] as number),
    );
    let replayed = initialState(OPTIONS);
    for (const entry of log) {
      replayed = applyMove(replayed, parseUhp(entry['uhp'] as string, replayed));
    }
    expect(hash(snapshot)).toBe(hash(replayed));
    expect(game?.['moveCount']).toBe(4);
  });
});
