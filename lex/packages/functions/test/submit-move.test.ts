// T4.5: submitMove against the emulator — happy path, engine rejection
// (illegal word BY NAME, illegal geometry, foreign tiles), turn enforcement,
// the optimistic-concurrency guard, exchange privacy (count-only public log,
// private re-shuffle event), tile conservation ACROSS the three storage
// tiers, and the §3.3 replay guarantee (order + public log + private events
// reproduce the server snapshot exactly). Plus the invalidWords (§2.3) fork:
// the same invalid word that is REJECTED under the default is ACCEPTED as a
// spent turn when the game says invalid words cost the turn, and is recorded
// without letters.
import {
  RULESETS,
  applyMove,
  deserializeState,
  initialState,
  parsePublic,
  serializeState,
  type GameState,
  type Move,
  type TileFace,
} from '@lex/engine';
import { loadDictionarySync } from '@lex/dict/node';
import { describe, expect, it } from 'vitest';
import {
  OPTIONS,
  adminGetDoc,
  adminListDocs,
  adminSetDoc,
  call,
  createJoinedGame,
  signUp,
  type JoinedGame,
} from './helpers';

const classic = RULESETS['classic']!;
const enable1 = loadDictionarySync('enable1');

// Deterministic bag: Ada (p0) draws C A T S Q J X, Sam (p1) D O G E R N U;
// the remainder is the classic multiset minus those, in counts order.
const RACK0 = 'CATSQJX';
const RACK1 = 'DOGERNU';
const BAG_ORDER: TileFace[] = (() => {
  const remaining = new Map<string, number>(Object.entries(classic.tiles.counts));
  for (const face of RACK0 + RACK1) {
    remaining.set(face, (remaining.get(face) ?? 0) - 1);
  }
  const rest: string[] = [];
  for (const [face, count] of remaining) {
    if (count < 0) throw new Error(`rigged racks overdraw '${face}'`);
    for (let i = 0; i < count; i++) rest.push(face);
  }
  return [...RACK0, ...RACK1, ...rest] as TileFace[];
})();

const RIGGED: GameState = initialState(classic, BAG_ORDER, 2);

/** Overwrite a real game's hidden state with the deterministic rig. The
 * public doc needs no patch: board/scores/counts are identical for any
 * fresh deal. */
async function rigGame(game: JoinedGame): Promise<void> {
  await adminSetDoc(`games/${game.gameId}/racks/${game.p0.uid}`, {
    tiles: RIGGED.racks[0]!.join(''),
    n: 0,
  });
  await adminSetDoc(`games/${game.gameId}/racks/${game.p1.uid}`, {
    tiles: RIGGED.racks[1]!.join(''),
    n: 0,
  });
  await adminSetDoc(`games/${game.gameId}/private/bag`, {
    order: BAG_ORDER.join(''),
    drawn: 2 * classic.rackSize,
    state: serializeState(RIGGED),
    events: [],
  });
}

async function riggedGame(): Promise<JoinedGame> {
  const game = await createJoinedGame();
  await rigGame(game);
  return game;
}

/** The same rig in a game where invalid words cost the turn (§2.3). */
async function riggedCostsTurnGame(): Promise<JoinedGame> {
  const game = await createJoinedGame({ ...OPTIONS, invalidWords: 'costs-turn' });
  await rigGame(game);
  return game;
}

/** CQ across the center — legal geometry, not a word in enable1. */
const PHONEY_PLAY = {
  type: 'play',
  placements: [
    { row: 7, col: 7, letter: 'C', isBlank: false },
    { row: 7, col: 8, letter: 'Q', isBlank: false },
  ],
};

/** CATS across the center: C(7,7) A T S — 6 doubled by the center DW = 12. */
const CATS_PLAY = {
  type: 'play',
  placements: [
    { row: 7, col: 7, letter: 'C', isBlank: false },
    { row: 7, col: 8, letter: 'A', isBlank: false },
    { row: 7, col: 9, letter: 'T', isBlank: false },
    { row: 7, col: 10, letter: 'S', isBlank: false },
  ],
};

/** Engine-side twin of the CATS play, for expected-state assertions. */
const CATS_MOVE: Move = {
  type: 'play',
  placements: CATS_PLAY.placements.map((p) => ({
    cell: { row: p.row, col: p.col },
    letter: p.letter,
    isBlank: p.isBlank,
  })),
};

