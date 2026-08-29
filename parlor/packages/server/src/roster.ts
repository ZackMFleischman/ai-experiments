// The pre-game guest list for a 3+ seat game (DECISIONS 2026-08-28 —
// "Invitations reserve nothing; first come, first served"). Seats do not exist
// until the game starts: until then a game holds a `roster` in join order
// (host first), an `invited` list, and a `declined` list. Every transition
// here is pure so it can be unit-tested without an emulator; the callables in
// games.ts are the transactional shells around it.
import { randomInt } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';

/** A guest-list member: who they are and what to call them. */
export interface RosterEntry {
  uid: string;
  name: string;
}

export interface GuestList {
  /** Accepted, in join order — `roster[0]` is the host. */
  roster: readonly RosterEntry[];
  /** Asked, not yet answered. Reserves nothing. */
  invited: readonly RosterEntry[];
  /** Said no. A decline moves a name here; it never deletes the game. */
  declined: readonly RosterEntry[];
}

/**
 * What `invites/{code}` publishes. Anyone signed in who holds the code can
 * read that doc (parlor/firestore.rules), so it carries **no uid** — only
 * display names and counts, enough to preview who you would be joining.
 */
export interface InvitePreview {
  hostName: string;
  /** Roster display names in join order. */
  names: readonly string[];
  filled: number;
  maxPlayers: number;
}

const without = (list: readonly RosterEntry[], uid: string) => list.filter((e) => e.uid !== uid);
const holds = (list: readonly RosterEntry[], uid: string) => list.some((e) => e.uid === uid);

export const emptyGuestList = (host: RosterEntry): GuestList => ({
  roster: [host],
  invited: [],
  declined: [],
});

/** Read a guest list off a game doc, tolerating a doc written before M7. */
export function guestListOf(doc: Record<string, unknown>): GuestList {
  const read = (key: string): RosterEntry[] => {
    const raw = doc[key];
    return Array.isArray(raw) ? (raw as RosterEntry[]) : [];
  };
  return { roster: read('roster'), invited: read('invited'), declined: read('declined') };
}

/**
 * Every uid that may READ the game doc: the roster plus anyone still holding
 * an invitation (parlor/firestore.rules gates reads on `playerIds`, and an
 * invitee has to see the game to answer it). A decline drops the name from
 * both lists, so it also drops the read.
 */
export function playerIdsOf(list: GuestList): string[] {
  return [...list.roster.map((e) => e.uid), ...list.invited.map((e) => e.uid)];
}

export function previewOf(list: GuestList, maxPlayers: number): InvitePreview {
  return {
    hostName: list.roster[0]?.name ?? 'Host',
    names: list.roster.map((e) => e.name),
    filled: list.roster.length,
    maxPlayers,
  };
}

/** Join (by code or by accepting an invitation): append, in arrival order. */
export function joinRoster(list: GuestList, entry: RosterEntry, maxPlayers: number): GuestList {
  if (holds(list.roster, entry.uid)) {
    throw new HttpsError('failed-precondition', 'you are already in this game');
  }
  if (list.roster.length >= maxPlayers) {
    throw new HttpsError('failed-precondition', 'this game is full');
  }
  return {
    roster: [...list.roster, entry],
    invited: without(list.invited, entry.uid),
    declined: without(list.declined, entry.uid),
  };
}

/** Host adds names. Anyone already on the roster or invited is skipped; a
 *  previously declined name moves back to `invited`, so re-asking works. */
export function inviteToList(list: GuestList, entries: readonly RosterEntry[]): GuestList {
  let next = list;
  for (const entry of entries) {
    if (holds(next.roster, entry.uid) || holds(next.invited, entry.uid)) continue;
    next = {
      roster: next.roster,
      invited: [...next.invited, entry],
      declined: without(next.declined, entry.uid),
    };
  }
  return next;
}

/** "No thanks" — the name moves to `declined`. The game survives. */
export function declineInvite(list: GuestList, uid: string): GuestList {
  const entry = list.invited.find((e) => e.uid === uid);
  if (!entry) throw new HttpsError('failed-precondition', 'you have no invitation to this game');
  return { roster: list.roster, invited: without(list.invited, uid), declined: [...list.declined, entry] };
}

/** Leaving before the start drops you from the guest list entirely. Leaving
 *  is not declining: nothing is recorded, and the host may re-invite you. */
export function leaveList(list: GuestList, uid: string): GuestList {
  if (!holds(list.roster, uid) && !holds(list.invited, uid)) {
    throw new HttpsError('failed-precondition', 'you are not in this game');
  }
  return { roster: without(list.roster, uid), invited: without(list.invited, uid), declined: list.declined };
}

/** Turn order for the seats about to be dealt — see TurnOrderChoice. */
export type SeatOrder = readonly RosterEntry[];

/**
 * Resolve the host's turn-order choice against the final roster.
 * - `random` shuffles (crypto — this is the server edge, not the engine).
 * - `arrange` follows the stored uid order, with anyone missing from it
 *   appended in join order. A newcomer who joined after the host arranged the
 *   list must not be dropped, and must not fail the permutation check.
 * - `host-seat` puts the host at that index and everyone else in join order.
 */
export function resolveSeatOrder(
  turnOrder: { mode: 'host-seat'; seat: number } | { mode: 'random' } | { mode: 'arrange'; order: readonly string[] },
  roster: readonly RosterEntry[],
): SeatOrder {
  if (turnOrder.mode === 'random') {
    const shuffled = [...roster];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      const a = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = a;
    }
    return shuffled;
  }
  if (turnOrder.mode === 'arrange') {
    const byUid = new Map(roster.map((e) => [e.uid, e]));
    const ordered: RosterEntry[] = [];
    for (const uid of turnOrder.order) {
      const entry = byUid.get(uid);
      if (entry) {
        ordered.push(entry);
        byUid.delete(uid);
      }
    }
    return [...ordered, ...roster.filter((e) => byUid.has(e.uid))];
  }
  const host = roster[0];
  if (!host) return roster;
  const rest = roster.slice(1);
  const seat = Math.min(Math.max(turnOrder.seat, 0), rest.length);
  return [...rest.slice(0, seat), host, ...rest.slice(seat)];
}
