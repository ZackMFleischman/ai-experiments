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

  it('recovers a mid-game and a finished state exactly', () => {
    let s = initialCheckers();
    s = applyCheckers(s, { from: at(0, 3), to: at(0, 1) });
    s = applyCheckers(s, { from: at(2, 3), to: at(2, 5) });
    s = applyCheckers(s, { from: at(1, 3), to: at(1, 5) });
    expect(deserializeCheckers(serializeCheckers(s))).toEqual(s);

    const done = resignCheckers(s, 'attackers');
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
    expect(() => deserializeCheckers(mangle({ board: 'ADK.' }))).toThrow();
    expect(() => deserializeCheckers(mangle({ board: 'X'.repeat(49) }))).toThrow();
    expect(() => deserializeCheckers(mangle({ board: 'K'.repeat(49) }))).toThrow();
  });

  it('rejects corrupt fields', () => {
    expect(() => deserializeCheckers(mangle({ toMove: 'nobody' }))).toThrow();
    expect(() => deserializeCheckers(mangle({ moveCount: -1 }))).toThrow();
    expect(() => deserializeCheckers(mangle({ moveCount: 1.5 }))).toThrow();
    expect(() => deserializeCheckers(mangle({ seen: [1, 2] }))).toThrow();
    expect(() => deserializeCheckers(mangle({ seen: { x: 'twice' } }))).toThrow();
  });

  it('rejects a corrupt result', () => {
    expect(() => deserializeCheckers(mangle({ result: { winner: 'attackers', by: 'luck' } }))).toThrow();
    expect(() => deserializeCheckers(mangle({ result: { winner: null, by: 'escape' } }))).toThrow();
    expect(() => deserializeCheckers(mangle({ result: 'attackers' }))).toThrow();
  });
});
