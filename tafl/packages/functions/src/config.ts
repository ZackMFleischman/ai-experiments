// tafl's GameServerConfig: the injection points @parlor/server's shared
// callables need. tafl names its seats by SIDE — 'attackers' = seat 0 (moves
// first), 'defenders' = seat 1 — and the engine's `toMove` uses the same two
// strings, so parlor's seat-key defaults (`toMove: seatKeys[0]` on create)
// are already the engine's truth: no toMove override, no color↔seat mapping
// anywhere. A perfect-information game: the FULL serialized engine state
// lives on the game doc; there are no racks and no private docs.
import { randomInt } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  IllegalMoveError,
  applyTafl,
  deserializeTafl,
  initialTafl,
  moveName,
  serializeTafl,
  type Side,
  type TaflMove,
} from '@tafl/engine';
import type {
  GameServerConfig,
  InitialGame,
  NotifyConfig,
  PushPayload,
  SharedTrigger,
  SubmitMoveConfig,
  TriggerArgs,
} from '@parlor/server';

/** Per-game options: tafl has one ruleset (Brandub), so only the async time
 * control travels. The app declares the structurally identical client twin
 * in sync/gameApi.ts. */
export interface TaflGameOptions {
  timeControl: { days: 1 | 3 | 7 } | null;
}

export function parseOptions(raw: unknown): TaflGameOptions {
  const o = raw as Partial<Record<string, unknown>> | null;
  if (!o || typeof o !== 'object') {
    throw new HttpsError('invalid-argument', 'malformed game options');
  }
  const tc = o['timeControl'];
  let timeControl: { days: 1 | 3 | 7 } | null = null;
  if (tc !== null && tc !== undefined) {
    const days = (tc as { days?: unknown }).days;
    if (days !== 1 && days !== 3 && days !== 7) {
      throw new HttpsError('invalid-argument', 'timeControl.days must be 1, 3 or 7');
    }
    timeControl = { days };
  }
  return { timeControl };
}

function initialGame(_options: TaflGameOptions): InitialGame {
  return {
    fields: {
      state: serializeTafl(initialTafl()),
    },
    subDocs: [],
  };
}

/** Push copy per trigger — the recipient's perspective. */
function buildPayload(trigger: SharedTrigger, args: TriggerArgs): PushPayload {
  const link = `/game/${args.gameId}`;
  const tag = `tafl-${args.gameId}`;
  switch (trigger) {
    case 'opponent-moved':
      return { title: 'Your move', body: `${args.opponentName} moved.`, link, tag };
    case 'game-joined':
      return {
        title: 'Game on',
        body: `${args.opponentName} took the other side — attackers open.`,
        link,
        tag,
      };
    case 'rematch-offered':
      return { title: 'Rematch?', body: `${args.opponentName} wants another round.`, link, tag };
    case 'challenge-received':
      return { title: 'Challenge', body: `${args.opponentName} challenges you.`, link, tag };
    case 'challenge-accepted':
      return { title: 'Game on', body: `${args.opponentName} accepted.`, link, tag };
    case 'challenge-declined':
      return { title: 'Declined', body: `${args.opponentName} declined.`, link, tag };
    case 'game-over':
      return { title: 'Game over', body: args.outcome ?? 'The game ended.', link, tag };
    case 'deadline-warning':
      return {
        title: 'Move or forfeit',
        body: `~${args.hoursLeft ?? 0}h left against ${args.opponentName}.`,
        link,
        tag,
      };
  }
}

export const notifyConfig: NotifyConfig = {
  buildPayload,
  // toMove is a seat key ('attackers' | 'defenders') — the doc answers directly.
  isMyTurn(game, uid) {
    const doc = game as { players?: Record<string, string | null>; toMove?: string };
    return doc.players?.[doc.toMove ?? ''] === uid;
  },
};

export const taflServerConfig: GameServerConfig<TaflGameOptions> = {
  // Attackers move first (seat 0); result + player maps key by these.
  seatKeys: ['attackers', 'defenders'],
  parseOptions,
  parseSeatChoice(raw: unknown): 0 | 1 {
    if (raw === 'attackers') return 0;
    if (raw === 'defenders') return 1;
    if (raw === 'random') return randomInt(2) === 0 ? 0 : 1;
    throw new HttpsError('invalid-argument', "side must be 'attackers' | 'defenders' | 'random'");
  },
  timeControlDays: (options) => options.timeControl?.days ?? null,
  initialGame,
  notify: notifyConfig,
};

/** The wire move: plain cell indices; the state-dependent legality check
 * happens inside the transaction, in advance. */
export const taflSubmitConfig: SubmitMoveConfig<TaflGameOptions, TaflMove> = {
  ...taflServerConfig,
  parseMove(data: unknown): TaflMove {
    const move = (data as { move?: unknown })?.move as { from?: unknown; to?: unknown } | undefined;
    if (
      !move ||
      typeof move.from !== 'number' ||
      typeof move.to !== 'number' ||
      !Number.isInteger(move.from) ||
      !Number.isInteger(move.to)
    ) {
      throw new HttpsError('invalid-argument', 'expected {gameId, expectedMoveCount, move:{from,to}}');
    }
    return { from: move.from, to: move.to };
  },
  advance({ doc, move, mySeat, caller, gameId }) {
    const d = doc as {
      players: { attackers: string | null; defenders: string | null };
      state: string;
    };
    const state = deserializeTafl(d.state);
    const mySide: Side = mySeat === 0 ? 'attackers' : 'defenders';
    if (state.toMove !== mySide) {
      // The shell already guards turn order via isMyTurn; this catches a
      // snapshot/toMove divergence rather than trusting one blindly.
      throw new HttpsError('failed-precondition', 'snapshot out of turn');
    }
    let next;
    try {
      next = applyTafl(state, move);
    } catch (err) {
      if (err instanceof IllegalMoveError || err instanceof Error) {
        throw new HttpsError('invalid-argument', `illegal move: ${(err as Error).message}`);
      }
      throw err;
    }

    const recipientUid = mySeat === 0 ? d.players.defenders : d.players.attackers;
    const terminal = next.result
      ? next.result.winner === null
        ? { result: 'draw', endedBy: next.result.by }
        : { result: next.result.winner, endedBy: next.result.by }
      : null;
    let recipientOutcome: string | null = null;
    if (terminal) {
      const recipientSide: Side = mySeat === 0 ? 'defenders' : 'attackers';
      recipientOutcome =
        terminal.result === 'draw'
          ? 'Draw'
          : terminal.result === recipientSide
            ? 'You won!'
            : 'You lost';
    }

    return {
      moveDoc: { kind: 'move', from: move.from, to: move.to, name: moveName(move) },
      gameFields: { state: serializeTafl(next), toMove: next.toMove },
      terminal,
      push: {
        recipientUid,
        trigger: recipientOutcome ? 'game-over' : 'opponent-moved',
        args: {
          gameId,
          opponentName: caller.name,
          ...(recipientOutcome ? { outcome: recipientOutcome } : {}),
        },
      },
    };
  },
};
