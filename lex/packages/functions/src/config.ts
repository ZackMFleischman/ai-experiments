// Lex's GameServerConfig (T4.4, DESIGN §6.3): seat model, option validation
// against the ruleset/dictionary registries, and the hidden-information
// initial state — crypto-shuffled bag persisted server-private, racks dealt
// exactly as the engine deals them (initialState draws seat 0 then seat 1
// from the bag front), so server replay reproduces the deal.
import { randomInt } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData, DocumentReference, Transaction } from 'firebase-admin/firestore';
import {
  RULESETS,
  initialState,
  serializePublic,
  serializeState,
  type InvalidWordRule,
  type Ruleset,
  type TileFace,
} from '@lex/engine';
import { DICTIONARIES } from '@lex/dict';
import type {
  GameServerConfig,
  InitialGame,
  PushPayload,
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
  return { rulesetId: ruleset.id, dictionaryId: o.dictionaryId, timeControl, invalidWords };
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

function initialGame(options: LexGameOptions): InitialGame {
  const ruleset = requireRuleset(options.rulesetId);
  const order = shuffledBag(ruleset);
  const state = initialState(ruleset, order, 2);
  return {
    fields: {
      scores: { p0: 0, p1: 0 },
      bagCount: state.bag.length,
      rackCounts: { p0: ruleset.rackSize, p1: ruleset.rackSize },
      public: serializePublic(state),
    },
    subDocs: [
      {
        path: ['private', 'bag'],
        data: {
          order: order.join(''),
          drawn: 2 * ruleset.rackSize,
          // Server-private full-state snapshot (§6.2) — submitMove's fast
          // path; tests regression-check it against order+log+events replay.
          state: serializeState(state),
          events: [],
        },
      },
    ],
    // `n` = the move count this rack is current for (client reconciliation).
    rackDocs: [
      { tiles: state.racks[0]!.join(''), n: 0 },
      { tiles: state.racks[1]!.join(''), n: 0 },
    ],
  };
}

/** Initial deal for a seat that fills at join/accept time — re-derived from
 * the server-private bag order (no moves exist while a game is open, so the
 * initial deal is still current). Reads before parlor's writes (tx contract). */
async function seatRackDoc(
  tx: Transaction,
  gameRef: DocumentReference,
  game: DocumentData,
  seatIndex: 0 | 1,
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

/** The opponent-moved push copy: word + score in the body (DESIGN §8). */
export function playedCopy(name: string, word: string, score: number): string {
  return `${name} played ${word} for ${score} — your move.`;
}

/** 'costs-turn' games (§2.3): the opponent burned a turn on a phoney. The word
 * is NOT in the copy — those letters are still in their rack, and a push is as
 * public as any other doc (privacy invariant). */
export function phoneyCopy(name: string): string {
  return `${name} played a word that isn’t in the dictionary and lost the turn — your move.`;
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
  const players = game['players'] as { p0: string | null; p1: string | null };
  const mySeat = players.p0 === uid ? 'p0' : 'p1';
  return game['toMove'] === mySeat;
}

export const lexServerConfig: GameServerConfig<LexGameOptions> = {
  seatKeys: ['p0', 'p1'],
  parseOptions,
  parseSeatChoice(raw: unknown): 0 | 1 {
    // Turn-order choice (DESIGN §2.3): p0 moves first.
    if (raw === 'me') return 0;
    if (raw === 'them') return 1;
    if (raw === 'random') return randomInt(2) === 0 ? 0 : 1;
    throw new HttpsError('invalid-argument', "seat must be 'me' | 'them' | 'random'");
  },
  timeControlDays: (options) => options.timeControl?.days ?? null,
  initialGame,
  seatRackDoc,
  notify: { buildPayload, isMyTurn },
};