/** Same-state-with-replaced-bag, via the frozen serialize round-trip. */
function withBag(state: GameState, bag: string): GameState {
  const s = JSON.parse(serializeState(state)) as { bag: string };
  s.bag = bag;
  return deserializeState(JSON.stringify(s));
}

describe('submitMove — plays', () => {
  it('accepts a legal play: move log, game doc, rack doc, private doc all advance', async () => {
    const { gameId, p0 } = await riggedGame();
    const res = await call('submitMove', { gameId, expectedMoveCount: 0, move: CATS_PLAY }, p0);
    expect(res.status).toBe(200);
    expect((res.result as { moveCount: number }).moveCount).toBe(1);

    const expected = applyMove(RIGGED, CATS_MOVE, enable1);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['toMove']).toBe('p1');
    expect(game?.['moveCount']).toBe(1);
    expect(game?.['scores']).toEqual({ p0: 12, p1: 0 });
    expect(game?.['bagCount']).toBe(expected.bag.length);
    expect(game?.['rackCounts']).toEqual({ p0: 7, p1: 7 });
    expect(game?.['lastPlay']).toEqual({ by: p0.uid, word: 'CATS', score: 12 });

    const pub = parsePublic(game?.['public'] as string);
    expect(pub.board.size).toBe(4);
    expect(pub.board.get('7,7')).toEqual({ letter: 'C', isBlank: false });
    expect(pub.scores).toEqual([12, 0]);

    const moves = await adminListDocs(`games/${gameId}/moves`);
    expect(moves).toHaveLength(1);
    const play = moves[0]?.['play'] as Record<string, unknown>;
    expect(moves[0]?.['kind']).toBe('play');
    expect(play['words']).toEqual([{ word: 'CATS', score: 12 }]);
    expect(play['score']).toBe(12);
    expect(play['bingo']).toBe(false);

    // Caller's rack refilled from the bag front, exactly as the engine draws.
    const rack = await adminGetDoc(`games/${gameId}/racks/${p0.uid}`);
    expect(rack?.['tiles']).toBe(expected.racks[0]!.join(''));

    const bag = await adminGetDoc(`games/${gameId}/private/bag`);
    expect(bag?.['state']).toBe(serializeState(expected));
    expect(bag?.['drawn']).toBe(100 - expected.bag.length);
  });

  it('rejects an invalid word and NAMES it', async () => {
    const { gameId, p0 } = await riggedGame();
    const res = await call(
      'submitMove',
      {
        gameId,
        expectedMoveCount: 0,
        move: {
          type: 'play',
          placements: [
            { row: 7, col: 7, letter: 'C', isBlank: false },
            { row: 7, col: 8, letter: 'Q', isBlank: false },
          ],
        },
      },
      p0,
    );
    expect(res.errorStatus).toBe('INVALID_ARGUMENT');
    expect(res.errorMessage).toContain('CQ');
    // Nothing moved.
    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['moveCount']).toBe(0);
    expect(await adminListDocs(`games/${gameId}/moves`)).toHaveLength(0);
  });

  it('rejects illegal geometry (gap in the line)', async () => {
    const { gameId, p0 } = await riggedGame();
    const res = await call(
      'submitMove',
      {
        gameId,
        expectedMoveCount: 0,
        move: {
          type: 'play',
          placements: [
            { row: 7, col: 7, letter: 'C', isBlank: false },
            { row: 7, col: 9, letter: 'A', isBlank: false },
          ],
        },
      },
      p0,
    );
    expect(res.errorStatus).toBe('INVALID_ARGUMENT');
    expect(res.errorMessage).toMatch(/illegal move/i);
  });

  it('rejects tiles the caller does not hold', async () => {
    const { gameId, p0 } = await riggedGame();
    const res = await call(
      'submitMove',
      {
        gameId,
        expectedMoveCount: 0,
        move: {
          type: 'play',
          placements: [
            { row: 7, col: 7, letter: 'Z', isBlank: false },
            { row: 7, col: 8, letter: 'A', isBlank: false },
          ],
        },
      },
      p0,
    );
    expect(res.errorStatus).toBe('INVALID_ARGUMENT');
  });

  it('enforces turn order', async () => {
    const { gameId, p1 } = await riggedGame();
    const res = await call(
      'submitMove',
      { gameId, expectedMoveCount: 0, move: { type: 'pass' } },
      p1,
    );
    expect(res.errorStatus).toBe('FAILED_PRECONDITION');
    expect(res.errorMessage).toMatch(/turn/i);
  });

  it('rejects a stale expectedMoveCount (optimistic-concurrency guard)', async () => {
    const { gameId, p0, p1 } = await riggedGame();
    await call('submitMove', { gameId, expectedMoveCount: 0, move: CATS_PLAY }, p0);
    await call('submitMove', { gameId, expectedMoveCount: 1, move: { type: 'pass' } }, p1);
    const res = await call(
      'submitMove',
      { gameId, expectedMoveCount: 1, move: { type: 'pass' } },
      p0,
    );
    expect(res.errorStatus).toBe('FAILED_PRECONDITION');
    expect(res.errorMessage).toMatch(/stale/i);
  });

  it('rejects non-players and finished games', async () => {
    const { gameId, p0 } = await riggedGame();
    const eve = await signUp('Eve');
    const stranger = await call(
      'submitMove',
      { gameId, expectedMoveCount: 0, move: CATS_PLAY },
      eve,
    );
    expect(stranger.errorStatus).toBe('PERMISSION_DENIED');

    await call('resign', { gameId }, p0);
    const late = await call('submitMove', { gameId, expectedMoveCount: 1, move: CATS_PLAY }, p0);
    expect(late.errorStatus).toBe('FAILED_PRECONDITION');
  });
});

