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
  state: string;
}

function toSummary(id: string, data: GameDocLobby, uid: string): LobbyGameSummary {
  const myColor: Color = data.players.white === uid ? 'w' : 'b';
  const oppName = myColor === 'w' ? data.playerNames.black : data.playerNames.white;
  return {
    id,
    myColor,
    opponentName: oppName,
    status: data.status,
    toMove: data.toMove,
    ...(data.result ? { result: data.result } : {}),
    ...(data.endedBy ? { endedBy: data.endedBy } : {}),
    updatedAtMs: data.updatedAt?.toMillis() ?? 0,
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
