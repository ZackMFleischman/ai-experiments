// T7.12: the sync layer over N seats. A 3+ game is a guest-list ROOM before it
// starts (no players, no scores, no public snapshot) and a normal N-seat game
// after — and the two-seat mapping must come out byte-for-byte what it always
// was. Fixture-fed: no firebase, just the doc shapes DESIGN §6.2 pins.
import { render, screen } from '@testing-library/react';
import {
  RULESETS,
  deserializeState,
  initialState,
  serializePublic,
  serializeState,
  withdraw,
} from '@lex/engine';
import type { TileFace } from '@lex/engine';
import { LocalTransport } from '@parlor/core';
import { describe, expect, it } from 'vitest';
import { stubDict } from '../../engine/test/helpers';
import { GameController } from '../src/controller/GameController';
import type { GameOptions, LexEntry } from '../src/controller/entries';
import { synthesizedState } from '../src/sync/firestoreTransport';
import { toSummary } from '../src/sync/lobby';
import {
  LobbyView,
  captionLines,
  cardCaption,
  cardTitle,
  type LobbyGameSummary,
} from '../src/screens/lobbyView';

const classic = RULESETS['classic']!;
const ORDER = Object.entries(classic.tiles.counts).flatMap(([face, count]) =>
  Array.from({ length: count }, () => face),
);
const publicFor = (seats: number) => serializePublic(initialState(classic, ORDER, seats));

const NOW = 1_750_000_000_000;
const stamp = (ms: number) => ({ toMillis: () => ms });
const OPTIONS = { rulesetId: 'classic', dictionaryId: 'nwl2023', timeControl: null };

describe('toSummary — two seats (unchanged)', () => {
  const doc = {
    players: { p0: 'ada', p1: 'sam' },
    playerNames: { p0: 'Ada', p1: 'Sam' },
    options: OPTIONS,
    status: 'active',
    toMove: 'p1',
    moveCount: 4,
    updatedAt: stamp(NOW - 60_000),
    public: publicFor(2),
    scores: { p0: 24, p1: 18 },
    lastPlay: { by: 'sam', word: 'QUIZ', score: 68 },
  };

  it('maps seats, scores and the last play exactly as before', () => {
    const summary = toSummary('g1', doc, 'ada');
    expect(summary.mySeat).toBe(0);
    expect(summary.toMove).toBe(1);
    expect(summary.opponentName).toBe('Sam');
    expect(summary.opponentUid).toBe('sam');
    expect(summary.scores).toEqual([24, 18]);
    expect(summary.lastPlay).toEqual({ by: 1, word: 'QUIZ', score: 68 });
    // None of the N-seat fields appear on a two-seat card.
    expect(summary.seatCount).toBeUndefined();
    expect(summary.opponents).toBeUndefined();
    expect(summary.openSeats).toBeUndefined();
  });

  it('seats the challenged player in the empty seat', () => {
    const summary = toSummary(
      'g2',
      {
        ...doc,
        players: { p0: 'ada', p1: null },
        playerNames: { p0: 'Ada', p1: null },
        status: 'open',
        challenge: { from: 'ada', fromName: 'Ada', to: 'sam', toName: 'Sam' },
      },
      'sam',
    );
    expect(summary.mySeat).toBe(1);
    expect(summary.challenge).toEqual({ direction: 'incoming', name: 'Ada' });
    expect(summary.opponentUid).toBe('ada');
  });
});

describe('toSummary — an open 3+ room', () => {
  const room = {
    options: { ...OPTIONS, maxPlayers: 4 },
    status: 'open',
    maxPlayers: 4,
    roster: [
      { uid: 'ada', name: 'Ada' },
      { uid: 'sam', name: 'Sam' },
    ],
    invited: [{ uid: 'lee', name: 'Lee' }],
    declined: [],
    moveCount: 0,
    inviteCode: 'ABCD',
    updatedAt: stamp(NOW - 60_000),
  };

  it('reads the guest list where the seats would be', () => {
    const summary = toSummary('r1', room, 'ada');
    expect(summary.seatCount).toBe(4);
    expect(summary.openSeats).toBe(2);
    // Seats do not exist yet, so no opponent carries one.
    expect(summary.opponents).toEqual([{ uid: 'sam', name: 'Sam' }]);
    expect(summary.opponentName).toBe('Sam');
    expect(summary.scores).toEqual([0, 0, 0, 0]);
    expect(summary.toMove).toBe(0);
  });

  it('has no public snapshot at all — the deal has not happened', () => {
    expect(toSummary('r1', room, 'ada').public).toBeUndefined();
  });

  it('stands join order in for my seat', () => {
    expect(toSummary('r1', room, 'sam').mySeat).toBe(1);
  });
});

