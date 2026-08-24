// ported from hive/packages/app/src/sync/gameApi.ts (adapted)
// Typed client wrappers for the DESIGN §6.3 callables: the cross-game surface
// comes from @parlor/web; submitMove (game-specific payload) uses the callable
// factory directly. The client twin of the backend's LexGameOptions —
// structurally identical; the e2e exercises compatibility.
import { callable, createGameApi } from '@parlor/web/gameApi';
import type { Placement, TileFace } from '@lex/engine';

export interface LexGameOptions {
  rulesetId: string;
  dictionaryId: string;
  timeControl: { days: 1 | 3 | 7 } | null;
  hardMode: boolean;
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
