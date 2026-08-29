// T7.11: the 3–4 player "guest list" lifecycle against the emulator suite —
// createGame at 3+ (a room, not a table: no seats, no deal), join-by-code
// (append, then auto-start at the maximum), invite / respond / leave, the
// host-only start with its stale-roster guard, turn order, and a regression
// check that the two-seat path is byte-for-byte what it always was.
import {
  RULESETS,
  initialState,
  parsePublic,
  serializeState,
  type TileFace,
} from '@lex/engine';
import { describe, expect, it } from 'vitest';
import {
  OPTIONS,
  adminGetDoc,
  adminListDocs,
  adminSetDoc,
  call,
  createJoinedGame,
  signUp,
  type TestUser,
} from './helpers';

const classic = RULESETS['classic']!;
const RACK = classic.rackSize;

/** Open a guest-list room. `seat: 'me'` pins the host to seat 0, so every
 *  seat assignment below is deterministic rather than a coin flip. */
async function hostRoom(
  host: TestUser,
  maxPlayers: number,
  seat: unknown = 'me',
): Promise<{ gameId: string; code: string }> {
  const res = await call('createGame', { options: { ...OPTIONS, maxPlayers }, seat }, host);
  if (res.status !== 200) throw new Error(`createGame failed: ${res.errorMessage}`);
  return res.result as { gameId: string; code: string };
}

const entry = (user: TestUser, name: string) => ({ uid: user.uid, name });

describe('createGame at 3+ seats', () => {
  it('opens a guest-list room: a roster, a code, and no game state at all', async () => {
    const ada = await signUp('Ada');
    const { gameId, code } = await hostRoom(ada, 3);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('open');
    expect(game?.['maxPlayers']).toBe(3);
    expect(game?.['roster']).toEqual([entry(ada, 'Ada')]);
    expect(game?.['invited']).toEqual([]);
    expect(game?.['declined']).toEqual([]);
    expect(game?.['playerIds']).toEqual([ada.uid]);
    expect(game?.['inviteCode']).toBe(code); // always present while the room is open

    // Seats do not exist until the room starts: nothing is dealt, so nothing
    // about the game state may exist yet either.
    expect(game?.['players']).toBeUndefined();
    expect(game?.['toMove']).toBeUndefined();
    expect(game?.['public']).toBeUndefined();
    expect(game?.['scores']).toBeUndefined();
    expect(await adminGetDoc(`games/${gameId}/private/bag`)).toBeNull();
    expect(await adminListDocs(`games/${gameId}/racks`)).toHaveLength(0);

    const invite = await adminGetDoc(`invites/${code}`);
    const preview = invite?.['preview'];
    expect(preview).toEqual({ hostName: 'Ada', names: ['Ada'], filled: 1, maxPlayers: 3 });
    // Anyone signed in who holds the code can read invites/{code}, so the
    // preview must be uid-free — display names and counts only.
    expect(JSON.stringify(preview)).not.toContain(ada.uid);
  });

  it("validates maxPlayers against the selected ruleset's seat range", async () => {
    const ada = await signUp('Ada');
    for (const maxPlayers of [5, 1]) {
      const res = await call('createGame', { options: { ...OPTIONS, maxPlayers }, seat: 'me' }, ada);
      expect(res.errorStatus).toBe('INVALID_ARGUMENT');
    }
  });

  it('maxPlayers: 2 is still the old two-seat game, guest list and all absent', async () => {
    const ada = await signUp('Ada');
    const { gameId } = await hostRoom(ada, 2);
    const game = await adminGetDoc(`games/${gameId}`);
    expect((game?.['players'] as Record<string, unknown>)['p0']).toBe(ada.uid);
    expect(game?.['public']).toBeTruthy();
    expect(game?.['toMove']).toBe('p0');
    expect(game?.['maxPlayers']).toBeUndefined(); // the field is what makes a game a room
    expect(game?.['roster']).toBeUndefined();
  });
});

