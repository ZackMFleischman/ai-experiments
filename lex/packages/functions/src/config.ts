// Lex's GameServerConfig (T4.4, DESIGN §6.3): seat model, option validation
// against the ruleset/dictionary registries, and the hidden-information
// initial state — crypto-shuffled bag persisted server-private, racks dealt
// exactly as the engine deals them (initialState draws seat 0 then seat 1
// from the bag front), so server replay reproduces the deal.
import { randomInt } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, type DocumentData, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import {
  RULESETS,
  deserializeState,
  initialState,
  result as gameResult,
  serializePublic,
  serializeState,
  withdraw,
  type InvalidWordRule,
  type Ruleset,
  type TileFace,
} from '@lex/engine';
import { DICTIONARIES } from '@lex/dict';
import { parseTurnOrderChoice } from '@parlor/server';
import type {
  GameServerConfig,
  WithdrawResult,
  InitialGame,
  PushPayload,
  SeatChoice,
  SharedTrigger,
  TriggerArgs,
} from '@parlor/server';

/** Per-game options (DESIGN §2.2) — pinned at creation, immutable after.
 * A meta concept, not an engine one (the engine sees only the Ruleset and an
 * injected Dictionary), so the type lives with the backend; the app's sync
 * layer declares the structurally identical client twin. */
export interface LexGameOptions {
  rulesetId: string;
  dictionaryId: string;
  timeControl: { days: 1 | 3 | 7 } | null;
  /** What invalid words do (§2.3). Optional on the wire — games created before
   * the setting existed carry no field and must keep playing as 'blocked'. */
  invalidWords: InvalidWordRule;
  /** The host's chosen MAXIMUM (DECISIONS 2026-08-28) — the game may start
   * early from the ruleset's minimum. Absent on pre-M7 documents, which
   * re-parse as the two-seat games they are. */
  maxPlayers: number;
}

/** Seat keys in move order. A game only ever uses the first `maxPlayers`. */
export const SEAT_KEYS = ['p0', 'p1', 'p2', 'p3'] as const;

/**
 * The engine's placings as the schema stores them (§6.2): best-first, each
 * holding the seats tied at it. Firestore rejects an array nested directly in
 * an array, so a placing is a MAP rather than a bare list of seat keys.
 */
export function placingsOf(
  standings: readonly (readonly number[])[],
): { seats: string[] }[] {
  return standings.map((tied) => ({ seats: tied.map((seat) => SEAT_KEYS[seat]!) }));
}

/** Fold a per-seat value into the seat-keyed map the schema uses (§6.2). */
export function bySeat<T>(count: number, value: (seat: number) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (let seat = 0; seat < count; seat++) out[SEAT_KEYS[seat]!] = value(seat);
  return out;
}

export function requireRuleset(rulesetId: string): Ruleset {
  const ruleset = RULESETS[rulesetId];
  if (!ruleset) throw new HttpsError('invalid-argument', `unknown ruleset '${rulesetId}'`);
  return ruleset;
}

function parseOptions(raw: unknown): LexGameOptions {
  const o = raw as Partial<Record<keyof LexGameOptions, unknown>> | null;
  if (!o || typeof o.rulesetId !== 'string' || typeof o.dictionaryId !== 'string') {
    throw new HttpsError('invalid-argument', 'malformed game options');
  }
  const ruleset = requireRuleset(o.rulesetId);
  if (!DICTIONARIES.some((d) => d.id === o.dictionaryId)) {
    throw new HttpsError('invalid-argument', `unknown dictionary '${String(o.dictionaryId)}'`);
  }
  const tc = o.timeControl;
  let timeControl: { days: 1 | 3 | 7 } | null = null;
  if (tc !== null && tc !== undefined) {
    const days = (tc as { days?: unknown }).days;
    if (days !== 1 && days !== 3 && days !== 7) {
      throw new HttpsError('invalid-argument', 'timeControl.days must be 1, 3 or 7');
    }
    timeControl = { days };
  }
  // Absent (old clients, older games) ⇒ 'blocked'. Only the exact opt-in value
  // selects the other rule: a malformed setting must never silently change how
  // a game plays, and an unknown one is a client bug worth surfacing.
  const iw = o.invalidWords;
  if (iw !== undefined && iw !== 'blocked' && iw !== 'costs-turn') {
    throw new HttpsError('invalid-argument', "invalidWords must be 'blocked' or 'costs-turn'");
  }
  const invalidWords: InvalidWordRule = iw === 'costs-turn' ? 'costs-turn' : 'blocked';
  // The seat range is a property of the SELECTED ruleset, not of the registry
  // union: a reduced-tile board could not deal four racks (DESIGN §2.2).
  const seats = o.maxPlayers ?? ruleset.players.min;
  if (!Number.isInteger(seats) || (seats as number) < ruleset.players.min || (seats as number) > ruleset.players.max) {
    throw new HttpsError(
      'invalid-argument',
      `maxPlayers must be ${ruleset.players.min}–${ruleset.players.max} for ruleset '${ruleset.id}'`,
    );
  }
  return {
    rulesetId: ruleset.id,
    dictionaryId: o.dictionaryId,
    timeControl,
    invalidWords,
    maxPlayers: seats as number,
  };
}