describe('submitMove — exchange privacy (§3.3 security invariant)', () => {
  it('records a COUNT publicly and the letters + re-shuffle privately', async () => {
    const { gameId, p0, p1 } = await riggedGame();
    await call('submitMove', { gameId, expectedMoveCount: 0, move: CATS_PLAY }, p0);

    const res = await call(
      'submitMove',
      { gameId, expectedMoveCount: 1, move: { type: 'exchange', tiles: ['D', 'O', 'G'] } },
      p1,
    );
    expect(res.status).toBe(200);

    // Public log entry: count only — the letters appear NOWHERE public.
    const moves = await adminListDocs(`games/${gameId}/moves`);
    const entry = moves.find((m) => m['n'] === 1)!;
    expect(entry['kind']).toBe('exchange');
    expect(entry['exchanged']).toBe(3);
    expect(JSON.stringify(entry)).not.toMatch(/DOG|tiles/);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['toMove']).toBe('p0');
    expect(game?.['moveCount']).toBe(2);
    expect(game?.['lastPlay']).toBeUndefined(); // an exchange is not a play
    expect((game?.['rackCounts'] as Record<string, unknown>)['p1']).toBe(7);
    expect(JSON.stringify(game)).not.toContain('DOG');

    // Private tier: the replay event carries the letters + new remainder.
    const bag = await adminGetDoc(`games/${gameId}/private/bag`);
    const events = bag?.['events'] as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
    expect(events[0]?.['n']).toBe(1);
    expect(events[0]?.['returned']).toBe('DOG');
    const reshuffled = events[0]?.['reshuffled'] as string;
    const state = deserializeState(bag?.['state'] as string);
    expect(state.bag.join('')).toBe(reshuffled);
    // Same multiset, server-shuffled: exchange returns what it took.
    expect(reshuffled.length).toBe(state.bag.length);

    // The exchanger's rack kept ERNU and drew 3 (deterministic pre-shuffle).
    const rack = await adminGetDoc(`games/${gameId}/racks/${p1.uid}`);
    expect(rack?.['tiles']).toBe(state.racks[1]!.join(''));
    expect((rack?.['tiles'] as string).length).toBe(7);
  });

  it('rejects an exchange when the bag is under the minimum', async () => {
    const { gameId, p0 } = await riggedGame();
    // Rig a nearly-empty bag: 6 tiles left (< exchangeMinBag = 7).
    const emptierBag = withBag(RIGGED, RIGGED.bag.slice(0, 6).join(''));
    await adminSetDoc(`games/${gameId}/private/bag`, {
      order: BAG_ORDER.join(''),
      drawn: 94,
      state: serializeState(emptierBag),
      events: [],
    });
    const res = await call(
      'submitMove',
      { gameId, expectedMoveCount: 0, move: { type: 'exchange', tiles: ['C', 'A'] } },
      p0,
    );
    expect(res.errorStatus).toBe('INVALID_ARGUMENT');
  });
});