describe('joinGame into a guest-list room', () => {
  it('appends the joiner, refreshes the preview, and leaves the room open', async () => {
    const ada = await signUp('Ada');
    const sam = await signUp('Sam');
    const { gameId, code } = await hostRoom(ada, 3);

    const joined = await call('joinGame', { code }, sam);
    expect(joined.status).toBe(200);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('open'); // short of the maximum — still no deal
    expect(game?.['roster']).toEqual([entry(ada, 'Ada'), entry(sam, 'Sam')]);
    expect(game?.['playerIds']).toEqual([ada.uid, sam.uid]);
    expect(game?.['players']).toBeUndefined();
    expect(await adminListDocs(`games/${gameId}/racks`)).toHaveLength(0);

    const preview = (await adminGetDoc(`invites/${code}`))?.['preview'];
    expect(preview).toEqual({ hostName: 'Ada', names: ['Ada', 'Sam'], filled: 2, maxPlayers: 3 });
    expect(JSON.stringify(preview)).not.toContain(ada.uid);
    expect(JSON.stringify(preview)).not.toContain(sam.uid);

    const again = await call('joinGame', { code }, sam);
    expect(again.errorStatus).toBe('FAILED_PRECONDITION');
  });

  it('the joiner who fills the last place auto-starts the game', async () => {
    const ada = await signUp('Ada');
    const sam = await signUp('Sam');
    const eve = await signUp('Eve');
    const { gameId, code } = await hostRoom(ada, 3);
    expect((await call('joinGame', { code }, sam)).status).toBe(200);
    expect((await call('joinGame', { code }, eve)).status).toBe(200);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('active');
    expect(game?.['players']).toEqual({ p0: ada.uid, p1: sam.uid, p2: eve.uid });
    expect(game?.['playerNames']).toEqual({ p0: 'Ada', p1: 'Sam', p2: 'Eve' });
    expect(game?.['toMove']).toBe('p0');
    expect(game?.['moveCount']).toBe(0);
    expect(game?.['scores']).toEqual({ p0: 0, p1: 0, p2: 0 });
    expect(game?.['rackCounts']).toEqual({ p0: RACK, p1: RACK, p2: RACK });
    expect(game?.['bagCount']).toBe(100 - 3 * RACK);
    // The resolved order is frozen back onto the doc so a rematch and the UI
    // read the same list the deal used.
    expect(game?.['turnOrder']).toEqual({ mode: 'arrange', order: [ada.uid, sam.uid, eve.uid] });
    expect(game?.['inviteCode']).toBeUndefined();
    expect(await adminGetDoc(`invites/${code}`)).toBeNull();

    const pub = parsePublic(game?.['public'] as string);
    expect(pub.bagCount).toBe(100 - 3 * RACK);
    expect(pub.board.size).toBe(0);
    expect(game?.['public']).not.toContain('rack:'); // spot-check: no rack leak

    // Three racks, dealt off the private bag front in seat order — exactly as
    // the engine deals them, so server replay reproduces this table.
    const order = (await adminGetDoc(`games/${gameId}/private/bag`))?.['order'] as string;
    for (const [seat, user] of [ada, sam, eve].entries()) {
      const rack = await adminGetDoc(`games/${gameId}/racks/${user.uid}`);
      expect(rack?.['tiles']).toBe(order.slice(seat * RACK, (seat + 1) * RACK));
    }
    expect(await adminListDocs(`games/${gameId}/racks`)).toHaveLength(3);

    // The code retires with the room: a fourth arrival has nothing to join.
    const late = await call('joinGame', { code }, await signUp('Ivy'));
    expect(late.errorStatus).toBe('NOT_FOUND');
  });
});

