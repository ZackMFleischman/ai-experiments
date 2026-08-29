// ported from hive/packages/functions/test/callables.test.ts (adapted)
// T4.4: create / join / cancel / challenge / respond / rematch / resign
// against the emulator suite — happy paths, registry validation, seat
// (turn-order) choice, hidden-information setup (bag persisted private,
// racks dealt per seat exactly as the engine deals), and invite lifecycle.
import { RULESETS, parsePublic } from '@lex/engine';
import { describe, expect, it } from 'vitest';
import {
  OPTIONS,
  adminGetDoc,
  adminListDocs,
  call,
  createJoinedGame,
  signUp,
} from './helpers';

const classic = RULESETS['classic']!;

/** The full classic multiset as a sorted string, for permutation checks. */
const CLASSIC_TILES = Object.entries(classic.tiles.counts)
  .flatMap(([face, count]) => Array.from({ length: count }, () => face))
  .sort()
  .join('');

describe('createGame', () => {
  it('creates an open game + invite with the full hidden-information setup', async () => {
    const ada = await signUp('Ada');
    const res = await call('createGame', { options: { ...OPTIONS }, seat: 'me' }, ada);
    expect(res.status).toBe(200);
    const { gameId, code } = res.result as { gameId: string; code: string };
    expect(gameId).toBeTruthy();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('open');
    expect(game?.['inviteCode']).toBe(code); // re-shareable while open
    expect((game?.['players'] as Record<string, unknown>)['p0']).toBe(ada.uid);
    expect((game?.['players'] as Record<string, unknown>)['p1']).toBeNull();
    expect(game?.['toMove']).toBe('p0');
    expect(game?.['moveCount']).toBe(0);
    expect(game?.['bagCount']).toBe(100 - 2 * classic.rackSize);
    expect(game?.['rackCounts']).toEqual({ p0: classic.rackSize, p1: classic.rackSize });
    expect(game?.['scores']).toEqual({ p0: 0, p1: 0 });

    // The public snapshot is a valid engine projection with no rack in it.
    const pub = parsePublic(game?.['public'] as string);
    expect(pub.bagCount).toBe(100 - 2 * classic.rackSize);
    expect(pub.board.size).toBe(0);
    expect(game?.['public']).not.toContain('rack:'); // spot-check: no rack leak

    // Creator's rack dealt from the bag front, exactly as the engine deals.
    const bag = await adminGetDoc(`games/${gameId}/private/bag`);
    const order = bag?.['order'] as string;
    expect(order).toHaveLength(100);
    expect(order.split('').sort().join('')).toBe(CLASSIC_TILES); // true permutation
    expect(bag?.['drawn']).toBe(2 * classic.rackSize);
    expect(bag?.['events']).toEqual([]);

    const rack = await adminGetDoc(`games/${gameId}/racks/${ada.uid}`);
    expect(rack?.['tiles']).toBe(order.slice(0, classic.rackSize));

    // Only the creator's rack exists while the game is open.
    expect(await adminListDocs(`games/${gameId}/racks`)).toHaveLength(1);

    const invite = await adminGetDoc(`invites/${code}`);
    expect(invite?.['gameId']).toBe(gameId);
    expect(invite?.['hostName']).toBe('Ada');
    expect(invite?.['hostSeat']).toBe('p0');
    expect((invite?.['options'] as Record<string, unknown>)['rulesetId']).toBe('classic');
    expect((invite?.['options'] as Record<string, unknown>)['dictionaryId']).toBe('enable1');
  });

  it("seat 'them' makes the creator p1 (opponent moves first)", async () => {
    const ada = await signUp('Ada');
    const res = await call('createGame', { options: { ...OPTIONS }, seat: 'them' }, ada);
    const { gameId } = res.result as { gameId: string };
    const game = await adminGetDoc(`games/${gameId}`);
    expect((game?.['players'] as Record<string, unknown>)['p1']).toBe(ada.uid);
    expect((game?.['players'] as Record<string, unknown>)['p0']).toBeNull();
    expect(game?.['toMove']).toBe('p0');
  });

  it('requires auth', async () => {
    const res = await call('createGame', { options: { ...OPTIONS }, seat: 'me' });
    expect(res.errorStatus).toBe('UNAUTHENTICATED');
  });

  it('validates rulesetId and dictionaryId against the registries', async () => {
    const ada = await signUp('Ada');
    const badRules = await call(
      'createGame',
      { options: { ...OPTIONS, rulesetId: 'quantum' }, seat: 'me' },
      ada,
    );
    expect(badRules.errorStatus).toBe('INVALID_ARGUMENT');
    const badDict = await call(
      'createGame',
      { options: { ...OPTIONS, dictionaryId: 'klingon' }, seat: 'me' },
      ada,
    );
    expect(badDict.errorStatus).toBe('INVALID_ARGUMENT');
    const badTc = await call(
      'createGame',
      { options: { ...OPTIONS, timeControl: { days: 2 } }, seat: 'me' },
      ada,
    );
    expect(badTc.errorStatus).toBe('INVALID_ARGUMENT');
    const badSeat = await call('createGame', { options: { ...OPTIONS }, seat: 'both' }, ada);
    expect(badSeat.errorStatus).toBe('INVALID_ARGUMENT');
  });

  it('accepts the modern ruleset + everyday dictionary pairing', async () => {
    const ada = await signUp('Ada');
    const res = await call(
      'createGame',
      { options: { rulesetId: 'modern', dictionaryId: '2of12inf', timeControl: null }, seat: 'me' },
      ada,
    );
    expect(res.status).toBe(200);
  });
});