describe('toSummary — a started 3+ game', () => {
  const started = {
    players: { p0: 'ada', p1: 'sam', p2: 'lee' },
    playerNames: { p0: 'Ada', p1: 'Sam', p2: 'Lee' },
    options: { ...OPTIONS, maxPlayers: 4 },
    status: 'finished',
    maxPlayers: 4,
    roster: [
      { uid: 'ada', name: 'Ada' },
      { uid: 'sam', name: 'Sam' },
      { uid: 'lee', name: 'Lee' },
    ],
    toMove: 'p2',
    moveCount: 30,
    updatedAt: stamp(NOW - 60_000),
    public: publicFor(3),
    scores: { p0: 24, p1: 18, p2: 31 },
    result: 'p2',
    endedBy: 'played-out',
    standings: [{ seats: ['p2'] }, { seats: ['p0'] }, { seats: ['p1'] }],
    withdrawn: ['p1'],
    lastPlay: { by: 'lee', word: 'JINX', score: 40 },
  };

  it('maps scores, placings and withdrawals to seat INDICES', () => {
    const summary = toSummary('g3', started, 'ada');
    expect(summary.seatCount).toBe(3);
    expect(summary.mySeat).toBe(0);
    expect(summary.toMove).toBe(2);
    expect(summary.scores).toEqual([24, 18, 31]);
    expect(summary.standings).toEqual([[2], [0], [1]]);
    expect(summary.withdrawn).toEqual([1]);
    expect(summary.lastPlay).toEqual({ by: 2, word: 'JINX', score: 40 });
    // A started room has no places left to fill.
    expect(summary.openSeats).toBe(0);
  });

  it('names every other player, with their seat', () => {
    expect(toSummary('g3', started, 'sam').opponents).toEqual([
      { uid: 'ada', name: 'Ada', seat: 0 },
      { uid: 'lee', name: 'Lee', seat: 2 },
    ]);
  });
});

describe('the lobby card at 3+', () => {
  // No `public` in the base: an open 3+ room genuinely has none, and the
  // cases that want a board add it.
  function summary(partial: Partial<LobbyGameSummary> & { id: string }): LobbyGameSummary {
    return {
      mySeat: 0,
      opponentName: 'Sam',
      status: 'active',
      toMove: 0,
      updatedAtMs: NOW - 60_000,
      rulesetId: 'classic',
      scores: [0, 0],
      ...partial,
    };
  }

  it('renders an empty thumbnail when the room has no public snapshot', () => {
    render(
      <LobbyView
        games={[
          summary({
            id: 'r1',
            status: 'open',
            seatCount: 4,
            openSeats: 2,
            opponents: [{ uid: 'sam', name: 'Sam' }],
          }),
        ]}
        now={NOW}
        onOpen={() => {}}
      />,
    );
    // The whole lobby would have died in parsePublic before T7.12.
    expect(screen.getByTestId('mini-board')).toBeTruthy();
    expect(screen.getByTestId('game-card-r1')).toBeTruthy();
  });

  it('still renders the board of a game that has one', () => {
    render(
      <LobbyView
        games={[summary({ id: 'g1', public: publicFor(2) })]}
        now={NOW}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByTestId('mini-board')).toBeTruthy();
  });

  it('keeps the two-seat caption word for word', () => {
    const game = summary({
      id: 'g1',
      scores: [212, 198],
      lastPlay: { by: 1, word: 'QUIZ', score: 68 },
    });
    expect(cardCaption(game, NOW)).toBe('You 212 · Sam 198 — Sam played QUIZ +68');
  });

  it('names every player at three seats, me first', () => {
    const game = summary({
      id: 'g3',
      mySeat: 1,
      seatCount: 3,
      scores: [24, 18, 31],
      opponents: [
        { uid: 'ada', name: 'Ada', seat: 0 },
        { uid: 'lee', name: 'Lee', seat: 2 },
      ],
      lastPlay: { by: 2, word: 'JINX', score: 40 },
    });
    expect(cardCaption(game, NOW)).toBe('You 18 · Ada 24 · Lee 31 — Lee played JINX +40');
  });

  it('says where an open room stands instead of showing scores it has not got', () => {
    const game = summary({
      id: 'r1',
      status: 'open',
      seatCount: 4,
      openSeats: 2,
      opponents: [{ uid: 'sam', name: 'Sam' }],
    });
    expect(cardCaption(game, NOW)).toBe('2 of 4 players — waiting to start');
  });
});

describe('the transport’s synthesized state', () => {
  it('carries `withdrawn` through the round trip (PR #106 landmine)', () => {
    const withdrawn = withdraw(initialState(classic, ORDER, 3), 1);
    const pub = JSON.parse(serializePublic(withdrawn)) as Parameters<typeof synthesizedState>[0];
    expect(pub.withdrawn).toEqual([1]);

    const state = deserializeState(synthesizedState(pub, 0, 'CATSQJX'));
    // Without this the client engine stops skipping the seat that left and
    // silently disagrees with the server about whose turn it is.
    expect(state.withdrawn).toEqual([1]);
    expect(state.toMove).toBe(withdrawn.toMove);
    expect(state.racks[0]).toEqual([...'CATSQJX']);
    // Every other rack is a placeholder of the right length; the leaver's is
    // empty because their tiles went back to the bag.
    expect(state.racks[1]).toEqual([]);
    expect(state.racks[2]?.length).toBe(withdrawn.racks[2]?.length);
  });

  it('reads a pre-M7 snapshot with no `withdrawn` as nobody having left', () => {
    const pub = JSON.parse(serializePublic(initialState(classic, ORDER, 2))) as Parameters<
      typeof synthesizedState
    >[0];
    delete pub.withdrawn;
    expect(deserializeState(synthesizedState(pub, 0, 'CATSQJX')).withdrawn).toEqual([]);
  });
});