describe('invitePlayers / respondInvite', () => {
  it('the host invites a past opponent, who gains read access to the game', async () => {
    const { p0: ada, p1: sam } = await createJoinedGame();
    const { gameId } = await hostRoom(ada, 3);

    const res = await call('invitePlayers', { gameId, uids: [sam.uid] }, ada);
    expect(res.status).toBe(200);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['invited']).toEqual([entry(sam, 'Sam')]);
    expect(game?.['roster']).toEqual([entry(ada, 'Ada')]); // an invitation reserves nothing
    // firestore.rules gates game reads on playerIds, and an invitee has to see
    // the game to answer it.
    expect(game?.['playerIds']).toEqual([ada.uid, sam.uid]);
  });

  it('declining moves the name to declined and never deletes the game', async () => {
    const { p0: ada, p1: sam } = await createJoinedGame();
    const { gameId, code } = await hostRoom(ada, 3);
    await call('invitePlayers', { gameId, uids: [sam.uid] }, ada);

    const res = await call('respondInvite', { gameId, accept: false }, sam);
    expect(res.status).toBe(200);
    expect((res.result as { started: boolean }).started).toBe(false);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('open'); // a two-seat decline deletes; a room's does not
    expect(game?.['declined']).toEqual([entry(sam, 'Sam')]);
    expect(game?.['invited']).toEqual([]);
    expect(game?.['roster']).toEqual([entry(ada, 'Ada')]);
    expect(game?.['playerIds']).toEqual([ada.uid]); // the read goes with the invitation
    expect(await adminGetDoc(`invites/${code}`)).not.toBeNull();
  });

  it('accepting puts the invitee on the roster', async () => {
    const { p0: ada, p1: sam } = await createJoinedGame();
    const { gameId, code } = await hostRoom(ada, 3);
    await call('invitePlayers', { gameId, uids: [sam.uid] }, ada);

    const res = await call('respondInvite', { gameId, accept: true }, sam);
    expect(res.status).toBe(200);
    expect((res.result as { started: boolean }).started).toBe(false); // 2 of 3

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('open');
    expect(game?.['roster']).toEqual([entry(ada, 'Ada'), entry(sam, 'Sam')]);
    expect(game?.['invited']).toEqual([]);
    expect((await adminGetDoc(`invites/${code}`))?.['preview']).toEqual({
      hostName: 'Ada',
      names: ['Ada', 'Sam'],
      filled: 2,
      maxPlayers: 3,
    });
  });

  it('rejects inviting somebody you have never played', async () => {
    const ada = await signUp('Ada');
    const eve = await signUp('Eve');
    const { gameId } = await hostRoom(ada, 3);
    const res = await call('invitePlayers', { gameId, uids: [eve.uid] }, ada);
    expect(res.errorStatus).toBe('FAILED_PRECONDITION');
  });

  it('rejects a non-host inviting', async () => {
    const { p0: ada, p1: sam } = await createJoinedGame();
    const { gameId, code } = await hostRoom(ada, 3);
    await call('joinGame', { code }, sam);
    const res = await call('invitePlayers', { gameId, uids: [ada.uid] }, sam);
    expect(res.errorStatus).toBe('PERMISSION_DENIED');
  });
});

describe('leaveGame', () => {
  it('a guest leaving drops them from the list; the game survives', async () => {
    const ada = await signUp('Ada');
    const sam = await signUp('Sam');
    const { gameId, code } = await hostRoom(ada, 3);
    await call('joinGame', { code }, sam);

    const res = await call('leaveGame', { gameId }, sam);
    expect(res.status).toBe(200);
    expect((res.result as { deleted: boolean }).deleted).toBe(false);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('open');
    expect(game?.['roster']).toEqual([entry(ada, 'Ada')]);
    expect(game?.['playerIds']).toEqual([ada.uid]);
    expect(game?.['declined']).toEqual([]); // leaving is not declining
  });

  it('the host leaving promotes the next arrival, and the invite follows', async () => {
    const ada = await signUp('Ada');
    const sam = await signUp('Sam');
    const { gameId, code } = await hostRoom(ada, 3);
    await call('joinGame', { code }, sam);

    const res = await call('leaveGame', { gameId }, ada);
    expect(res.status).toBe(200);
    expect((res.result as { deleted: boolean }).deleted).toBe(false);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['roster']).toEqual([entry(sam, 'Sam')]); // roster[0] IS the host
    expect(game?.['playerIds']).toEqual([sam.uid]);

    const invite = await adminGetDoc(`invites/${code}`);
    expect(invite?.['hostName']).toBe('Sam');
    expect(invite?.['preview']).toEqual({
      hostName: 'Sam',
      names: ['Sam'],
      filled: 1,
      maxPlayers: 3,
    });

    // The promoted host can now start — the promotion is real, not cosmetic.
    expect((await call('setTurnOrder', { gameId, turnOrder: { mode: 'random' } }, sam)).status).toBe(
      200,
    );
  });

  it('the last one out deletes the game and its invite', async () => {
    const ada = await signUp('Ada');
    const { gameId, code } = await hostRoom(ada, 3);
    const res = await call('leaveGame', { gameId }, ada);
    expect(res.status).toBe(200);
    expect((res.result as { deleted: boolean }).deleted).toBe(true);
    expect(await adminGetDoc(`games/${gameId}`)).toBeNull();
    expect(await adminGetDoc(`invites/${code}`)).toBeNull();
  });
});