describe('joinGame', () => {
  it('claims the open seat, deals the joiner rack, activates, expires the invite', async () => {
    const ada = await signUp('Ada');
    const sam = await signUp('Sam');
    const created = await call(
      'createGame',
      { options: { ...OPTIONS, timeControl: { days: 3 } }, seat: 'them' },
      ada,
    );
    const { gameId, code } = created.result as { gameId: string; code: string };

    const joined = await call('joinGame', { code }, sam);
    expect(joined.status).toBe(200);
    expect((joined.result as { gameId: string }).gameId).toBe(gameId);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('active');
    expect(game?.['inviteCode']).toBeUndefined(); // deleted on join
    const players = game?.['players'] as Record<string, unknown>;
    expect(players['p1']).toBe(ada.uid); // creator picked 'them'
    expect(players['p0']).toBe(sam.uid);
    expect(game?.['playerIds']).toEqual(expect.arrayContaining([ada.uid, sam.uid]));
    expect(game?.['deadlineAt']).toBeTruthy(); // timeControl stamped on activation
    expect((game?.['timeControl'] as Record<string, unknown>)['days']).toBe(3);

    // Joiner's rack = the seat-0 deal from the private order (engine order).
    const bag = await adminGetDoc(`games/${gameId}/private/bag`);
    const order = bag?.['order'] as string;
    const samRack = await adminGetDoc(`games/${gameId}/racks/${sam.uid}`);
    expect(samRack?.['tiles']).toBe(order.slice(0, classic.rackSize));
    const adaRack = await adminGetDoc(`games/${gameId}/racks/${ada.uid}`);
    expect(adaRack?.['tiles']).toBe(order.slice(classic.rackSize, 2 * classic.rackSize));

    expect(await adminGetDoc(`invites/${code}`)).toBeNull();

    const again = await call('joinGame', { code }, await signUp('Eve'));
    expect(again.errorStatus).toBe('NOT_FOUND');
  });

  it('rejects joining your own game', async () => {
    const ada = await signUp('Ada');
    const created = await call('createGame', { options: { ...OPTIONS }, seat: 'me' }, ada);
    const { code } = created.result as { code: string };
    const res = await call('joinGame', { code }, ada);
    expect(res.errorStatus).toBe('FAILED_PRECONDITION');
  });

  it('rejects unknown codes', async () => {
    const res = await call('joinGame', { code: 'NOPE9999' }, await signUp('Eve'));
    expect(res.errorStatus).toBe('NOT_FOUND');
  });
});

describe('cancelGame', () => {
  it('creator withdraws an open game: game + invite deleted', async () => {
    const ada = await signUp('Ada');
    const created = await call('createGame', { options: { ...OPTIONS }, seat: 'me' }, ada);
    const { gameId, code } = created.result as { gameId: string; code: string };
    const res = await call('cancelGame', { gameId }, ada);
    expect(res.status).toBe(200);
    expect(await adminGetDoc(`games/${gameId}`)).toBeNull();
    expect(await adminGetDoc(`invites/${code}`)).toBeNull();
  });

  it('rejects non-players and active games', async () => {
    const ada = await signUp('Ada');
    const created = await call('createGame', { options: { ...OPTIONS }, seat: 'me' }, ada);
    const { gameId, code } = created.result as { gameId: string; code: string };
    const stranger = await call('cancelGame', { gameId }, await signUp('Eve'));
    expect(stranger.errorStatus).toBe('PERMISSION_DENIED');

    const sam = await signUp('Sam');
    await call('joinGame', { code }, sam);
    const late = await call('cancelGame', { gameId }, ada);
    expect(late.errorStatus).toBe('FAILED_PRECONDITION');
  });
});

