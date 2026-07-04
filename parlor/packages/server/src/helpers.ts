// ported from hive/packages/functions/src/games.ts (adapted — shared helpers)
// Callable plumbing shared by every parlor game: the auth guard, invite
// codes, gameId parsing, and async-deadline stamping.
import { randomInt } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Caller {
  uid: string;
  name: string;
}

export function requireAuth(request: CallableRequest): Caller {
  if (!request.auth) throw new HttpsError('unauthenticated', 'sign in first');
  const token = request.auth.token as { name?: string; email?: string };
  const name = token.name ?? token.email?.split('@')[0] ?? 'Player';
  return { uid: request.auth.uid, name };
}

export function requireGameId(data: unknown): string {
  const gameId = (data as { gameId?: unknown })?.gameId;
  if (typeof gameId !== 'string' || gameId.length === 0) {
    throw new HttpsError('invalid-argument', 'missing gameId');
  }
  return gameId;
}

export function parseTimeControlDays(raw: unknown): 1 | 3 | 7 | null {
  if (raw === null || raw === undefined) return null;
  if (raw === 1 || raw === 3 || raw === 7) return raw;
  throw new HttpsError('invalid-argument', 'time control days must be 1, 3, 7 or null');
}

export function deadlineFor(timeControl: { days: number } | null): Timestamp | null {
  return timeControl ? Timestamp.fromMillis(Date.now() + timeControl.days * DAY_MS) : null;
}

// No lookalikes (0/O, 1/I): codes read well off a phone screen.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}