describe('startGame', () => {
  it('is host-only', async () => {
    const ada = await signUp('Ada');
    const sam = await signUp('Sam');
    const { gameId, code } = await hostRoom(ada, 3);
    await call('joinGame', { code }, sam);
    const res = await call('startGame', { gameId, expectedRoster: [ada.uid, sam.uid] }, sam);
    expect(res.errorStatus).toBe('PERMISSION_DENIED');
    expect((await adminGetDoc(`games/${gameId}`))?.['status']).toBe('open');
  });

  it('refuses a stale expectedRoster so a late joiner is never locked out', async () => {
    const ada = await signUp('Ada');
    const sam = await signUp('Sam');
    const { gameId, code } = await hostRoom(ada, 3);
    await call('joinGame', { code }, sam);

    // The host confirms against the list they were looking at — one that no
    // longer holds Sam, who joined a moment ago.
    const res = await call('startGame', { gameId, expectedRoster: [ada.uid] }, ada);
    expect(res.errorStatus).toBe('FAILED_PRECONDITION');
    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('open');
    expect(game?.['players']).toBeUndefined();
    expect(await adminListDocs(`games/${gameId}/racks`)).toHaveLength(0);
  });

  it('starts early with two of three places filled', async () => {
    const ada = await signUp('Ada');
    const sam = await signUp('Sam');
    const { gameId, code } = await hostRoom(ada, 3);
    await call('joinGame', { code }, sam);

    const res = await call('startGame', { gameId, expectedRoster: [ada.uid, sam.uid] }, ada);
    expect(res.status).toBe(200);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('active');
    // The chosen count is a maximum: the table is dealt for who actually came.
    const players = game?.['players'] as Record<string, unknown>;
    expect(Object.keys(players).sort()).toEqual(['p0', 'p1']);
    expect(players).toEqual({ p0: ada.uid, p1: sam.uid });
    expect(game?.['scores']).toEqual({ p0: 0, p1: 0 });
    expect(game?.['rackCounts']).toEqual({ p0: RACK, p1: RACK });
    expect(game?.['bagCount']).toBe(100 - 2 * RACK);
    expect(game?.['toMove']).toBe('p0');
    expect(await adminListDocs(`games/${gameId}/racks`)).toHaveLength(2);
    expect(await adminGetDoc(`invites/${code}`)).toBeNull();
  });

  it('seats an explicit arrangement passed at start', async () => {
    const ada = await signUp('Ada');
    const sam = await signUp('Sam');
    const eve = await signUp('Eve');
    const { gameId, code } = await hostRoom(ada, 4);
    await call('joinGame', { code }, sam);
    await call('joinGame', { code }, eve);

    const res = await call(
      'startGame',
      {
        gameId,
        expectedRoster: [ada.uid, sam.uid, eve.uid],
        turnOrder: { mode: 'arrange', order: [eve.uid, ada.uid, sam.uid] },
      },
      ada,
    );
    expect(res.status).toBe(200);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['players']).toEqual({ p0: eve.uid, p1: ada.uid, p2: sam.uid });
    expect(game?.['playerNames']).toEqual({ p0: 'Eve', p1: 'Ada', p2: 'Sam' });
    expect(game?.['roster']).toEqual([entry(eve, 'Eve'), entry(ada, 'Ada'), entry(sam, 'Sam')]);
    expect(game?.['turnOrder']).toEqual({ mode: 'arrange', order: [eve.uid, ada.uid, sam.uid] });

    // Seat 0 draws first: the arrangement drives the deal, not join order.
    const order = (await adminGetDoc(`games/${gameId}/private/bag`))?.['order'] as string;
    expect((await adminGetDoc(`games/${gameId}/racks/${eve.uid}`))?.['tiles']).toBe(
      order.slice(0, RACK),
    );
  });
});

