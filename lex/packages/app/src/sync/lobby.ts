// Lex's lobby doc→summary mapping over @parlor/web's listener hooks (T4.7).
// The parlor hook owns the query/cache mechanics; the seat naming and card
// fields are lex's. Seats are N (T7.12): a two-seat doc maps exactly as it
// always did, and a 3+ doc adds the roster, the placings and the open count on
// top — including the case where it is still a guest list and has no `players`,
// no `scores` and no `public` at all (DESIGN §6.2).
import type { DocumentData } from 'firebase/firestore';
import type { Seat } from '@lex/engine';
import { useMyGames } from '@parlor/web/lobby';
import { seatIndexOf } from '@parlor/web/transport';
import type { Opponent, RosterEntry } from '@parlor/web/lobby-ui';
import type { LobbyGameSummary } from '../screens/lobbyView';
import type { LexGameOptions } from '../gameOptions';
import { SEAT_KEYS } from './firestoreTransport';

interface GameDocLobby {
  /** Absent while a 3+ room is still a guest list — nobody is seated yet. */
  players?: Record<string, string | null>;
  playerNames?: Record<string, string | null>;
  options: LexGameOptions;
  status: 'open' | 'active' | 'finished';
  toMove?: string;
  moveCount?: number;
  activatedBy?: string;
  result?: 'p0' | 'p1' | 'draw';
  endedBy?: string;
  updatedAt?: { toMillis(): number };
  deadlineAt?: { toMillis(): number };
  /** Absent on an open 3+ room: there is no state until the game starts. */
  public?: string;
  scores?: Record<string, number>;
  lastPlay?: { by: string; word: string; score: number };
  challenge?: { from: string; fromName: string; to: string; toName: string };
  // ── 3+ only: the pre-start guest list and the N-seat outcome.
  maxPlayers?: number;
  roster?: RosterEntry[];
  invited?: RosterEntry[];
  declined?: RosterEntry[];
  standings?: Array<{ seats: string[] }>;
  withdrawn?: string[];
}

/** The seat keys this doc actually dealt, in move order. */
const seatsOf = (players: Record<string, string | null>): string[] =>
  SEAT_KEYS.filter((key) => key in players);

/** Seat keys → seat indices, dropping any key this doc never dealt. */
const seatIndices = (keys: readonly string[] | undefined, seats: readonly string[]): number[] =>
  (keys ?? []).map((key) => seats.indexOf(key)).filter((seat) => seat >= 0);

export function toSummary(id: string, raw: DocumentData, uid: string): LobbyGameSummary {
  const data = raw as GameDocLobby;
  const players = data.players ?? {};
  const playerNames = data.playerNames ?? {};
  const seats = seatsOf(players);
  const roster = data.roster ?? [];
  // `maxPlayers` is what makes a doc a guest-list game; while it is open there
  // are no seats yet, so the roster IS the game.
  const guestList = typeof data.maxPlayers === 'number' && data.maxPlayers >= 3;
  const seatCount = seats.length > 0 ? seats.length : (data.maxPlayers ?? 2);

  // On an incoming challenge the caller isn't seated yet — their seat is the
  // empty one (respondChallenge fills it on accept). In an unstarted 3+ room
  // nothing is seated at all, so join order stands in for it.
  const seated = seatIndexOf(players, uid, SEAT_KEYS);
  const firstOpen = seats.findIndex((key) => players[key] === null);
  const rosterIndex = roster.findIndex((entry) => entry.uid === uid);
  const mySeat: Seat =
    seated ??
    (seats.length === 0
      ? Math.max(0, rosterIndex)
      : firstOpen === -1
        ? Math.max(0, seats.length - 1)
        : firstOpen);

  const challenge = data.challenge
    ? {
        direction: data.challenge.to === uid ? ('incoming' as const) : ('outgoing' as const),
        name: data.challenge.to === uid ? data.challenge.fromName : data.challenge.toName,
      }
    : undefined;
  // Everybody else: from the seats once they exist, from the guest list before.
  const opponents: Opponent[] = seats.length
    ? seats.flatMap((key, seat) => {
        const who = players[key];
        if (who === uid) return [];
        const name = playerNames[key] ?? null;
        if (!who && !name) return [];
        return [{ ...(who ? { uid: who } : {}), name: name ?? 'Open seat', seat }];
      })
    : roster.flatMap((entry) => (entry.uid === uid ? [] : [{ uid: entry.uid, name: entry.name }]));

  const oppName = guestList
    ? (opponents.map((o) => o.name).join(', ') || null)
    : (challenge?.name ?? (mySeat === 0 ? playerNames['p1'] : playerNames['p0']) ?? null);
  const oppUid = guestList
    ? null
    : (seats.map((key) => players[key]).find((p) => p != null && p !== uid) ??
      (data.challenge ? (data.challenge.to === uid ? data.challenge.from : data.challenge.to) : null));
  // Just started by the opponent (accepted invite/challenge, rematch offer) —
  // badge-worthy news even before it's my move (DESIGN §7.1).
  const fresh =
    data.status === 'active' &&
    data.moveCount === 0 &&
    data.activatedBy !== undefined &&
    data.activatedBy !== uid;
  const lastPlay = data.lastPlay
    ? {
        by: Math.max(0, seats.findIndex((key) => players[key] === data.lastPlay!.by)) as Seat,
        word: data.lastPlay.word,
        score: data.lastPlay.score,
      }
    : undefined;
  const standings = data.standings?.map((placing) => seatIndices(placing.seats, seats));
  return {
    id,
    mySeat,
    opponentName: oppName,
    ...(oppUid ? { opponentUid: oppUid } : {}),
    ...(challenge ? { challenge } : {}),
    status: data.status,
    toMove: Math.max(0, seats.indexOf(data.toMove ?? '')) as Seat,
    ...(data.result ? { result: data.result } : {}),
    ...(data.endedBy ? { endedBy: data.endedBy } : {}),
    updatedAtMs: data.updatedAt?.toMillis() ?? 0,
    ...(data.deadlineAt ? { deadlineAtMs: data.deadlineAt.toMillis() } : {}),
    ...(fresh ? { freshFromOpponent: true } : {}),
    ...(data.public !== undefined ? { public: data.public } : {}),
    rulesetId: data.options.rulesetId,
    scores: Array.from({ length: seatCount }, (_, seat) => data.scores?.[SEAT_KEYS[seat]!] ?? 0),
    ...(lastPlay ? { lastPlay } : {}),
    // ── N seats. A two-seat card carries none of these and reads as it did.
    ...(guestList
      ? {
          seatCount,
          opponents,
          openSeats: data.status === 'open' ? Math.max(0, (data.maxPlayers ?? 0) - roster.length) : 0,
        }
      : {}),
    ...(standings ? { standings } : {}),
    ...(data.withdrawn ? { withdrawn: seatIndices(data.withdrawn, seats) } : {}),
  };
}

export function useLexGames(uid: string): { games: LobbyGameSummary[]; loading: boolean } {
  return useMyGames<LobbyGameSummary>(uid, toSummary);
}
