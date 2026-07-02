// Property suite (T1.10): invariants over random legal games (IMPLEMENTATION §6).
// Game count via HIVE_PROP_GAMES (default 100 for `pnpm test`; validate:m1 runs
// more, and a 10k run is the milestone bar).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyMove,
  hash,
  initialState,
  legalMoves,
  parseUhp,
  result,
  toUhp,
} from '../src/index';
import type { GameOptions, GameState, Move, TileId } from '../src/index';
import { BASE } from './helpers';

const GAMES = Number(process.env.HIVE_PROP_GAMES ?? 100);
const MAX_PLIES = 300;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function boardJson(state: GameState): string {
  const cells = [...state.board.entries()]
    .map(([k, stack]) => [k, stack.map((t: TileId) => `${t.color}${t.kind}${t.ordinal}`)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return JSON.stringify({ cells, toMove: state.toMove });
}

/** Independent connectivity check (BFS), NOT the engine's articulation logic. */
function hiveConnected(state: GameState): boolean {
  const keys = [...state.board.keys()];
  if (keys.length <= 1) return true;
  const seen = new Set<string>([keys[0] as string]);
  const queue = [keys[0] as string];
  while (queue.length > 0) {
    const key = queue.pop() as string;
    const [q, r] = key.split(',').map(Number) as [number, number];
    for (const d of [
      [1, 0],
      [-1, 0],
      [1, -1],
      [0, -1],
      [0, 1],
      [-1, 1],
    ]) {
      const nk = `${q + (d[0] as number)},${r + (d[1] as number)}`;
      if (state.board.has(nk) && !seen.has(nk)) {
        seen.add(nk);
        queue.push(nk);
      }
    }
  }
  return seen.size === keys.length;
}

function tileConservation(state: GameState, options: GameOptions): boolean {
  const totals: Record<string, number> = {};
  for (const stack of state.board.values()) {
    for (const t of stack) totals[`${t.color}${t.kind}`] = (totals[`${t.color}${t.kind}`] ?? 0) + 1;
  }
  const initial = initialState(options).hands;
  for (const color of ['w', 'b'] as const) {
    for (const kind of ['Q', 'A', 'S', 'G', 'B', 'M', 'L', 'P'] as const) {
      if ((totals[`${color}${kind}`] ?? 0) + state.hands[color][kind] !== initial[color][kind]) {
        return false;
      }
    }
  }
  return true;
}

function runRandomGame(seed: number, options: GameOptions) {
  const rand = mulberry32(seed);
  let state = initialState(options);
  const uhpLog: string[] = [];
  // Transposition consistency: same position ⇒ same hash, same hash ⇒ same position.
  const byJson = new Map<string, bigint>();
  const byHash = new Map<bigint, string>();

  for (let ply = 0; ply < MAX_PLIES; ply++) {
    if (result(state).status !== 'ongoing') break;

    const moves = legalMoves(state);
    // Invariant 6: never empty while ongoing (pass is generated).
    expect(moves.length, `ply ${ply}: legalMoves empty`).toBeGreaterThan(0);

    // Invariant 7: queen unplaced on turn 4+ ⇒ only queen placements (or pass).
    if (state.turn >= 4 && state.hands[state.toMove].Q > 0) {
      for (const m of moves) {
        expect(m.type === 'pass' || (m.type === 'place' && m.tile.kind === 'Q')).toBe(true);
      }
    }

    // Invariants 1 + 4 on a sample: several extra moves at every 25th ply,
    // plus the chosen move at every ply.
    const chosen = moves[Math.floor(rand() * moves.length)] as Move;
    if (ply % 25 === 0) {
      for (let i = 0; i < Math.min(6, moves.length); i++) {
        const m = moves[Math.floor(rand() * moves.length)] as Move;
        const next = applyMove(state, m); // must not throw (invariant 1)
        expect(hiveConnected(next), `ply ${ply}: hive split`).toBe(true); // invariant 2
        const uhp = toUhp(m, state);
        expect(parseUhp(uhp, state), `ply ${ply}: uhp ${uhp}`).toEqual(m); // invariant 4
      }
    }

    const uhp = toUhp(chosen, state);
    expect(parseUhp(uhp, state), `ply ${ply}: uhp ${uhp}`).toEqual(chosen); // invariant 4
    uhpLog.push(uhp);
    state = applyMove(state, chosen); // invariant 1

    expect(hiveConnected(state), `ply ${ply}: hive split`).toBe(true); // invariant 2
    expect(tileConservation(state, options), `ply ${ply}: tiles leaked`).toBe(true); // invariant 3

    // Invariant 8 (transposition consistency, opportunistic within the game).
    const json = boardJson(state);
    const h = hash(state);
    const seenHash = byJson.get(json);
    if (seenHash !== undefined) expect(h).toBe(seenHash);
    else byJson.set(json, h);
    const seenJson = byHash.get(h);
    if (seenJson !== undefined) expect(seenJson).toBe(json);
    else byHash.set(h, json);
  }

  // Invariant 5: replaying the UHP log reproduces the final position and hash.
  let replay = initialState(options);
  for (const uhp of uhpLog) replay = applyMove(replay, parseUhp(uhp, replay));
  expect(boardJson(replay)).toBe(boardJson(state));
  expect(hash(replay)).toBe(hash(state));
  expect(replay.positionHashes).toEqual(state.positionHashes);
}

describe(`random-game invariants (${GAMES} games, base rules)`, () => {
  it(
    'holds all §6 invariants',
    () => {
      // asyncProperty so the event loop yields between games — a multi-minute
      // synchronous block starves vitest's worker RPC and fails the run with
      // "Timeout calling onTaskUpdate" even when every test passes.
      return fc.assert(
        fc.asyncProperty(fc.integer({ min: 0, max: 2 ** 31 - 1 }), async (seed) => {
          runRandomGame(seed, BASE);
          // Real macrotask yield (await alone only drains microtasks).
          await new Promise((resolve) => setImmediate(resolve));
        }),
        // Fixed fc seed: reproducible runs (override to explore new games).
        { numRuns: GAMES, seed: Number(process.env.HIVE_PROP_SEED ?? 20260702) },
      );
    },
    3_600_000,
  );
});
