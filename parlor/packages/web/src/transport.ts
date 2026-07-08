// @parlor/web/transport — the shared FirestoreTransport shell (parlor hardening
// Phase 3). Every parlor game's client transport is a GameTransport adapter over
// Firestore: reads flow from snapshots, writes flow through the callables
// (clients cannot write games/* — firestore.rules). The pieces that are
// identical across games — and one that is subtle enough to be worth owning in
// ONE place — live here; the game keeps its doc→info/meta/entry mappings, its
// submit routing, and its sync strategy.
//
// The sync strategy is the design-sensitive fork the plan calls out. A
// perfect-information game (hive, checkers) replays the append-only move log:
// `fetchOrderedMoves` + `watchAddedMoves` are its two halves (the engine and the
// doc→entry map are the game's). A hidden-information game (lex) cannot replay
// the opponent's log, so it uses coherent adoption instead — it re-reads
// {game doc + own rack + log} on every signal behind its own coherence gates —
// and keeps that strategy game-side (it still reuses `fetchOrderedMoves`,
// `seatIndexOf`, and `watchGameMeta` here). Extracting live-sync race handling
// into a generic module is deliberately NOT done — the mp e2e is its only gate.
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
} from 'firebase/firestore';
import { getDb } from './firebase';

/** Resolve a caller's seat index (0 = seatKeys[0], who moves first) from a game
 * doc's `players` map, or null when the caller isn't in the game. The game maps
 * the index onto its own seat naming (hive's 'w'/'b', lex's 0/1). */
export function seatIndexOf(
  players: Record<string, string | null>,
  uid: string,
  seatKeys: readonly [string, string],
): 0 | 1 | null {
  if (players[seatKeys[0]] === uid) return 0;
  if (players[seatKeys[1]] === uid) return 1;
  return null;
}

/** Subscribe to the live game-doc slice the chrome renders outside the session
 * (open→active flip, opponent-name arrival, invite code / pending challenge).
 * The game supplies `mapMeta` (doc → its own meta shape); `cb(null)` means the
 * doc was deleted out from under us.
 *
 * The subtle, security-relevant part is owned here so it's written once: a game
 * doc DELETED under a live listener (a declined/withdrawn challenge, a cancelled
 * invite) surfaces as a `permission-denied` ERROR, not an `exists:false`
 * snapshot — because the read rule needs `resource.data.playerIds`, which a
 * deleted doc no longer has. Both routes report `cb(null)`, but only once the
 * doc has been seen at least once (so an initial permission error on a genuinely
 * missing/forbidden doc doesn't masquerade as a deletion). */
export function watchGameMeta<TMeta>(
  gameId: string,
  mapMeta: (data: DocumentData) => TMeta,
  cb: (meta: TMeta | null) => void,
): () => void {
  let seen = false;
  return onSnapshot(
    doc(getDb(), 'games', gameId),
    (snap) => {
      if (!snap.exists()) {
        if (seen) cb(null);
        return;
      }
      seen = true;
      cb(mapMeta(snap.data()));
    },
    (err) => {
      if (seen && (err as { code?: string }).code === 'permission-denied') cb(null);
    },
  );
}

/** Read the full move log in order (moves/{n} by ascending n). The shared read
 * behind hive's log replay (its whole load) and lex's coherent-adoption fetch. */
export async function fetchOrderedMoves(gameId: string): Promise<DocumentData[]> {
  const snaps = await getDocs(
    query(collection(getDb(), 'games', gameId, 'moves'), orderBy('n')),
  );
  return snaps.docs.map((d) => d.data());
}

/** The log-replay sync strategy's live half: invoke `onAdded` for each move doc
 * as it is APPENDED to the log, in log order (the `added` docChanges). A
 * perfect-information game replays these through its engine; it supplies the
 * doc→entry mapping in `onAdded`. Returns the unsubscribe. */
export function watchAddedMoves(
  gameId: string,
  onAdded: (moveData: DocumentData) => void,
): () => void {
  const moves = query(collection(getDb(), 'games', gameId, 'moves'), orderBy('n'));
  return onSnapshot(moves, (snap) => {
    for (const change of snap.docChanges()) {
      if (change.type === 'added') onAdded(change.doc.data());
    }
  });
}
