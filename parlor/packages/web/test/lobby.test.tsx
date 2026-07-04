// @vitest-environment jsdom
// T4.1: useMyGames — one listener per status bucket feeding the query cache,
// with the game-specific doc→summary mapping injected by the consumer.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

// TanStack Query batches observer notifications on a timer tick.
const tick = () => new Promise((r) => setTimeout(r, 0));

interface FakeQuery {
  filters: Array<{ field: string; op: string; value: unknown }>;
}
type SnapshotCallback = (snap: {
  docs: Array<{ id: string; data(): Record<string, unknown> }>;
}) => void;

const listeners: Array<{ query: FakeQuery; cb: SnapshotCallback; unsub: () => void }> = [];
const unsubscribed: FakeQuery[] = [];

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  query: (_coll: unknown, ...clauses: Array<Record<string, unknown>>) => ({
    filters: clauses.filter((c) => c['kind'] === 'where'),
  }),
  where: (field: string, op: string, value: unknown) => ({ kind: 'where', field, op, value }),
  orderBy: (field: string, dir: string) => ({ kind: 'orderBy', field, dir }),
  onSnapshot: (q: FakeQuery, cb: SnapshotCallback) => {
    const unsub = () => unsubscribed.push(q);
    listeners.push({ query: q, cb, unsub });
    return unsub;
  },
}));

vi.mock('../src/firebase', () => ({ getDb: () => ({}) }));

import { useMyGames } from '../src/lobby';

interface Summary {
  id: string;
  opponent: string;
  status: string;
}

const toSummary = (id: string, data: Record<string, unknown>, uid: string): Summary => ({
  id,
  opponent: String(data.opponent),
  status: `${String(data.status)}:${uid}`,
});

let latest: { games: Summary[]; loading: boolean } | undefined;
function Probe({ uid }: { uid: string }) {
  latest = useMyGames<Summary>(uid, toSummary);
  return <div>{latest.loading ? 'loading' : `games:${latest.games.length}`}</div>;
}

function renderLobby(uid = 'u1') {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <Probe uid={uid} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listeners.length = 0;
  unsubscribed.length = 0;
  latest = undefined;
});

describe('useMyGames', () => {
  it('subscribes one listener per status bucket, filtered to the caller', () => {
    renderLobby('u42');
    expect(listeners).toHaveLength(3);
    const statuses = listeners.map(
      (l) => l.query.filters.find((f) => f.field === 'status')?.value,
    );
    expect(statuses).toEqual(['open', 'active', 'finished']);
    for (const l of listeners) {
      expect(l.query.filters).toContainEqual({
        kind: 'where',
        field: 'playerIds',
        op: 'array-contains',
        value: 'u42',
      });
    }
  });

  it('is loading until a snapshot lands, then maps docs through toSummary', async () => {
    renderLobby('u1');
    expect(screen.getByText('loading')).toBeTruthy();
    await act(async () => {
      listeners[1]?.cb({
        docs: [
          { id: 'g1', data: () => ({ opponent: 'Sam', status: 'active' }) },
          { id: 'g2', data: () => ({ opponent: 'Ada', status: 'active' }) },
        ],
      });
      await tick();
    });
    expect(screen.getByText('games:2')).toBeTruthy();
    expect(latest?.games[0]).toEqual({ id: 'g1', opponent: 'Sam', status: 'active:u1' });
  });

  it('merges buckets into one list', async () => {
    renderLobby('u1');
    await act(async () => {
      listeners[0]?.cb({ docs: [{ id: 'o1', data: () => ({ opponent: 'A', status: 'open' }) }] });
      listeners[2]?.cb({
        docs: [{ id: 'f1', data: () => ({ opponent: 'B', status: 'finished' }) }],
      });
      await tick();
    });
    expect(latest?.games.map((g) => g.id).sort()).toEqual(['f1', 'o1']);
  });

  it('tears down all listeners on unmount', () => {
    const { unmount } = renderLobby('u1');
    unmount();
    expect(unsubscribed).toHaveLength(3);
  });
});
