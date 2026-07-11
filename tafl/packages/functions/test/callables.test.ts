// Create / join / submit / resign / rematch against the emulator suite —
// happy paths, side (turn-order) choice, the perfect-information setup (the
// full engine state on the doc, no private docs), turn/legality guards, and
// engine-derived terminal results (king escape). Runs inside
// `firebase emulators:exec` (see package.json).
import {
  CORNERS,
  THRONE,
  deserializeTafl,
  initialTafl,
  serializeTafl,
  type TaflState,
} from '@tafl/engine';
import { describe, expect, it } from 'vitest';
import {
  OPTIONS,
  adminGetDoc,
  adminListDocs,
  adminUpdateDoc,
  call,
  createJoinedGame,
  signUp,
} from './helpers';

describe('createGame', () => {
  it('creates an open game + invite with the full engine state on the doc', async () => {
    const ada = await signUp('Ada');
    const res = await call('createGame', { options: { ...OPTIONS }, seat: 'attackers' }, ada);
    expect(res.status).toBe(200);
    const { gameId, code } = res.result as { gameId: string; code: string };
    expect(code).toMatch(/^[A-Z2-9]{8}$/);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('open');
    expect((game?.['players'] as Record<string, unknown>)['attackers']).toBe(ada.uid);
    expect((game?.['players'] as Record<string, unknown>)['defenders']).toBeNull();
    expect(game?.['toMove']).toBe('attackers');
    expect(game?.['moveCount']).toBe(0);

    // Perfect information: the doc snapshot IS the initial engine state, and
    // no private or rack docs exist.
    const state = deserializeTafl(game?.['state'] as string);
    expect(state).toEqual(initialTafl());
    expect(await adminListDocs(`games/${gameId}/racks`)).toHaveLength(0);
    expect(await adminListDocs(`games/${gameId}/private`)).toHaveLength(0);

    const invite = await adminGetDoc(`invites/${code}`);
    expect(invite?.['gameId']).toBe(gameId);
    expect(invite?.['hostSeat']).toBe('attackers');
  });

  it("seat 'defenders' leaves the attacker seat open, attackers still to move", async () => {
    const ada = await signUp('Ada');
    const res = await call('createGame', { options: { ...OPTIONS }, seat: 'defenders' }, ada);
    const { gameId } = res.result as { gameId: string };
    const game = await adminGetDoc(`games/${gameId}`);
    expect((game?.['players'] as Record<string, unknown>)['defenders']).toBe(ada.uid);
    expect((game?.['players'] as Record<string, unknown>)['attackers']).toBeNull();
    expect(game?.['toMove']).toBe('attackers');
  });

  it('rejects malformed options and sides', async () => {
    const ada = await signUp('Ada');
    const badTc = await call(
      'createGame',
      { options: { timeControl: { days: 2 } }, seat: 'attackers' },
      ada,
    );
    expect(badTc.status).toBe(400);
    const badSeat = await call('createGame', { options: { ...OPTIONS }, seat: 'white' }, ada);
    expect(badSeat.status).toBe(400);
    const anon = await call('createGame', { options: { ...OPTIONS }, seat: 'attackers' });
    expect(anon.status).toBe(401);
  });
});

