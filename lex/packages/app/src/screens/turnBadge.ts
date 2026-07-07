// Lex turn awareness: the badge logic lives in @parlor/web/lobby-ui — this
// file binds lex's base title ("(n) LEX") and re-exports the shared actionable
// count (which must stay in step with the server's countActionable). The
// full-mode lobby feeds it the count. Firebase-free.
import {
  actionableCount as parlorActionableCount,
  applyTurnBadge as parlorApplyTurnBadge,
  makeTurnBadge,
} from '@parlor/web/lobby-ui';
import type { LobbyGameSummary } from './lobbyView';

const BASE_TITLE = 'LEX';

export function actionableCount(games: LobbyGameSummary[]): number {
  return parlorActionableCount(games);
}

export function applyTurnBadge(count: number): void {
  parlorApplyTurnBadge(count, BASE_TITLE);
}

export const useTurnBadge = makeTurnBadge(BASE_TITLE);
