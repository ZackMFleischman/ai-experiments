// ported from hive/packages/functions/test/helpers.ts (adapted)
// Emulator helpers for callable tests: mint users via the auth emulator REST
// API, invoke callables over HTTP the way the client SDK does, and read
// Firestore through the emulator's admin bypass for assertions.
const AUTH = 'http://127.0.0.1:9099';
const FUNCTIONS = 'http://127.0.0.1:5001/demo-lex/us-central1';
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-lex/databases/(default)/documents';

export interface TestUser {
  uid: string;
  token: string;
  email: string;
}

let counter = 0;

export async function signUp(name: string): Promise<TestUser> {
  const email = `${name.toLowerCase()}-${Date.now()}-${counter++}@example.com`;
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'pw123456', displayName: name, returnSecureToken: true }),
  });
  const body = (await res.json()) as { idToken: string; localId: string };
  if (!res.ok) throw new Error(`signUp failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken, email };
}

export const OPTIONS = {
  rulesetId: 'classic',
  dictionaryId: 'enable1',
  timeControl: null,
} as const;

export interface JoinedGame {
  gameId: string;
  p0: TestUser;
  p1: TestUser;
}

/** Create a game as Ada (seat 'me' = p0, moves first), join as Sam (p1). */
export async function createJoinedGame(
  options: Record<string, unknown> = { ...OPTIONS },
): Promise<JoinedGame> {
  const ada = await signUp('Ada');
  const sam = await signUp('Sam');
  const created = await call('createGame', { options, seat: 'me' }, ada);
  if (created.status !== 200) throw new Error(`createGame failed: ${created.errorMessage}`);
  const { gameId, code } = created.result as { gameId: string; code: string };
  const joined = await call('joinGame', { code }, sam);
  if (joined.status !== 200) throw new Error(`joinGame failed: ${joined.errorMessage}`);
  return { gameId, p0: ada, p1: sam };
}

export interface CallResult {
  status: number;
  result?: unknown;
  errorStatus?: string;
  errorMessage?: string;
}

export async function call(name: string, data: unknown, user?: TestUser): Promise<CallResult> {
  const res = await fetch(`${FUNCTIONS}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  const body = (await res.json()) as {
    result?: unknown;
    error?: { message?: string; status?: string };
  };
  return {
    status: res.status,
    ...(body.result !== undefined ? { result: body.result } : {}),
    ...(body.error?.status ? { errorStatus: body.error.status } : {}),
    ...(body.error?.message ? { errorMessage: body.error.message } : {}),
  };
}

/** Admin-bypass document read (emulator only). Returns null when missing. */
export async function adminGetDoc(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${FIRESTORE}/${path}`, {
    headers: { Authorization: 'Bearer owner' },
  });
  if (res.status === 404) return null;
  const body = (await res.json()) as { fields?: Record<string, unknown> };
  return decodeFields(body.fields ?? {});
}

/** List a subcollection (admin bypass), returning decoded docs. */
export async function adminListDocs(path: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${FIRESTORE}/${path}`, {
    headers: { Authorization: 'Bearer owner' },
  });
  const body = (await res.json()) as { documents?: Array<{ fields?: Record<string, unknown> }> };
  return (body.documents ?? []).map((d) => decodeFields(d.fields ?? {}));
}

// Minimal Firestore REST value decoder (enough for our schema).
function decodeValue(v: Record<string, unknown>): unknown {
  if ('stringValue' in v) return v['stringValue'];
  if ('integerValue' in v) return Number(v['integerValue']);
  if ('doubleValue' in v) return v['doubleValue'];
  if ('booleanValue' in v) return v['booleanValue'];
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v['timestampValue'];
  if ('mapValue' in v) {
    return decodeFields((v['mapValue'] as { fields?: Record<string, unknown> }).fields ?? {});
  }
  if ('arrayValue' in v) {
    return ((v['arrayValue'] as { values?: Array<Record<string, unknown>> }).values ?? []).map(
      decodeValue,
    );
  }
  return v;
}

function decodeFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, decodeValue(v as Record<string, unknown>)]),
  );
}