describe('submitMove — cross-tier invariants', () => {
  it('conserves the tileset across public board + rack docs + private bag', async () => {
    const { gameId, p0, p1 } = await riggedGame();
    await call('submitMove', { gameId, expectedMoveCount: 0, move: CATS_PLAY }, p0);
    await call(
      'submitMove',
      { gameId, expectedMoveCount: 1, move: { type: 'exchange', tiles: ['D', 'O', 'G'] } },
      p1,
    );

    const game = await adminGetDoc(`games/${gameId}`);
    const pub = parsePublic(game?.['public'] as string);
    const bag = await adminGetDoc(`games/${gameId}/private/bag`);
    const state = deserializeState(bag?.['state'] as string);
    const rack0 = (await adminGetDoc(`games/${gameId}/racks/${p0.uid}`))?.['tiles'] as string;
    const rack1 = (await adminGetDoc(`games/${gameId}/racks/${p1.uid}`))?.['tiles'] as string;

    const faces: string[] = [];
    for (const tile of pub.board.values()) faces.push(tile.isBlank ? '?' : tile.letter);
    faces.push(...rack0, ...rack1, ...state.bag);
    const expected = Object.entries(classic.tiles.counts)
      .flatMap(([face, count]) => Array.from({ length: count }, () => face))
      .sort()
      .join('');
    expect(faces.sort().join('')).toBe(expected);
  });

  it('private snapshot ≡ replay from order + public log + private events (§3.3)', async () => {
    const { gameId, p0, p1 } = await riggedGame();
    await call('submitMove', { gameId, expectedMoveCount: 0, move: CATS_PLAY }, p0);
    await call(
      'submitMove',
      { gameId, expectedMoveCount: 1, move: { type: 'exchange', tiles: ['D', 'O', 'G'] } },
      p1,
    );
    await call('submitMove', { gameId, expectedMoveCount: 2, move: { type: 'pass' } }, p0);

    const bag = await adminGetDoc(`games/${gameId}/private/bag`);
    const order = (bag?.['order'] as string).split('') as TileFace[];
    const events = bag?.['events'] as Array<{ n: number; returned: string; reshuffled: string }>;
    const log = (await adminListDocs(`games/${gameId}/moves`)).sort(
      (a, b) => (a['n'] as number) - (b['n'] as number),
    );

    let replayed = initialState(classic, order, 2);
    for (const entry of log) {
      const kind = entry['kind'] as string;
      if (kind === 'play') {
        const play = entry['play'] as {
          placements: Array<{ row: number; col: number; letter: string; isBlank: boolean }>;
        };
        replayed = applyMove(
          replayed,
          {
            type: 'play',
            placements: play.placements.map((p) => ({
              cell: { row: p.row, col: p.col },
              letter: p.letter,
              isBlank: p.isBlank,
            })),
          },
          enable1,
        );
      } else if (kind === 'pass') {
        replayed = applyMove(replayed, { type: 'pass' }, enable1);
      } else if (kind === 'exchange') {
        const ev = events.find((e) => e.n === entry['n'])!;
        replayed = applyMove(
          replayed,
          { type: 'exchange', tiles: ev.returned.split('') as TileFace[] },
          enable1,
        );
        replayed = withBag(replayed, ev.reshuffled);
      }
    }
    expect(serializeState(replayed)).toBe(bag?.['state']);
  });
});