/** Crypto-shuffled full-tileset permutation (§3.3: randomness at the edge). */
export function shuffledBag(ruleset: Ruleset): TileFace[] {
  const bag: TileFace[] = [];
  for (const [face, count] of Object.entries(ruleset.tiles.counts)) {
    for (let i = 0; i < count; i++) bag.push(face);
  }
  for (let i = bag.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const a = bag[i]!;
    bag[i] = bag[j]!;
    bag[j] = a;
  }
  return bag;
}

function initialGame(options: LexGameOptions, playerCount = 2): InitialGame {
  const ruleset = requireRuleset(options.rulesetId);
  const order = shuffledBag(ruleset);
  const state = initialState(ruleset, order, playerCount);
  return {
    fields: {
      scores: bySeat(playerCount, () => 0),
      bagCount: state.bag.length,
      rackCounts: bySeat(playerCount, (seat) => state.racks[seat]!.length),
      public: serializePublic(state),
    },
    subDocs: [
      {
        path: ['private', 'bag'],
        data: {
          order: order.join(''),
          drawn: playerCount * ruleset.rackSize,
          // Server-private full-state snapshot (§6.2) — submitMove's fast
          // path; tests regression-check it against order+log+events replay.
          state: serializeState(state),
          events: [],
        },
      },
    ],
    // `n` = the move count this rack is current for (client reconciliation).
    rackDocs: state.racks.map((rack) => ({ tiles: rack.join(''), n: 0 })),
  };
}

/** Initial deal for a seat that fills at join/accept time — re-derived from
 * the server-private bag order (no moves exist while a game is open, so the
 * initial deal is still current). Reads before parlor's writes (tx contract). */
async function seatRackDoc(
  tx: Transaction,
  gameRef: DocumentReference,
  game: DocumentData,
  seatIndex: number,
): Promise<Record<string, unknown>> {
  const bag = await tx.get(gameRef.collection('private').doc('bag'));
  const order = (bag.data()?.['order'] as string | undefined) ?? '';
  const { rackSize } = requireRuleset((game['options'] as LexGameOptions).rulesetId);
  const tiles = order.slice(seatIndex * rackSize, (seatIndex + 1) * rackSize);
  if (tiles.length !== rackSize) {
    throw new HttpsError('internal', 'corrupt bag order for this game');
  }
  return { tiles, n: 0 };
}

/**
 * A seat leaves a running 3+ game (DECISIONS 2026-08-28). The engine freezes
 * their score, returns their rack to the BAG END and skips them in the turn
 * order; those tiles are re-shuffled here, exactly as an exchange's are (§3.3),
 * so the remainder stays unpredictable. Reads before parlor's writes.
 */
async function withdrawSeat({
  tx,
  gameRef,
  doc,
  seat,
}: {
  tx: Transaction;
  gameRef: DocumentReference;
  doc: DocumentData;
  seat: number;
}): Promise<WithdrawResult> {
  const bagRef = gameRef.collection('private').doc('bag');
  const bagDoc = await tx.get(bagRef);
  const priv = bagDoc.data() as { order: string; state: string } | undefined;
  if (!priv?.state) throw new HttpsError('internal', 'missing private state');

  const before = deserializeState(priv.state);
  const returned = before.racks[seat]?.length ?? 0;
  let next = withdraw(before, seat);
  let event: { n: number; returned: number; reshuffled: string } | null = null;
  if (returned > 0) {
    const reshuffled = shuffleFaces(next.bag);
    next = withBag(next, reshuffled);
    event = { n: before.moveCount, returned, reshuffled: reshuffled.join('') };
  }

  const seatCount = next.racks.length;
  const outcome = gameResult(next);
  const standings = outcome.status === 'finished' ? placingsOf(outcome.standings) : null;

  return {
    gameFields: {
      public: serializePublic(next),
      toMove: SEAT_KEYS[next.toMove]!,
      scores: bySeat(seatCount, (s) => next.scores[s]!),
      bagCount: next.bag.length,
      rackCounts: bySeat(seatCount, (s) => next.racks[s]!.length),
    },
    subWrites: [
      // The leaver's rack doc empties with their rack.
      ...(doc['players'] && (doc['players'] as Record<string, string | null>)[SEAT_KEYS[seat]!]
        ? [
            {
              path: ['racks', (doc['players'] as Record<string, string>)[SEAT_KEYS[seat]!]!] as const,
              data: { tiles: '', n: before.moveCount + 1 },
            },
          ]
        : []),
      {
        path: ['private', 'bag'] as const,
        data: {
          state: serializeState(next),
          drawn: priv.order.length - next.bag.length,
          ...(event ? { events: FieldValue.arrayUnion(event) } : {}),
        },
        merge: true,
      },
    ],
    terminal:
      outcome.status === 'finished' && standings
        ? {
            result: standings[0]!.seats.length > 1 ? 'draw' : standings[0]!.seats[0]!,
            endedBy: outcome.by,
            standings,
          }
        : null,
  };
}

