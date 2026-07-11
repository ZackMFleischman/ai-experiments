// Create / join / submit / resign / rematch against the emulator suite —
// happy paths, side (turn-order) choice, the perfect-information setup (the
// full engine state on the doc, no private docs), turn/legality guards, and
// engine-derived terminal results (a capture that leaves the opponent with
// no moves). Runs inside `firebase emulators:exec` (see package.json).
import {
  deserializeCheckers,
  initialCheckers,
  serializeCheckers,
  type CheckersState,
} from '@checkers/engine';
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
    const res = await call('createGame', { options: { ...OPTIONS }, seat: 'dark' }, ada);
    expect(res.status).toBe(200);
    const { gameId, code } = res.result as { gameId: string; code: string };
    expect(code).toMatch(/^[A-Z2-9]{8}$/);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('open');
    expect((game?.['players'] as Record<string, unknown>)['dark']).toBe(ada.uid);
    expect((game?.['players'] as Record<string, unknown>)['light']).toBeNull();
    expect(game?.['toMove']).toBe('dark');
    expect(game?.['moveCount']).toBe(0);

    // Perfect information: the doc snapshot IS the initial engine state, and
    // no private or rack docs exist.
    const state = deserializeCheckers(game?.['state'] as string);
    expect(state).toEqual(initialCheckers());
    expect(await adminListDocs(`games/${gameId}/racks`)).toHaveLength(0);
    expect(await adminListDocs(`games/${gameId}/private`)).toHaveLength(0);

    const invite = await adminGetDoc(`invites/${code}`);
    expect(invite?.['gameId']).toBe(gameId);
    expect(invite?.['hostSeat']).toBe('dark');
  });

  it("seat 'light' leaves the dark seat open, dark still to move", async () => {
    const ada = await signUp('Ada');
    const res = await call('createGame', { options: { ...OPTIONS }, seat: 'light' }, ada);
    const { gameId } = res.result as { gameId: string };
    const game = await adminGetDoc(`games/${gameId}`);
    expect((game?.['players'] as Record<string, unknown>)['light']).toBe(ada.uid);
    expect((game?.['players'] as Record<string, unknown>)['dark']).toBeNull();
    expect(game?.['toMove']).toBe('dark');
  });

  it('rejects malformed options and sides', async () => {
    const ada = await signUp('Ada');
    const badTc = await call(
      'createGame',
      { options: { timeControl: { days: 2 } }, seat: 'dark' },
      ada,
    );
    expect(badTc.status).toBe(400);
    const badSeat = await call('createGame', { options: { ...OPTIONS }, seat: 'white' }, ada);
    expect(badSeat.status).toBe(400);
    const anon = await call('createGame', { options: { ...OPTIONS }, seat: 'dark' });
    expect(anon.status).toBe(401);
  });
});

describe('joinGame + submitMove', () => {
  it('plays the opening exchange through the callables', async () => {
    const { gameId, p0, p1 } = await createJoinedGame();
    const joined = await adminGetDoc(`games/${gameId}`);
    expect(joined?.['status']).toBe('active');

    // Dark man b3 steps to a4: (2,1)=17 → (3,0)=24 — dark moves down (+row).
    const first = await call(
      'submitMove',
      { gameId, expectedMoveCount: 0, move: { path: [17, 24] } },
      p0,
    );
    expect(first.status).toBe(200);
    let game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['moveCount']).toBe(1);
    expect(game?.['toMove']).toBe('light');
    const moves = await adminListDocs(`games/${gameId}/moves`);
    expect(moves).toHaveLength(1);
    expect(moves[0]?.['kind']).toBe('move');
    expect(moves[0]?.['path']).toEqual([17, 24]);
    expect(moves[0]?.['name']).toBe('b3-a4');

    // Light replies a6 → b5: (5,0)=40 → (4,1)=33 — light moves up (-row).
    const second = await call(
      'submitMove',
      { gameId, expectedMoveCount: 1, move: { path: [40, 33] } },
      p1,
    );
    expect(second.status).toBe(200);
    game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['toMove']).toBe('dark');
    const state = deserializeCheckers(game?.['state'] as string);
    expect(state.moveCount).toBe(2);
  });

  it('guards turn order, stale counts, and illegal moves', async () => {
    const { gameId, p0, p1 } = await createJoinedGame();

    const notYourTurn = await call(
      'submitMove',
      { gameId, expectedMoveCount: 0, move: { path: [40, 33] } },
      p1,
    );
    expect(notYourTurn.errorMessage).toMatch(/not your turn/);

    const stale = await call(
      'submitMove',
      { gameId, expectedMoveCount: 5, move: { path: [17, 24] } },
      p0,
    );
    expect(stale.errorMessage).toMatch(/stale/);

    // b3 → b4 lands on a light square — the engine says no.
    const illegal = await call(
      'submitMove',
      { gameId, expectedMoveCount: 0, move: { path: [17, 25] } },
      p0,
    );
    expect(illegal.status).toBe(400);
    expect(illegal.errorMessage).toMatch(/illegal move/);

    const malformed = await call(
      'submitMove',
      { gameId, expectedMoveCount: 0, move: { path: [17] } },
      p0,
    );
    expect(malformed.status).toBe(400);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['moveCount']).toBe(0); // nothing landed
  });

  it('an engine-terminal move finishes the game (jump takes the last man)', async () => {
    const { gameId, p1 } = await createJoinedGame();
    // Rig a light-to-move position with dark down to one man, en prise: the
    // light man on b5 jumps it to d3 and dark starts its turn with nothing
    // (the emulator admin bypass writes what a real game would reach).
    const board = Array.from({ length: 64 }, () => '.');
    board[26] = 'd'; // (3,2) c4 — dark's last man
    board[33] = 'l'; // (4,1) b5 — the jumper
    const rigged: CheckersState = {
      board: board.join(''),
      toMove: 'light',
      moveCount: 5,
      seen: {},
      result: null,
    };
    await adminUpdateDoc(`games/${gameId}`, {
      state: serializeCheckers(rigged),
      toMove: 'light',
      moveCount: 5,
    });

    const winning = await call(
      'submitMove',
      { gameId, expectedMoveCount: 5, move: { path: [33, 19] } },
      p1,
    );
    expect(winning.status).toBe(200);
    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('finished');
    expect(game?.['result']).toBe('light');
    expect(game?.['endedBy']).toBe('no-moves');
    const state = deserializeCheckers(game?.['state'] as string);
    expect(state.result).toEqual({ winner: 'light', by: 'no-moves' });
  });
});

describe('resign + rematch', () => {
  it('resign finishes for the opponent; rematch swaps sides', async () => {
    const { gameId, p0, p1 } = await createJoinedGame();
    const res = await call('resign', { gameId }, p0);
    expect(res.status).toBe(200);
    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('finished');
    expect(game?.['result']).toBe('light');
    expect(game?.['endedBy']).toBe('resign');

    const rematch = await call('rematch', { gameId }, p1);
    expect(rematch.status).toBe(200);
    const { gameId: nextId } = rematch.result as { gameId: string };
    const next = await adminGetDoc(`games/${nextId}`);
    expect(next?.['status']).toBe('active');
    // Sides swap: last game's light player (p1) opens as dark.
    expect((next?.['players'] as Record<string, unknown>)['dark']).toBe(p1.uid);
    expect((next?.['players'] as Record<string, unknown>)['light']).toBe(p0.uid);
    expect(deserializeCheckers(next?.['state'] as string)).toEqual(initialCheckers());
  });
});