describe("submitMove — invalidWords: 'costs-turn' (§2.3)", () => {
  it('accepts a phoney as a SPENT TURN: nothing placed, nothing scored, turn passes', async () => {
    const { gameId, p0 } = await riggedCostsTurnGame();
    const res = await call('submitMove', { gameId, expectedMoveCount: 0, move: PHONEY_PLAY }, p0);
    expect(res.status).toBe(200);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['moveCount']).toBe(1);
    expect(game?.['toMove']).toBe('p1'); // the turn is gone
    expect(game?.['scores']).toEqual({ p0: 0, p1: 0 });
    // Nothing reached the board, and the tiles are still in hand.
    const pub = parsePublic(game?.['public'] as string);
    expect(pub.board.size).toBe(0);
    expect(pub.scorelessRun).toBe(1);
    expect(game?.['rackCounts']).toEqual({ p0: 7, p1: 7 });
    expect(game?.['lastPlay']).toBeUndefined(); // no word to advertise

    const rack = await adminGetDoc(`games/${gameId}/racks/${p0.uid}`);
    expect(rack?.['tiles']).toBe(RIGGED.racks[0]!.join(''));
  });

  it('records the WORDS tried, and nothing that would expose the rack', async () => {
    const { gameId, p0 } = await riggedCostsTurnGame();
    await call('submitMove', { gameId, expectedMoveCount: 0, move: PHONEY_PLAY }, p0);

    const moves = await adminListDocs(`games/${gameId}/moves`);
    expect(moves).toHaveLength(1);
    expect(moves[0]?.['kind']).toBe('phoney');
    // The words the play FORMED are public (§3.3) — the opponent is told what
    // was tried.
    expect(moves[0]?.['phoney']).toEqual({ words: ['CQ'] });
    // …but nothing more. Asserted as the doc's whole key set so a future field
    // carrying placements, a score, or the rack can't slip past unnoticed (a
    // substring scan would false-positive on the random uid).
    expect(Object.keys(moves[0] ?? {}).sort()).toEqual(['at', 'by', 'kind', 'n', 'phoney']);
    expect(moves[0]?.['play']).toBeUndefined();
    // The rack doc still holds the untouched hand; the log says nothing of it.
    const rack = await adminGetDoc(`games/${gameId}/racks/${p0.uid}`);
    expect(rack?.['tiles']).toBe(RIGGED.racks[0]!.join(''));
  });

  it('still rejects illegal geometry — only the dictionary verdict changes', async () => {
    const { gameId, p0 } = await riggedCostsTurnGame();
    const res = await call(
      'submitMove',
      {
        gameId,
        expectedMoveCount: 0,
        move: {
          type: 'play',
          placements: [
            { row: 7, col: 7, letter: 'C', isBlank: false },
            { row: 7, col: 9, letter: 'T', isBlank: false }, // gap
          ],
        },
      },
      p0,
    );
    expect(res.errorStatus).toBe('INVALID_ARGUMENT');
    expect(await adminListDocs(`games/${gameId}/moves`)).toHaveLength(0);
  });

  it('a good play is an ordinary scoring play', async () => {
    const { gameId, p0 } = await riggedCostsTurnGame();
    const res = await call('submitMove', { gameId, expectedMoveCount: 0, move: CATS_PLAY }, p0);
    expect(res.status).toBe(200);
    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['scores']).toEqual({ p0: 12, p1: 0 });
    expect(game?.['lastPlay']).toEqual({ by: p0.uid, word: 'CATS', score: 12 });
    const moves = await adminListDocs(`games/${gameId}/moves`);
    expect(moves[0]?.['kind']).toBe('play');
  });

  it("defaults to 'blocked': options without the field keep rejecting", async () => {
    // Games created before the setting existed carry no `invalidWords` at all.
    const game = await createJoinedGame({ ...OPTIONS });
    await rigGame(game);
    expect((await adminGetDoc(`games/${game.gameId}`))?.['options']).toMatchObject({
      invalidWords: 'blocked',
    });
    const res = await call(
      'submitMove',
      { gameId: game.gameId, expectedMoveCount: 0, move: PHONEY_PLAY },
      game.p0,
    );
    expect(res.errorStatus).toBe('INVALID_ARGUMENT');
    expect(res.errorMessage).toContain('CQ');
  });

  it('refuses an unknown invalidWords rather than silently defaulting it', async () => {
    // A malformed setting must never be quietly read as one of the two real
    // ones — that would change how a game plays behind the host's back.
    const ada = await signUp('Ada');
    const res = await call(
      'createGame',
      { options: { ...OPTIONS, invalidWords: 'freebie' }, seat: 'me' },
      ada,
    );
    expect(res.errorStatus).toBe('INVALID_ARGUMENT');
    expect(res.errorMessage).toContain('invalidWords');
  });
});