describe('joinGame + submitMove', () => {
  it('plays the opening exchange through the callables', async () => {
    const { gameId, p0, p1 } = await createJoinedGame();
    const joined = await adminGetDoc(`games/${gameId}`);
    expect(joined?.['status']).toBe('active');

    // Attacker f2 → a2: (1,5)=16 → (1,0)=11 (rook move, clear rank).
    const first = await call(
      'submitMove',
      { gameId, expectedMoveCount: 0, move: { from: 16, to: 11 } },
      p0,
    );
    expect(first.status).toBe(200);
    let game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['moveCount']).toBe(1);
    expect(game?.['toMove']).toBe('defenders');
    const moves = await adminListDocs(`games/${gameId}/moves`);
    expect(moves).toHaveLength(1);
    expect(moves[0]?.['kind']).toBe('move');
    expect(moves[0]?.['from']).toBe(16);
    expect(moves[0]?.['to']).toBe(11);

    // Defender replies: (3,5)=38 → (3,3)=36.
    const second = await call(
      'submitMove',
      { gameId, expectedMoveCount: 1, move: { from: 38, to: 36 } },
      p1,
    );
    expect(second.status).toBe(200);
    game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['toMove']).toBe('attackers');
    const state = deserializeTafl(game?.['state'] as string);
    expect(state.moveCount).toBe(2);
  });

  it('guards turn order, stale counts, and illegal moves', async () => {
    const { gameId, p0, p1 } = await createJoinedGame();

    const notYourTurn = await call(
      'submitMove',
      { gameId, expectedMoveCount: 0, move: { from: 38, to: 36 } },
      p1,
    );
    expect(notYourTurn.errorMessage).toMatch(/not your turn/);

    const stale = await call(
      'submitMove',
      { gameId, expectedMoveCount: 5, move: { from: 16, to: 11 } },
      p0,
    );
    expect(stale.errorMessage).toMatch(/stale/);

    // A corner landing by a plain attacker is illegal — the engine says no.
    const illegal = await call(
      'submitMove',
      { gameId, expectedMoveCount: 0, move: { from: 3, to: 0 } },
      p0,
    );
    expect(illegal.status).toBe(400);
    expect(illegal.errorMessage).toMatch(/illegal move/);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['moveCount']).toBe(0); // nothing landed
  });

  it('an engine-terminal move finishes the game (king escape)', async () => {
    const { gameId, p1 } = await createJoinedGame();
    // Rig a defenders-to-move position with the king one step from a corner
    // (the emulator admin bypass writes what a real game would reach).
    const rigged: TaflState = {
      board: '.K' + '.'.repeat(59) + 'A' + '.'.repeat(29) + 'D' + '.'.repeat(29),
      toMove: 'defenders',
      moveCount: 4,
      seen: {},
      result: null,
    };
    expect(rigged.board).toHaveLength(121);
    expect(CORNERS).toContain(0);
    expect(rigged.board[THRONE]).toBe('.');
    await adminUpdateDoc(`games/${gameId}`, {
      state: serializeTafl(rigged),
      toMove: 'defenders',
      moveCount: 4,
    });

    const escape = await call(
      'submitMove',
      { gameId, expectedMoveCount: 4, move: { from: 1, to: 0 } },
      p1,
    );
    expect(escape.status).toBe(200);
    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('finished');
    expect(game?.['result']).toBe('defenders');
    expect(game?.['endedBy']).toBe('escape');
    const state = deserializeTafl(game?.['state'] as string);
    expect(state.result).toEqual({ winner: 'defenders', by: 'escape' });
  });
});

describe('resign + rematch', () => {
  it('resign finishes for the opponent; rematch swaps sides', async () => {
    const { gameId, p0, p1 } = await createJoinedGame();
    const res = await call('resign', { gameId }, p0);
    expect(res.status).toBe(200);
    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('finished');
    expect(game?.['result']).toBe('defenders');
    expect(game?.['endedBy']).toBe('resign');

    const rematch = await call('rematch', { gameId }, p1);
    expect(rematch.status).toBe(200);
    const { gameId: nextId } = rematch.result as { gameId: string };
    const next = await adminGetDoc(`games/${nextId}`);
    expect(next?.['status']).toBe('active');
    // Sides swap: last game's defender (p1) opens as attackers.
    expect((next?.['players'] as Record<string, unknown>)['attackers']).toBe(p1.uid);
    expect((next?.['players'] as Record<string, unknown>)['defenders']).toBe(p0.uid);
    expect(deserializeTafl(next?.['state'] as string)).toEqual(initialTafl());
  });
});
