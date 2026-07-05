// Lex's lobby doc→summary mapping over @parlor/web's listener hooks (T4.7).
// The parlor hook owns the query/cache mechanics; the seat naming and card
// fields are lex's.
import type { DocumentData } from 'firebase/firestore';
import type { Seat } from '@lex/engine';
import { useMyGames } from '@parlor/web/lobby';
import type { LobbyGameSummary } from '../screens/lobbyView';
import type { LexGameOptions } from '../gameOptions';

interface GameDocLobby {
  players: { p0: string | null; p1: string | null };
  playerNames: { p0: string | null; p1: string | null };
  options: LexGameOptions;
  status: 'open' | 'active' | 'finished';
  toMove: 'p0' | 'p1';
  moveCount?: number;
  activatedBy?: string;
  result?: 'p0' | 'p1' | 'draw';
  endedBy?: string;
  updatedAt?: { toMillis(): number };
  deadlineAt?: { toMillis(): number };
  public: string;
  scores?: { p0: number; p1: number };
  lastPlay?: { by: string; word: string; score: number };
  challenge?: { from: string; fromName: string; to: string; toName: string };
}

export function toSummary(id: string, raw: DocumentData, uid: string): LobbyGameSummary {
  const data = raw as GameDocLobby;
  // On an incoming challenge the caller isn't seated yet — their seat is the
  // empty one (respondChallenge fills it on accept).
  const mySeat: Seat =
    data.players.p0 === uid ? 0 : data.players.p1 === uid ? 1 : data.players.p0 === null ? 0 : 1;
  const challenge = data.challenge
    ? {
        direction: data.challenge.to === uid ? ('incoming' as const) : ('outgoing' as const),
        name: data.challenge.to === uid ? data.challenge.fromName : data.challenge.toName,
      }
    : undefined;
  const oppName =
    challenge?.name ?? (mySeat === 0 ? data.playerNames.p1 : data.playerNames.p0);
  const oppUid =
    [data.players.p0, data.players.p1].find((p) => p !== null && p !== uid) ??
    (data.challenge ? (data.challenge.to === uid ? data.challenge.from : data.challenge.to) : null);
  // Just started by the opponent (accepted invite/challenge, rematch offer) —
  // badge-worthy news even before it's my move (DESIGN §7.1).
  const fresh =
    data.status === 'active' &&
    data.moveCount === 0 &&
    data.activatedBy !== undefined &&
    data.activatedBy !== uid;
  const lastPlay = data.lastPlay
    ? {
        by: (data.lastPlay.by === data.players.p0 ? 0 : 1) as Seat,
        word: data.lastPlay.word,
        score: data.lastPlay.score,
      }
    : undefined;
  return {
    id,
    mySeat,
    opponentName: oppName,
    ...(oppUid ? { opponentUid: oppUid } : {}),
    ...(challenge ? { challenge } : {}),
    status: data.status,
    toMove: data.toMove === 'p0' ? 0 : 1,
    ...(data.result ? { result: data.result } : {}),
    ...(data.endedBy ? { endedBy: data.endedBy } : {}),
    updatedAtMs: data.updatedAt?.toMillis() ?? 0,
    ...(data.deadlineAt ? { deadlineAtMs: data.deadlineAt.toMillis() } : {}),
    ...(fresh ? { freshFromOpponent: true } : {}),
    public: data.public,
    rulesetId: data.options.rulesetId,
    scores: [data.scores?.p0 ?? 0, data.scores?.p1 ?? 0],
    ...(lastPlay ? { lastPlay } : {}),
  };
}

export function useLexGames(uid: string): { games: LobbyGameSummary[]; loading: boolean } {
  return useMyGames<LobbyGameSummary>(uid, toSummary);
}