describe('setTurnOrder', () => {
  it('persists the host arrangement on the game doc before the start', async () => {
    const ada = await signUp('Ada');
    const sam = await signUp('Sam');
    const { gameId, code } = await hostRoom(ada, 3);
    await call('joinGame', { code }, sam);

    const res = await call(
      'setTurnOrder',
      { gameId, turnOrder: { mode: 'arrange', order: [sam.uid, ada.uid] } },
      ada,
    );
    expect(res.status).toBe(200);

    const game = await adminGetDoc(`games/${gameId}`);
    // It lands on the GAME doc, which every roster member may read — the point
    // is that the arrangement is visible before the game begins, not after.
    expect(game?.['turnOrder']).toEqual({ mode: 'arrange', order: [sam.uid, ada.uid] });
    expect(game?.['playerIds']).toEqual([ada.uid, sam.uid]);
    expect(game?.['status']).toBe('open'); // setting the order does not start anything

    const started = await call('startGame', { gameId, expectedRoster: [ada.uid, sam.uid] }, ada);
    expect(started.status).toBe(200);
    expect((await adminGetDoc(`games/${gameId}`))?.['players']).toEqual({
      p0: sam.uid,
      p1: ada.uid,
    });
  });

  it('is host-only and rejects an arrangement naming somebody outside the game', async () => {
    const ada = await signUp('Ada');
    const sam = await signUp('Sam');
    const eve = await signUp('Eve');
    const { gameId, code } = await hostRoom(ada, 3);
    await call('joinGame', { code }, sam);

    const fromGuest = await call('setTurnOrder', { gameId, turnOrder: { mode: 'random' } }, sam);
    expect(fromGuest.errorStatus).toBe('PERMISSION_DENIED');

    const outsider = await call(
      'setTurnOrder',
      { gameId, turnOrder: { mode: 'arrange', order: [ada.uid, eve.uid] } },
      ada,
    );
    expect(outsider.errorStatus).toBe('FAILED_PRECONDITION');
    expect((await adminGetDoc(`games/${gameId}`))?.['turnOrder']).toEqual({
      mode: 'host-seat',
      seat: 0,
    });
  });
});

describe('the two-seat path', () => {
  it('keeps its old doc shape and refuses every guest-list callable', async () => {
    const { gameId, p0: ada, p1: sam } = await createJoinedGame();

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['players']).toEqual({ p0: ada.uid, p1: sam.uid });
    expect(game?.['scores']).toEqual({ p0: 0, p1: 0 });
    expect(game?.['toMove']).toBe('p0');
    expect(game?.['public']).toBeTruthy();
    expect(game?.['maxPlayers']).toBeUndefined();
    expect(game?.['roster']).toBeUndefined();

    // The guest-list callables are exported for every game, so each one has to
    // refuse a doc that has no guest list.
    const started = await call('startGame', { gameId, expectedRoster: [ada.uid, sam.uid] }, ada);
    expect(started.errorStatus).toBe('FAILED_PRECONDITION');
    const responded = await call('respondInvite', { gameId, accept: true }, sam);
    expect(responded.errorStatus).toBe('FAILED_PRECONDITION');
    const left = await call('leaveGame', { gameId }, sam);
    expect(left.errorStatus).toBe('FAILED_PRECONDITION');
    const invited = await call('invitePlayers', { gameId, uids: [sam.uid] }, ada);
    expect(invited.errorStatus).toBe('FAILED_PRECONDITION');
    const ordered = await call('setTurnOrder', { gameId, turnOrder: { mode: 'random' } }, ada);
    expect(ordered.errorStatus).toBe('FAILED_PRECONDITION');
  });
});

