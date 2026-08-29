// The client-side mirror of the server's pre-start guest list (@parlor/server
// roster.ts — DECISIONS 2026-08-28, "Invitations reserve nothing; first come,
// first served"). Deliberately a COPY, not an import: web must not depend on
// server (firebase-functions would follow the type into the browser bundle),
// and the wire shape is the contract between them. Pure and React-free so the
// room UI, the lobby card and the tests all read the same model.

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

/** How turn order is decided. Mirrors the server's `TurnOrderChoice`. */
export type TurnOrderChoice =
  /** The creator takes this seat; everyone else fills in join order. */
  | { mode: 'host-seat'; seat: number }
  /** Shuffle the seats when the game starts. */
  | { mode: 'random' }
  /** An explicit arrangement: uids in turn order. */
  | { mode: 'arrange'; order: readonly string[] };

/** The host is whoever created the game — always first in join order. */
export function hostOf(list: GuestList): RosterEntry | undefined {
  return list.roster[0];
}

export function isHost(list: GuestList, uid: string): boolean {
  return hostOf(list)?.uid === uid;
}

/** Places still to fill. Never negative — a full room reads 0, not -1. */
export function openSeats(list: GuestList, maxPlayers: number): number {
  return Math.max(0, maxPlayers - list.roster.length);
}

export function canStart(list: GuestList, minPlayers: number): boolean {
  return list.roster.length >= minPlayers;
}

/**
 * Resolve a turn-order choice against the roster **for preview only** — this
 * is what the room shows everyone before the start.
 *
 * - `arrange` follows the stored uid order and appends anyone it never named,
 *   in join order: a player who joined after the host arranged the list must
 *   not vanish from the preview (the server's resolveSeatOrder does the same).
 * - `host-seat` puts the host at that index, everyone else in join order.
 * - `random` shows join order. The real shuffle happens SERVER-SIDE at start
 *   (crypto), so this never calls Math.random — a client-side "preview" of a
 *   shuffle would be a lie, and engines here take seeds, not entropy.
 */
export function arrangedOrder(list: GuestList, choice: TurnOrderChoice): readonly RosterEntry[] {
  const roster = list.roster;
  if (choice.mode === 'random') return roster;
  if (choice.mode === 'arrange') {
    const byUid = new Map(roster.map((e) => [e.uid, e]));
    const ordered: RosterEntry[] = [];
    for (const uid of choice.order) {
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
  const seat = Math.min(Math.max(choice.seat, 0), rest.length);
  return [...rest.slice(0, seat), host, ...rest.slice(seat)];
}

/**
 * Move one uid up or down for the manual arranger. A no-op at the ends (and
 * for an out-of-range index), so the up/down buttons never need to guess
 * whether they are legal — they just render disabled and stay harmless.
 */
export function moveInOrder(
  order: readonly string[],
  index: number,
  delta: number,
): readonly string[] {
  const to = index + delta;
  if (delta === 0) return order;
  if (index < 0 || index >= order.length) return order;
  if (to < 0 || to >= order.length) return order;
  const next = [...order];
  const [moved] = next.splice(index, 1);
  if (moved === undefined) return order;
  next.splice(to, 0, moved);
  return next;
}
