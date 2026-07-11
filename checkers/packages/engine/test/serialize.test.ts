// Serialization: JSON round-trips exactly, and deserializeCheckers refuses
// every kind of corrupt input rather than resurrecting a broken game.

import { describe, expect, it } from 'vitest';
import {
  applyCheckers,
  deserializeCheckers,
  initialCheckers,
  resignCheckers,
  serializeCheckers,
} from '../src/index.js';
import { at } from './helpers.js';

describe('round-trip', () => {
  it('recovers the initial state exactly', () => {
    const s = initialCheckers();
    expect(deserializeCheckers(serializeCheckers(s))).toEqual(s);
  });

  it('recovers a mid-game (including a jump) and a finished state exactly', () => {
    let s = initialCheckers();
    s = applyCheckers(s, { path: [at(2, 1), at(3, 2)] });
    s = applyCheckers(s, { path: [at(5, 0), at(4, 1)] });
    // Mandatory: dark's c4 man must take the light man on b5.
    s = applyCheckers(s, { path: [at(3, 2), at(5, 0)] });
    expect(s.board.split('').filter((ch) => ch === 'l')).toHaveLength(11);
    expect(deserializeCheckers(serializeCheckers(s))).toEqual(s);

    const done = resignCheckers(s, 'dark');
    expect(deserializeCheckers(serializeCheckers(done))).toEqual(done);
  });
});

describe('corrupt input', () => {
  const good = JSON.parse(serializeCheckers(initialCheckers())) as Record<string, unknown>;
  const mangle = (patch: Record<string, unknown>): string =>
    JSON.stringify({ ...good, ...patch });

  it('rejects non-JSON and non-objects', () => {
    expect(() => deserializeCheckers('not json')).toThrow();
    expect(() => deserializeCheckers('42')).toThrow();
    expect(() => deserializeCheckers('[]')).toThrow();
    expect(() => deserializeCheckers('{}')).toThrow();
  });

  it('rejects a corrupt board', () => {
    expect(() => deserializeCheckers(mangle({ board: 'dl..' }))).toThrow();
    expect(() => deserializeCheckers(mangle({ board: 'X'.repeat(64) }))).toThrow();
    // A piece on a light square is structurally impossible.
    expect(() => deserializeCheckers(mangle({ board: 'd' + '.'.repeat(63) }))).toThrow();
  });

  it('rejects corrupt fields', () => {
    expect(() => deserializeCheckers(mangle({ toMove: 'nobody' }))).toThrow();
    expect(() => deserializeCheckers(mangle({ moveCount: -1 }))).toThrow();
    expect(() => deserializeCheckers(mangle({ moveCount: 1.5 }))).toThrow();
    expect(() => deserializeCheckers(mangle({ seen: [1, 2] }))).toThrow();
    expect(() => deserializeCheckers(mangle({ seen: { x: 'twice' } }))).toThrow();
  });

  it('rejects a corrupt result', () => {
    expect(() => deserializeCheckers(mangle({ result: { winner: 'dark', by: 'luck' } }))).toThrow();
    expect(() => deserializeCheckers(mangle({ result: { winner: null, by: 'no-moves' } }))).toThrow();
    expect(() => deserializeCheckers(mangle({ result: { winner: 'dark', by: 'repetition' } }))).toThrow();
    expect(() => deserializeCheckers(mangle({ result: 'dark' }))).toThrow();
  });
});
