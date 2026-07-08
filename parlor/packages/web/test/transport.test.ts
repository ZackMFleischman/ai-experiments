// Phase 3: the shared FirestoreTransport plumbing. The subtle, security-relevant
// piece is watchGameMeta's delete-detection — a game doc deleted under a live
// listener surfaces as a permission-denied ERROR (the read rule needs
// resource.data.playerIds, which a deleted doc lacks), NOT an exists:false
// snapshot, and either must reach cb(null) only after the doc was seen once.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SnapHandlers = {
  next: (snap: { exists(): boolean; data(): unknown }) => void;
  error: (err: { code?: string }) => void;
};
let handlers: SnapHandlers | undefined;
let unsubbed = false;

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => ({ args }),
  collection: (...args: unknown[]) => ({ args }),
  query: (...args: unknown[]) => ({ args }),
  orderBy: (...args: unknown[]) => ({ args }),
  getDocs: vi.fn(),
  onSnapshot: (
    _ref: unknown,
    next: SnapHandlers['next'],
    error: SnapHandlers['error'],
  ) => {
    handlers = { next, error };
    return () => {
      unsubbed = true;
    };
  },
}));
vi.mock('../src/firebase', () => ({ getDb: () => ({}) }));

import { seatIndexOf, watchGameMeta } from '../src/transport';

const snap = (exists: boolean, data: unknown = {}) => ({ exists: () => exists, data: () => data });

beforeEach(() => {
  handlers = undefined;
  unsubbed = false;
});

describe('seatIndexOf', () => {
  const players = { white: 'ada', black: 'sam' };
  it('resolves each seat by key order (0 = first key)', () => {
    expect(seatIndexOf(players, 'ada', ['white', 'black'])).toBe(0);
    expect(seatIndexOf(players, 'sam', ['white', 'black'])).toBe(1);
  });
  it('is null for a non-player', () => {
    expect(seatIndexOf(players, 'eve', ['white', 'black'])).toBeNull();
  });
  it('honors the seat-key order the game passes', () => {
    expect(seatIndexOf({ p0: 'x', p1: 'y' }, 'y', ['p0', 'p1'])).toBe(1);
  });
});

describe('watchGameMeta', () => {
  it('maps the doc and reports meta while it exists', () => {
    const seen: Array<unknown> = [];
    watchGameMeta('g1', (d) => (d as { status: string }).status, (m) => seen.push(m));
    handlers!.next(snap(true, { status: 'active' }));
    expect(seen).toEqual(['active']);
  });

  it('reports null when a SEEN doc disappears as exists:false (e.g. cancel)', () => {
    const seen: Array<unknown> = [];
    watchGameMeta('g1', (d) => (d as { status: string }).status, (m) => seen.push(m));
    handlers!.next(snap(true, { status: 'open' }));
    handlers!.next(snap(false));
    expect(seen).toEqual(['open', null]);
  });

  it('reports null when a SEEN doc is deleted as a permission-denied error', () => {
    const seen: Array<unknown> = [];
    watchGameMeta('g1', (d) => (d as { status: string }).status, (m) => seen.push(m));
    handlers!.next(snap(true, { status: 'open' }));
    handlers!.error({ code: 'permission-denied' });
    expect(seen).toEqual(['open', null]);
  });

  it('does NOT report null before the doc has been seen (missing/forbidden at open)', () => {
    const seen: Array<unknown> = [];
    watchGameMeta('g1', () => 'x', (m) => seen.push(m));
    handlers!.next(snap(false));
    handlers!.error({ code: 'permission-denied' });
    expect(seen).toEqual([]);
  });

  it('ignores non-permission errors', () => {
    const seen: Array<unknown> = [];
    watchGameMeta('g1', () => 'x', (m) => seen.push(m));
    handlers!.next(snap(true, {}));
    handlers!.error({ code: 'unavailable' });
    expect(seen).toEqual(['x']);
  });

  it('returns the unsubscribe from onSnapshot', () => {
    const unsub = watchGameMeta('g1', () => 'x', () => {});
    expect(unsubbed).toBe(false);
    unsub();
    expect(unsubbed).toBe(true);
  });
});