describe('challengeUser / respondChallenge', () => {
  const CHALLENGE = { options: { ...OPTIONS, timeControl: { days: 3 } }, seat: 'me' };

  it('challenges a past opponent; accept seats them, deals their rack, activates', async () => {
    const { p0: ada, p1: sam } = await createJoinedGame();
    const res = await call('challengeUser', { ...CHALLENGE, opponentUid: sam.uid }, ada);
    expect(res.status).toBe(200);
    const { gameId } = res.result as { gameId: string };

    const open = await adminGetDoc(`games/${gameId}`);
    expect(open?.['status']).toBe('open');
    expect(open?.['inviteCode']).toBeUndefined(); // direct challenge — no code
    const challenge = open?.['challenge'] as Record<string, unknown>;
    expect(challenge['from']).toBe(ada.uid);
    expect(challenge['to']).toBe(sam.uid);
    expect(challenge['fromName']).toBe('Ada');
    expect(challenge['toName']).toBe('Sam');
    expect(open?.['playerIds']).toEqual(expect.arrayContaining([ada.uid, sam.uid]));
    expect((open?.['players'] as Record<string, unknown>)['p0']).toBe(ada.uid);
    expect((open?.['players'] as Record<string, unknown>)['p1']).toBeNull();
    // A challenge is addressed to ONE person. The ruleset allows four seats, so
    // the doc must be sized from the options — not from that maximum, which
    // would activate the game with two permanently empty seats in the rotation.
    expect(Object.keys(open?.['players'] as Record<string, unknown>).sort()).toEqual(['p0', 'p1']);
    expect(Object.keys(open?.['scores'] as Record<string, unknown>).sort()).toEqual(['p0', 'p1']);
    expect(Object.keys(open?.['rackCounts'] as Record<string, unknown>).sort()).toEqual(['p0', 'p1']);

    const accepted = await call('respondChallenge', { gameId, accept: true }, sam);
    expect(accepted.status).toBe(200);
    const active = await adminGetDoc(`games/${gameId}`);
    expect(active?.['status']).toBe('active');
    expect((active?.['players'] as Record<string, unknown>)['p1']).toBe(sam.uid);
    expect(active?.['challenge']).toBeUndefined();
    expect(active?.['deadlineAt']).toBeTruthy(); // timeControl stamped on accept

    // Accepter's rack dealt from the persisted order (seat 1 = second deal).
    const bag = await adminGetDoc(`games/${gameId}/private/bag`);
    const order = bag?.['order'] as string;
    const samRack = await adminGetDoc(`games/${gameId}/racks/${sam.uid}`);
    expect(samRack?.['tiles']).toBe(order.slice(classic.rackSize, 2 * classic.rackSize));
  });

  it('decline deletes the challenge game', async () => {
    const { p0: ada, p1: sam } = await createJoinedGame();
    const res = await call('challengeUser', { ...CHALLENGE, opponentUid: sam.uid }, ada);
    const { gameId } = res.result as { gameId: string };
    const declined = await call('respondChallenge', { gameId, accept: false }, sam);
    expect(declined.status).toBe(200);
    expect(await adminGetDoc(`games/${gameId}`)).toBeNull();
  });

  it('rejects challenging someone you have never played', async () => {
    const ada = await signUp('Ada');
    const eve = await signUp('Eve');
    const res = await call('challengeUser', { ...CHALLENGE, opponentUid: eve.uid }, ada);
    expect(res.errorStatus).toBe('FAILED_PRECONDITION');
  });

  it('rejects challenging yourself', async () => {
    const ada = await signUp('Ada');
    const res = await call('challengeUser', { ...CHALLENGE, opponentUid: ada.uid }, ada);
    expect(res.errorStatus).toBe('INVALID_ARGUMENT');
  });

  it('only the challenged player can respond', async () => {
    const { p0: ada, p1: sam } = await createJoinedGame();
    const res = await call('challengeUser', { ...CHALLENGE, opponentUid: sam.uid }, ada);
    const { gameId } = res.result as { gameId: string };
    const fromChallenger = await call('respondChallenge', { gameId, accept: true }, ada);
    expect(fromChallenger.errorStatus).toBe('PERMISSION_DENIED');
    const fromStranger = await call(
      'respondChallenge',
      { gameId, accept: true },
      await signUp('Eve'),
    );
    expect(fromStranger.errorStatus).toBe('PERMISSION_DENIED');
  });

  it('rejects responding to a non-challenge open game', async () => {
    const ada = await signUp('Ada');
    const created = await call('createGame', { options: { ...OPTIONS }, seat: 'me' }, ada);
    const { gameId } = created.result as { gameId: string };
    const res = await call('respondChallenge', { gameId, accept: true }, await signUp('Sam'));
    expect(res.errorStatus).toBe('FAILED_PRECONDITION');
  });

  it('challenger can withdraw a pending challenge via cancelGame', async () => {
    const { p0: ada, p1: sam } = await createJoinedGame();
    const res = await call('challengeUser', { ...CHALLENGE, opponentUid: sam.uid }, ada);
    const { gameId } = res.result as { gameId: string };
    const cancelled = await call('cancelGame', { gameId }, ada);
    expect(cancelled.status).toBe(200);
    expect(await adminGetDoc(`games/${gameId}`)).toBeNull();
  });
});