describe('the lobby card at a table (T7.16)', () => {
  const table = (partial: Partial<LobbyGameSummary> = {}): LobbyGameSummary => ({
    id: 't1',
    mySeat: 1,
    opponentName: 'Ada',
    status: 'active',
    toMove: 1,
    updatedAtMs: NOW - 60_000,
    rulesetId: 'classic',
    seatCount: 4,
    scores: [212, 198, 176, 143],
    opponents: [
      { uid: 'ada', name: 'Ada', seat: 0 },
      { uid: 'noor', name: 'Noor', seat: 2 },
      { uid: 'kai', name: 'Kai', seat: 3 },
    ],
    ...partial,
  });

  it('titles the card with the whole table, not one opponent', () => {
    expect(cardTitle(table())).toBe('Ada, Noor & Kai');
    render(<LobbyView games={[table()]} now={NOW} onOpen={() => {}} />);
    expect(screen.getByTestId('game-card-t1').textContent).toContain('Ada, Noor & Kai');
  });

  it('counts the places still open in an open room’s title', () => {
    expect(
      cardTitle(
        table({ status: 'open', openSeats: 2, opponents: [{ uid: 'ada', name: 'Ada' }] }),
      ),
    ).toBe('Ada & 2 open');
  });

  it('leaves the two-seat title exactly as it was', () => {
    // A two-seat summary carries neither field at all — under
    // exactOptionalPropertyTypes that means omitted, not explicitly undefined.
    const { seatCount: _seatCount, opponents: _opponents, ...two } = table({ scores: [24, 18] });
    expect(cardTitle(two)).toBe('Ada');
  });

  it('breaks the caption into a standing line and a what-happened line', () => {
    expect(captionLines(table({ lastPlay: { by: 3, word: 'JINX', score: 40 } }), NOW)).toEqual([
      'You 198 · Ada 212 · Noor 176 · Kai 143',
      'Kai played JINX +40',
    ]);
  });

  it('reads finished tables by PLACING, in the standings’ own order', () => {
    // Kai left holding the best score and still places last — the card renders
    // the standings it was given (DECISIONS 2026-08-28), it never re-ranks.
    const finished = table({
      status: 'finished',
      seatCount: 3,
      scores: [212, 198, 244],
      standings: [[0], [1], [2]],
      withdrawn: [2],
      opponents: [
        { uid: 'ada', name: 'Ada', seat: 0 },
        { uid: 'kai', name: 'Kai', seat: 2 },
      ],
    });
    expect(captionLines(finished, NOW)[0]).toBe('1st Ada 212 · 2nd You 198 · 3rd Kai 244');
  });
});

describe('the server’s standings reach GameEnd (T7.16)', () => {
  /** A finished 4-seat game the way the transport delivers one: the server's
   * public snapshot as a sync entry, with its `ended` block. */
  async function syncedEnd(ended: NonNullable<Extract<LexEntry, { kind: 'sync' }>['ended']>) {
    let state = initialState(classic, ORDER, 4);
    for (const seat of [1, 2, 3]) state = withdraw(state, seat); // last player standing
    const options = {
      rulesetId: 'classic',
      dictionaryId: 'stub',
      bagOrder: ORDER as TileFace[],
      seats: 4,
    };
    const transport = new LocalTransport<GameOptions, LexEntry>(options);
    await transport.submit(
      {
        kind: 'sync',
        state: serializeState(state),
        myRack: (state.racks[0] ?? []).join(''),
        rows: [],
        ended,
      },
      0,
    );
    const controller = new GameController(transport, options, { dict: stubDict() }, 0);
    await controller.init();
    return controller.getSnapshot().end;
  }

  it('carries the placings and the withdrawn through to the end', async () => {
    const end = await syncedEnd({
      endedBy: 'last-standing',
      winner: 0,
      standings: [[0], [3], [1, 2]],
      withdrawn: [1, 2, 3],
    });
    expect(end?.by).toBe('last-standing');
    expect(end?.standings).toEqual([[0], [3], [1, 2]]);
    expect(end?.withdrawn).toEqual([1, 2, 3]);
    expect(end?.winner).toBe(0);
  });

  it('falls back to the engine’s own placings for a game finished before M7', async () => {
    const end = await syncedEnd({ endedBy: 'last-standing', winner: 0 });
    // Nobody scored, so the three who left share a placing behind the survivor.
    expect(end?.standings).toEqual([[0], [1, 2, 3]]);
    expect(end?.withdrawn).toEqual([1, 2, 3]);
  });
});
