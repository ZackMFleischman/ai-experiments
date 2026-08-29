// T7.11: the 3–4 player "guest list" lifecycle against the emulator suite —
// createGame at 3+ (a room, not a table: no seats, no deal), join-by-code
// (append, then auto-start at the maximum), invite / respond / leave, the
// host-only start with its stale-roster guard, turn order, and a regression
// check that the two-seat path is byte-for-byte what it always was.
import { RULESETS, parsePublic } from '@lex/engine';
import { describe, expect, it } from 'vitest';
import {
  OPTIONS,
  adminGetDoc,
  adminListDocs,
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
