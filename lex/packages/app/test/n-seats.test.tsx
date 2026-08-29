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
  withdraw,
} from '@lex/engine';
import { describe, expect, it } from 'vitest';
import { synthesizedState } from '../src/sync/firestoreTransport';
import { toSummary } from '../src/sync/lobby';
import { LobbyView, cardCaption, type LobbyGameSummary } from '../src/screens/lobbyView';

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
