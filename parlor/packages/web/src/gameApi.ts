// ported from hive/packages/app/src/sync/gameApi.ts (adapted)
// Typed client wrappers for the shared game callables. Game-specific payloads
// (options shape, seat/turn-order choice, the move itself) are type parameters;
// game-only callables (e.g. lex's submitMove) use the `callable` factory
// directly from the consumer's sync layer.
import { httpsCallable } from 'firebase/functions';
import { getFns } from './firebase';

export function callable<Req, Res>(name: string): (data: Req) => Promise<Res> {
  return async (data) => {
    const fn = httpsCallable<Req, Res>(getFns(), name);
    const res = await fn(data);
    return res.data;
  };
}

/** The cross-game callable surface (hive DESIGN §5.3 / lex DESIGN §6.3). */
export interface GameApi<TOptions, TSeat> {
  createGame(data: { options: TOptions; seat: TSeat }): Promise<{ gameId: string; code: string }>;
  joinGame(data: { code: string }): Promise<{ gameId: string }>;
  cancelGame(data: { gameId: string }): Promise<{ ok: boolean }>;
  challengeUser(data: {
    opponentUid: string;
    options: TOptions;
    seat: TSeat;
  }): Promise<{ gameId: string }>;
  respondChallenge(data: { gameId: string; accept: boolean }): Promise<{ gameId: string }>;
  resign(data: { gameId: string }): Promise<{ ok: boolean }>;
  rematch(data: { gameId: string }): Promise<{ gameId: string }>;
}

export function createGameApi<TOptions, TSeat>(): GameApi<TOptions, TSeat> {
  return {
    createGame: callable('createGame'),
    joinGame: callable('joinGame'),
    cancelGame: callable('cancelGame'),
    challengeUser: callable('challengeUser'),
    respondChallenge: callable('respondChallenge'),
    resign: callable('resign'),
    rematch: callable('rematch'),
  };
}
