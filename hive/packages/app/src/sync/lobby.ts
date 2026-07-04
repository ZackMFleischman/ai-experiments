// Lobby data (T4.7): thin Firestore listener hooks feeding TanStack Query
// (DESIGN §6.5). One listener per status bucket — all three share the
// playerIds+status+updatedAt composite index.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type QuerySnapshot,
} from 'firebase/firestore';
import type { Color } from '@hive/engine';
import { useEffect } from 'react';
import type { LobbyGameSummary } from '../screens/lobbyView';
import { getDb } from './firebase';

interface GameDocLobby {
  players: { white: string | null; black: string | null };
  playerNames: { white: string | null; black: string | null };
  status: 'open' | 'active' | 'finished';
  toMove: Color;
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
    state: data.state,
  };
}

const STATUSES = ['open', 'active', 'finished'] as const;

export function useMyGames(uid: string): { games: LobbyGameSummary[]; loading: boolean } {
  const client = useQueryClient();

  useEffect(() => {
    const unsubs = STATUSES.map((status) =>
      onSnapshot(
        query(
          collection(getDb(), 'games'),
          where('playerIds', 'array-contains', uid),
          where('status', '==', status),
          orderBy('updatedAt', 'desc'),
        ),
        (snap: QuerySnapshot) => {
          const games = snap.docs.map((d) => toSummary(d.id, d.data() as GameDocLobby, uid));
          client.setQueryData(['games', uid, status], games);
        },
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [client, uid]);

  const bucket = (status: (typeof STATUSES)[number]) => ({
    queryKey: ['games', uid, status],
    queryFn: () => [] as LobbyGameSummary[],
    enabled: false, // listener-fed via setQueryData
  });
  const open = useQuery<LobbyGameSummary[]>(bucket('open'));
  const active = useQuery<LobbyGameSummary[]>(bucket('active'));
  const finished = useQuery<LobbyGameSummary[]>(bucket('finished'));

  const buckets = [open, active, finished];
  const loading = buckets.every((b) => b.data === undefined);
  const games = buckets.flatMap((b) => b.data ?? []);
  return { games, loading };
}
