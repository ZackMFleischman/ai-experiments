// ported from hive/packages/app/src/sync/lobby.ts (adapted)
// Lobby data: thin Firestore listener hooks feeding TanStack Query. One
// listener per status bucket — all three share the playerIds+status+updatedAt
// composite index. Doc-shape knowledge (seat names, summary fields) stays in
// the consuming game's `toSummary`.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QuerySnapshot,
} from 'firebase/firestore';
import { useEffect } from 'react';
import { getDb } from './firebase';

export const GAME_STATUSES = ['open', 'active', 'finished'] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export function useMyGames<TSummary>(
  uid: string,
  toSummary: (id: string, data: DocumentData, uid: string) => TSummary,
): { games: TSummary[]; loading: boolean } {
  const client = useQueryClient();

  useEffect(() => {
    const unsubs = GAME_STATUSES.map((status) =>
      onSnapshot(
        query(
          collection(getDb(), 'games'),
          where('playerIds', 'array-contains', uid),
          where('status', '==', status),
          orderBy('updatedAt', 'desc'),
        ),
        (snap: QuerySnapshot) => {
          const games = snap.docs.map((d) => toSummary(d.id, d.data(), uid));
          client.setQueryData(['games', uid, status], games);
        },
      ),
    );
    return () => unsubs.forEach((u) => u());
    // toSummary is a pure mapper — consumers pass a module-level function, so
    // it is deliberately not a dependency (re-subscribing per render would
    // tear down the listeners).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, uid]);

  const bucket = (status: GameStatus) => ({
    queryKey: ['games', uid, status],
    queryFn: () => [] as TSummary[],
    enabled: false, // listener-fed via setQueryData
  });
  const open = useQuery<TSummary[]>(bucket('open'));
  const active = useQuery<TSummary[]>(bucket('active'));
  const finished = useQuery<TSummary[]>(bucket('finished'));

  const buckets = [open, active, finished];
  const loading = buckets.every((b) => b.data === undefined);
  const games = buckets.flatMap((b) => b.data ?? []);
  return { games, loading };
}