// T7.7: a seat leaving a RUNNING 3+ game is a withdrawal, not an ending —
// score frozen, rack back to the bag, turn order closed over the gap, and the
// game finishes only when one active player is left standing.
describe('withdrawal at 3+ seats', () => {
  /** Ada (p0), Sam (p1), Eve (p2): the third join fills the room and deals. */
  async function threeHanded(): Promise<{
    gameId: string;
    p0: TestUser;
    p1: TestUser;
    p2: TestUser;
  }> {
    const ada = await signUp('Ada');
    const sam = await signUp('Sam');
    const eve = await signUp('Eve');
    const { gameId, code } = await hostRoom(ada, 3);
    for (const guest of [sam, eve]) {
      const joined = await call('joinGame', { code }, guest);
      if (joined.status !== 200) throw new Error(`joinGame failed: ${joined.errorMessage}`);
    }
    return { gameId, p0: ada, p1: sam, p2: eve };
  }

  const TILES = Object.values(classic.tiles.counts).reduce((sum, n) => sum + n, 0);

  /** The invariant the whole withdrawal design turns on: a withdrawal only
   *  MOVES tiles (rack → bag), so bag + racks + board is still the tileset. */
  function expectTileConservation(publicText: unknown): void {
    const pub = parsePublic(publicText as string);
    const racked = pub.rackCounts.reduce((sum, n) => sum + n, 0);
    expect(pub.bagCount + racked + pub.board.size).toBe(TILES);
  }

  const moveCountOf = async (gameId: string): Promise<number> =>
    (await adminGetDoc(`games/${gameId}`))?.['moveCount'] as number;

  // A deterministic three-hand deal (the rig submit-move.test.ts uses): Ada
  // C A T S Q J X, Sam D O G E R N U, Eve B I M P H V W, then the rest of the
  // classic multiset. It buys ONE thing the random deal cannot — a played word,
  // so a leaver can walk out holding a score the survivor never matches.
  const RACKS3 = ['CATSQJX', 'DOGERNU', 'BIMPHVW'] as const;
  const BAG3: TileFace[] = (() => {
    const remaining = new Map<string, number>(Object.entries(classic.tiles.counts));
    for (const face of RACKS3.join('')) remaining.set(face, (remaining.get(face) ?? 0) - 1);
    const rest: string[] = [];
    for (const [face, count] of remaining) {
      if (count < 0) throw new Error(`rigged racks overdraw '${face}'`);
      for (let i = 0; i < count; i++) rest.push(face);
    }
    return [...RACKS3.join(''), ...rest] as TileFace[];
  })();
  const RIGGED3 = initialState(classic, BAG3, 3);

  /** CATS across the centre: 6 doubled by the centre DW = 12 for seat 0. */
  const CATS_PLAY = {
    type: 'play',
    placements: [
      { row: 7, col: 7, letter: 'C', isBlank: false },
      { row: 7, col: 8, letter: 'A', isBlank: false },
      { row: 7, col: 9, letter: 'T', isBlank: false },
      { row: 7, col: 10, letter: 'S', isBlank: false },
    ],
  };

  /** Swap the hidden state for the rig. The public snapshot needs no patch:
   *  board, scores and counts are identical for any fresh three-hand deal. */
  async function riggedThree(): Promise<Awaited<ReturnType<typeof threeHanded>>> {
    const game = await threeHanded();
    for (const [seat, user] of [game.p0, game.p1, game.p2].entries()) {
      await adminSetDoc(`games/${game.gameId}/racks/${user.uid}`, {
        tiles: RIGGED3.racks[seat]!.join(''),
        n: 0,
      });
    }
    await adminSetDoc(`games/${game.gameId}/private/bag`, {
      order: BAG3.join(''),
      drawn: 3 * RACK,
      state: serializeState(RIGGED3),
      events: [],
    });
    return game;
  }

  it('does not end the game: the seat is marked withdrawn and play continues', async () => {
    const { gameId, p0, p1 } = await threeHanded();
    const res = await call('resign', { gameId }, p1);
    expect(res.status).toBe(200);
    expect((res.result as { finished: boolean }).finished).toBe(false);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('active');
    expect(game?.['withdrawn']).toEqual(['p1']);
    expect(game?.['result']).toBeUndefined();
    expect(game?.['endedBy']).toBeUndefined();
    expect(game?.['moveCount']).toBe(1);

    // The resign is logged like any other meta move, and the table is live:
    // the player to move can still play.
    const moves = await adminListDocs(`games/${gameId}/moves`);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ kind: 'resign', by: p1.uid });
    const passed = await call(
      'submitMove',
      { gameId, expectedMoveCount: 1, move: { type: 'pass' } },
      p0,
    );
    expect(passed.status).toBe(200);
  });

  it("returns the leaver's tiles to the bag, conserving the tileset", async () => {
    const { gameId, p1 } = await threeHanded();
    const before = await adminGetDoc(`games/${gameId}`);
    expect(before?.['bagCount']).toBe(TILES - 3 * RACK);

    expect((await call('resign', { gameId }, p1)).status).toBe(200);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['bagCount']).toBe((before?.['bagCount'] as number) + RACK);
    expect(game?.['rackCounts']).toEqual({ p0: RACK, p1: 0, p2: RACK });
    // The rack DOC empties too — a withdrawn player must not keep a hand the
    // client could still render (or a leak the bag now also holds).
    expect((await adminGetDoc(`games/${gameId}/racks/${p1.uid}`))?.['tiles']).toBe('');
    expectTileConservation(game?.['public']);

    const pub = parsePublic(game?.['public'] as string);
    expect(pub.rackCounts).toEqual([RACK, 0, RACK]);
    expect(pub.withdrawn).toEqual([1]); // the public snapshot names the gap
  });

  it('skips the withdrawn seat in the turn order for good', async () => {
    const { gameId, p0, p1, p2 } = await threeHanded();
    const wasToMove = (await adminGetDoc(`games/${gameId}`))?.['toMove'];
    expect((await call('resign', { gameId }, p1)).status).toBe(200);

    const game = await adminGetDoc(`games/${gameId}`);
    // p1 leaving only moves the turn on if the turn was theirs.
    expect(game?.['toMove']).toBe(wasToMove === 'p1' ? 'p2' : wasToMove);

    // Four passes is a full lap and a half of the two seats still playing —
    // p1 must never come up again (and 4 < the 6-turn scoreless limit at two
    // active seats, so this does not end the game).
    const seen: unknown[] = [game?.['toMove']];
    const bySeat: Record<string, TestUser> = { p0, p1, p2 };
    for (let i = 0; i < 4; i++) {
      const current = (await adminGetDoc(`games/${gameId}`))?.['toMove'] as string;
      const moved = await call(
        'submitMove',
        {
          gameId,
          expectedMoveCount: await moveCountOf(gameId),
          move: { type: 'pass' },
        },
        bySeat[current]!,
      );
      expect(moved.status).toBe(200);
      seen.push((await adminGetDoc(`games/${gameId}`))?.['toMove']);
    }
    expect(seen).not.toContain('p1');
    expect((await adminGetDoc(`games/${gameId}`))?.['status']).toBe('active');
  });

  it('locks the withdrawn player out of moving or leaving twice', async () => {
    const { gameId, p1 } = await threeHanded();
    expect((await call('resign', { gameId }, p1)).status).toBe(200);

    const moved = await call(
      'submitMove',
      { gameId, expectedMoveCount: await moveCountOf(gameId), move: { type: 'pass' } },
      p1,
    );
    expect(moved.errorStatus).toBe('FAILED_PRECONDITION');
    const again = await call('resign', { gameId }, p1);
    expect(again.errorStatus).toBe('FAILED_PRECONDITION');
    expect((await adminGetDoc(`games/${gameId}`))?.['withdrawn']).toEqual(['p1']); // not doubled
  });

  it('ends by last-standing on the second withdrawal, survivor first', async () => {
    const { gameId, p0, p1, p2 } = await riggedThree();
    // Ada banks 12 before walking out, so the SURVIVOR ends on the lower
    // score — the placing has to reward staying, not scoring.
    expect(
      (await call('submitMove', { gameId, expectedMoveCount: 0, move: CATS_PLAY }, p0)).status,
    ).toBe(200);
    expect((await adminGetDoc(`games/${gameId}`))?.['scores']).toEqual({ p0: 12, p1: 0, p2: 0 });

    expect((await call('resign', { gameId }, p0)).status).toBe(200);
    const last = await call('resign', { gameId }, p1);
    expect(last.status).toBe(200);
    expect((last.result as { finished: boolean }).finished).toBe(true);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('finished');
    expect(game?.['endedBy']).toBe('last-standing');
    expect(game?.['result']).toBe('p2');
    expect(game?.['withdrawn']).toEqual(['p0', 'p1']);
    expect(game?.['scores']).toEqual({ p0: 12, p1: 0, p2: 0 });
    // A placing is a MAP of tied seats, not a bare list — Firestore rejects an
    // array nested directly inside an array.
    const standings = game?.['standings'] as { seats: string[] }[];
    expect(standings?.[0]).toEqual({ seats: ['p2'] }); // Eve is first on 0 against Ada's 12
    expect(standings).toEqual([{ seats: ['p2'] }, { seats: ['p0'] }, { seats: ['p1'] }]);
    expectTileConservation(game?.['public']);

    // A finished game takes nothing more.
    expect((await call('resign', { gameId }, p2)).errorStatus).toBe('FAILED_PRECONDITION');
  });

  it('leaves the two-seat game terminal on resign, with no withdrawn field', async () => {
    const { gameId, p0: ada } = await createJoinedGame();
    const res = await call('resign', { gameId }, ada);
    expect(res.status).toBe(200);
    expect((res.result as { finished: boolean }).finished).toBe(true);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('finished');
    expect(game?.['result']).toBe('p1');
    expect(game?.['endedBy']).toBe('resign');
    // Withdrawal machinery must stay invisible at two seats: no marker, no
    // standings, no re-dealt bag.
    expect(game?.['withdrawn']).toBeUndefined();
    expect(game?.['standings']).toBeUndefined();
    expect(game?.['bagCount']).toBe(TILES - 2 * RACK);
  });
});