/** Crypto Fisher-Yates over tile faces (server randomness, §3.3). Shared with
 *  submitMove's exchange re-shuffle. */
export function shuffleFaces(faces: readonly TileFace[]): TileFace[] {
  const out = [...faces];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

/** Same state with the bag remainder replaced, via the frozen serialize
 *  round-trip so no private constructor is needed. */
export function withBag(state: ReturnType<typeof deserializeState>, bag: readonly TileFace[]) {
  const s = JSON.parse(serializeState(state)) as { bag: string };
  s.bag = bag.join('');
  return deserializeState(JSON.stringify(s));
}

/** The opponent-moved push copy: word + score in the body (DESIGN §8). */
export function playedCopy(name: string, word: string, score: number): string {
  return `${name} played ${word} for ${score} — your move.`;
}

/** 'costs-turn' games (§2.3): the opponent burned a turn on a phoney, and the
 * word they tried IS named — the owner's call, DESIGN §3.3. The rack behind it
 * stays secret; only the words the play actually formed become public. */
export function phoneyCopy(name: string, words: readonly string[]): string {
  return `${name} tried to play ${quotedWords(words)} — turn lost. Your move.`;
}

/** `the invalid word “X”` / `the invalid words “X” and “Y”` — one formatter so
 * the push and the in-app surfaces read the same sentence. */
export function quotedWords(words: readonly string[]): string {
  const quoted = words.map((w) => `“${w}”`);
  const list =
    quoted.length <= 1
      ? (quoted[0] ?? '')
      : `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
  return `the invalid word${words.length === 1 ? '' : 's'} ${list}`;
}

export function buildPayload(trigger: SharedTrigger, args: TriggerArgs): PushPayload {
  const link = `/game/${args.gameId}`;
  const tag = `game-${args.gameId}`;
  switch (trigger) {
    case 'opponent-moved':
      return {
        title: `Your move vs. ${args.opponentName}`,
        // T5.3 enriches this with the played word + score (FR: push copy).
        body: args.outcome ?? `${args.opponentName} played — your move.`,
        link,
        tag,
      };
    case 'game-joined':
      return {
        title: `${args.opponentName} joined your game`,
        body: 'The game is on — first rack is dealt.',
        link,
        tag,
      };
    case 'rematch-offered':
      return {
        title: `${args.opponentName} wants a rematch`,
        body: 'The return game is ready — turn order swapped.',
        link,
        tag,
      };
    case 'challenge-received':
      return {
        title: `${args.opponentName} challenges you`,
        body: 'Accept or decline in your lobby.',
        link,
        tag,
      };
    case 'challenge-accepted':
      return {
        title: `${args.opponentName} accepted your challenge`,
        body: 'The game is on — first rack is dealt.',
        link,
        tag,
      };
    case 'challenge-declined':
      // The game doc is deleted on decline — deep-link to the lobby instead.
      return {
        title: `${args.opponentName} declined your challenge`,
        body: 'Maybe another time — start a new game from the lobby.',
        link: '/lobby',
        tag,
      };
    case 'game-over':
      return {
        title: args.outcome ?? 'Game over',
        body: `Game vs. ${args.opponentName} is over — see the final board.`,
        link,
        tag,
      };
    case 'deadline-warning':
      return {
        title: `Your move vs. ${args.opponentName} expires soon`,
        body: `About ${args.hoursLeft ?? 24}h left before the game is forfeit.`,
        link,
        tag,
      };
  }
}

export function isMyTurn(game: DocumentData, uid: string): boolean {
  const players = (game['players'] ?? {}) as Record<string, string | null>;
  const mySeat = SEAT_KEYS.find((key) => players[key] === uid);
  return mySeat !== undefined && game['toMove'] === mySeat;
}

export const lexServerConfig: GameServerConfig<LexGameOptions> = {
  seatKeys: SEAT_KEYS,
  players: { min: 2, max: 4 },
  parseOptions,
  maxPlayers: (options) => options.maxPlayers,
  parseSeatChoice(raw: unknown): SeatChoice {
    // Turn-order choice (DESIGN §2.3): p0 moves first. 'me' and 'them' name a
    // seat outright, so they resolve here. 'random' does NOT: it means "nobody
    // has chosen yet", which is the same statement at two seats as at four, so
    // it defers to the one place that knows how many seats this game holds —
    // `creatorSeatFrom` for a game that deals now, `startGame` for a room.
    // Resolving it here with a coin flip is what made a four-seat 'random'
    // able to pick only seat 0 or 1.
    if (raw === 'me') return 0;
    if (raw === 'them') return 1;
    if (raw === 'random') return { mode: 'random' };
    if (raw && typeof raw === 'object') return parseTurnOrderChoice(raw);
    throw new HttpsError('invalid-argument', "seat must be 'me' | 'them' | 'random' | a turn order");
  },
  timeControlDays: (options) => options.timeControl?.days ?? null,
  initialGame,
  seatRackDoc,
  withdrawSeat,
  notify: { buildPayload, isMyTurn },
};
