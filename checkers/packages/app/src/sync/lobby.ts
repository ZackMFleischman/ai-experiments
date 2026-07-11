// checkers's lobby doc→summary mapping over @parlor/web's listener hooks. The
// parlor hook owns the query/cache mechanics; the seat naming and card
// fields are checkers's. Seats: 'attackers' = 0 (moves first), 'defenders' = 1.
import type { DocumentData } from 'firebase/firestore';
import { useMyGames } from '@parlor/web/lobby';
import { deserializeCheckers } from '@checkers/engine';
import type { LobbyGameSummary } from '../screens/lobbyView';

interface GameDocLobby {
  players: { attackers: string | null; defenders: string | null };
  playerNames: { attackers: string | null; defenders: string | null };
  status: 'open' | 'active' | 'finished';
  toMove: 'attackers' | 'defenders';
  moveCount?: number;
  activatedBy?: string;
  result?: 'attackers' | 'defenders' | 'draw';
  endedBy?: string;
  updatedAt?: { toMillis(): number };
  deadlineAt?: { toMillis(): number };
  state: string;
  challenge?: { from: string; fromName: string; to: string; toName: string };
}

export function toSummary(id: string, raw: DocumentData, uid: string): LobbyGameSummary {
  const data = raw as GameDocLobby;
  // On an incoming challenge the caller isn't seated yet — their seat is the
  // empty one (respondChallenge fills it on accept).
  const mySeat: 0 | 1 =
    data.players.attackers === uid
      ? 0
      : data.players.defenders === uid
        ? 1
        : data.players.attackers === null
          ? 0
          : 1;
  const challenge = data.challenge
    ? {
        direction: data.challenge.to === uid ? ('incoming' as const) : ('outgoing' as const),
        name: data.challenge.to === uid ? data.challenge.fromName : data.challenge.toName,
      }
    : undefined;
  const oppName =
    challenge?.name ??
    (mySeat === 0 ? data.playerNames.defenders : data.playerNames.attackers);
  const oppUid =
    [data.players.attackers, data.players.defenders].find((p) => p !== null && p !== uid) ??
    (data.challenge ? (data.challenge.to === uid ? data.challenge.from : data.challenge.to) : null);
  const fresh =
    data.status === 'active' &&
    data.moveCount === 0 &&
    data.activatedBy !== undefined &&
    data.activatedBy !== uid;
  // The shared result chip keys off p0/p1 seat indices.
  const result =
    data.result === 'attackers' ? ('p0' as const) : data.result === 'defenders' ? ('p1' as const) : data.result;
  return {
    id,
    mySeat,
    opponentName: oppName,
    ...(oppUid ? { opponentUid: oppUid } : {}),
    ...(challenge ? { challenge } : {}),
    status: data.status,
    toMove: data.toMove === 'attackers' ? 0 : 1,
    ...(result ? { result } : {}),
    ...(data.endedBy ? { endedBy: data.endedBy } : {}),
    updatedAtMs: data.updatedAt?.toMillis() ?? 0,
    ...(data.deadlineAt ? { deadlineAtMs: data.deadlineAt.toMillis() } : {}),
    ...(fresh ? { freshFromOpponent: true } : {}),
    board: deserializeCheckers(data.state).board,
    moveCount: data.moveCount ?? 0,
  };
}

export function useCheckersGames(uid: string): { games: LobbyGameSummary[]; loading: boolean } {
  return useMyGames<LobbyGameSummary>(uid, toSummary);
}
