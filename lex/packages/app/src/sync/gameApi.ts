// ported from hive/packages/app/src/sync/gameApi.ts (adapted)
// Typed client wrappers for the DESIGN §6.3 callables: the cross-game surface
// comes from @parlor/web; submitMove (game-specific payload) uses the callable
// factory directly. The client twin of the backend's LexGameOptions —
// structurally identical; the e2e exercises compatibility.
import { callable, createGameApi } from '@parlor/web/gameApi';
import type { TurnOrderChoice } from '@parlor/web/lobby-ui';
import type { Placement, TileFace } from '@lex/engine';

export interface LexGameOptions {
  rulesetId: string;
  dictionaryId: string;
  timeControl: { days: 1 | 3 | 7 } | null;
  /** The host's chosen MAXIMUM seat count (DECISIONS 2026-08-28). Absent means
   * two — the shape every game shipped before M7. */
  maxPlayers?: number;
}

export type SeatChoice = 'me' | 'them' | 'random';

const api = createGameApi<LexGameOptions, SeatChoice>();

export const { createGame, joinGame, cancelGame, challengeUser, respondChallenge, resign, rematch } =
  api;

/** The typed JSON move on the wire (DESIGN §2.4). */
export type WireMove =
  | { type: 'play'; placements: ReadonlyArray<{ row: number; col: number; letter: string; isBlank: boolean }> }
  | { type: 'exchange'; tiles: readonly TileFace[] }
  | { type: 'pass' };

export function toWireMove(
  move:
    | { type: 'play'; placements: readonly Placement[] }
    | { type: 'exchange'; tiles: readonly TileFace[] }
    | { type: 'pass' },
): WireMove {
  if (move.type === 'play') {
    return {
      type: 'play',
      placements: move.placements.map((p) => ({
        row: p.cell.row,
        col: p.cell.col,
        letter: p.letter,
        isBlank: p.isBlank,
      })),
    };
  }
  return move;
}

export const submitMove = callable<
  { gameId: string; expectedMoveCount: number; move: WireMove },
  { moveCount: number }
>('submitMove');

// ── The 3+ guest-list callables (DESIGN §6.3). They exist on the shared server
// but are not part of `GameApi` (every one refuses a two-seat doc), so the
// wrappers are declared here like submitMove's.

/** Host-only. `expectedRoster` is the list the host was LOOKING at, so a
 *  last-second joiner is never silently left out (the call fails instead). */
export const startGame = callable<
  { gameId: string; expectedRoster: string[]; turnOrder?: TurnOrderChoice },
  { gameId: string; started: boolean }
>('startGame');

/** Host-only, and persisted BEFORE the start so the arrangement is not a
 *  host-only secret — everyone in the room watches it change. */
export const setTurnOrder = callable<
  { gameId: string; turnOrder: TurnOrderChoice },
  { gameId: string; turnOrder: TurnOrderChoice }
>('setTurnOrder');

/** Accept or decline an invitation. A decline never deletes the game. */
export const respondInvite = callable<
  { gameId: string; accept: boolean },
  { gameId: string; started: boolean }
>('respondInvite');

/** Host-only, additive recruiting — an invitation reserves nothing. */
export const invitePlayers = callable<{ gameId: string; uids: string[] }, { invited: string[] }>(
  'invitePlayers',
);

/** Take your own name off a guest list before the game starts. */
export const leaveGame = callable<{ gameId: string }, { gameId: string; deleted: boolean }>(
  'leaveGame',
);