describe('resign', () => {
  it('ends the game with the opponent winning and appends a meta move', async () => {
    const { gameId, p0: ada, p1: sam } = await createJoinedGame();
    const res = await call('resign', { gameId }, ada);
    expect(res.status).toBe(200);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('finished');
    expect(game?.['result']).toBe('p1');
    expect(game?.['endedBy']).toBe('resign');
    expect(game?.['moveCount']).toBe(1);

    const moves = await adminListDocs(`games/${gameId}/moves`);
    expect(moves).toHaveLength(1);
    expect(moves[0]?.['kind']).toBe('resign');
    expect(moves[0]?.['by']).toBe(ada.uid);

    // Finished games reject further meta actions.
    const again = await call('resign', { gameId }, sam);
    expect(again.errorStatus).toBe('FAILED_PRECONDITION');
  });

  it('rejects non-players', async () => {
    const { gameId } = await createJoinedGame();
    const res = await call('resign', { gameId }, await signUp('Eve'));
    expect(res.errorStatus).toBe('PERMISSION_DENIED');
  });
});

describe('rematch', () => {
  it('creates a fresh game with turn order swapped and new hidden state', async () => {
    const { gameId, p0: ada, p1: sam } = await createJoinedGame();
    await call('resign', { gameId }, ada);

    const res = await call('rematch', { gameId }, sam);
    expect(res.status).toBe(200);
    const { gameId: newId } = res.result as { gameId: string };
    expect(newId).not.toBe(gameId);

    const game = await adminGetDoc(`games/${newId}`);
    expect(game?.['status']).toBe('active');
    // Rematch swaps who starts: Sam (old p1) opens the return game.
    expect((game?.['players'] as Record<string, unknown>)['p0']).toBe(sam.uid);
    expect((game?.['players'] as Record<string, unknown>)['p1']).toBe(ada.uid);
    expect(game?.['rematchOf']).toBe(gameId);
    expect(game?.['moveCount']).toBe(0);

    // Fresh hidden state: its own bag order and both racks dealt.
    const bag = await adminGetDoc(`games/${newId}/private/bag`);
    const order = bag?.['order'] as string;
    expect(order).toHaveLength(100);
    const samRack = await adminGetDoc(`games/${newId}/racks/${sam.uid}`);
    expect(samRack?.['tiles']).toBe(order.slice(0, classic.rackSize));
    const adaRack = await adminGetDoc(`games/${newId}/racks/${ada.uid}`);
    expect(adaRack?.['tiles']).toBe(order.slice(classic.rackSize, 2 * classic.rackSize));

    const old = await adminGetDoc(`games/${gameId}`);
    expect(old?.['rematchGameId']).toBe(newId);

    // Both players converge on the same rematch game.
    const again = await call('rematch', { gameId }, ada);
    expect((again.result as { gameId: string }).gameId).toBe(newId);
  });

  it('is only available after a game ends', async () => {
    const { gameId, p0: ada } = await createJoinedGame();
    const res = await call('rematch', { gameId }, ada);
    expect(res.errorStatus).toBe('FAILED_PRECONDITION');
  });
});
