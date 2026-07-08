// Lobby data (T4.7): hive's doc→summary mapping over @parlor/web's listener
// hook (DESIGN §6.5). The parlor hook owns the per-status-bucket listeners +
// TanStack Query cache mechanics; the seat naming (white/black) and card fields
// are hive's.
import type { Color } from '@hive/engine';
import { useMyGames as useMyGamesBase } from '@parlor/web/lobby';
import type { LobbyGameSummary } from '../screens/lobbyView';

interface GameDocLobby {
  players: { white: string | null; black: string | null };
  playerNames: { white: string | null; black: string | null };
  status: 'open' | 'active' | 'finished';
  toMove: Color;
  moveCount?: number;
  activatedBy?: string;
  result?: 'white' | 'black' | 'draw';
  endedBy?: string;
  updatedAt?: { toMillis(): number };
  deadlineAt?: { toMillis(): number };
  state: string;
  challenge?: { from: string; fromName: string; to: string; toName: string };
}

function toSummary(id: string, data: GameDocLobby, uid: string): LobbyGameSummary {
  // On an incoming challenge the caller isn't seated yet — their seat is the
  // empty one (respondChallenge fills it on accept).
  const myColor: Color =
    data.players.white === uid
      ? 'w'
      : data.players.black === uid
        ? 'b'
        : data.players.white === null
          ? 'w'
          : 'b';
  const challenge = data.challenge
    ? {
        direction: data.challenge.to === uid ? ('incoming' as const) : ('outgoing' as const),
        name: data.challenge.to === uid ? data.challenge.fromName : data.challenge.toName,
      }
    : undefined;
  const oppName =
    challenge?.name ?? (myColor === 'w' ? data.playerNames.black : data.playerNames.white);
  const oppUid =
    [data.players.white, data.players.black].find((p) => p !== null && p !== uid) ??
    (data.challenge ? (data.challenge.to === uid ? data.challenge.from : data.challenge.to) : null);
  // Just started by the opponent (accepted invite/challenge, rematch offer) —
  // badge-worthy news even before it's my move (DESIGN §7).
  const fresh =
    data.status === 'active' &&
    data.moveCount === 0 &&
    data.activatedBy !== undefined &&
    data.activatedBy !== uid;
  return {
    id,
    myColor,
    opponentName: oppName,
    ...(oppUid ? { opponentUid: oppUid } : {}),
    ...(challenge ? { challenge } : {}),
    status: data.status,
    toMove: data.toMove,
    ...(data.result ? { result: data.result } : {}),
    ...(data.endedBy ? { endedBy: data.endedBy } : {}),
    updatedAtMs: data.updatedAt?.toMillis() ?? 0,
    ...(data.deadlineAt ? { deadlineAtMs: data.deadlineAt.toMillis() } : {}),
    ...(fresh ? { freshFromOpponent: true } : {}),
    state: data.state,
  };
}

export function useMyGames(uid: string): { games: LobbyGameSummary[]; loading: boolean } {
  return useMyGamesBase<LobbyGameSummary>(uid, (id, data, u) =>
    toSummary(id, data as GameDocLobby, u),
  );
}
