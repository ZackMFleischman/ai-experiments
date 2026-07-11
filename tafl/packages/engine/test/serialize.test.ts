// Serialization: JSON round-trips exactly, and deserializeTafl refuses
// every kind of corrupt input rather than resurrecting a broken game.

import { describe, expect, it } from 'vitest';
import {
  applyTafl,
  deserializeTafl,
  initialTafl,
  resignTafl,
  serializeTafl,
} from '../src/index.js';
import { at } from './helpers.js';

describe('round-trip', () => {
  it('recovers the initial state exactly', () => {
    const s = initialTafl();
    expect(deserializeTafl(serializeTafl(s))).toEqual(s);
  });

  it('recovers a mid-game and a finished state exactly', () => {
    let s = initialTafl();
    s = applyTafl(s, { from: at(0, 3), to: at(0, 1) });
    s = applyTafl(s, { from: at(3, 5), to: at(3, 3) });
    s = applyTafl(s, { from: at(1, 5), to: at(1, 8) });
    expect(deserializeTafl(serializeTafl(s))).toEqual(s);

    const done = resignTafl(s, 'attackers');
    expect(deserializeTafl(serializeTafl(done))).toEqual(done);
  });
});

describe('corrupt input', () => {
  const good = JSON.parse(serializeTafl(initialTafl())) as Record<string, unknown>;
  const mangle = (patch: Record<string, unknown>): string =>
    JSON.stringify({ ...good, ...patch });

  it('rejects non-JSON and non-objects', () => {
    expect(() => deserializeTafl('not json')).toThrow();
    expect(() => deserializeTafl('42')).toThrow();
    expect(() => deserializeTafl('[]')).toThrow();
    expect(() => deserializeTafl('{}')).toThrow();
  });

  it('rejects a corrupt board', () => {
    expect(() => deserializeTafl(mangle({ board: 'ADK.' }))).toThrow();
    expect(() => deserializeTafl(mangle({ board: 'X'.repeat(121) }))).toThrow();
    expect(() => deserializeTafl(mangle({ board: 'K'.repeat(121) }))).toThrow();
  });

  it('rejects corrupt fields', () => {
    expect(() => deserializeTafl(mangle({ toMove: 'nobody' }))).toThrow();
    expect(() => deserializeTafl(mangle({ moveCount: -1 }))).toThrow();
    expect(() => deserializeTafl(mangle({ moveCount: 1.5 }))).toThrow();
    expect(() => deserializeTafl(mangle({ seen: [1, 2] }))).toThrow();
    expect(() => deserializeTafl(mangle({ seen: { x: 'twice' } }))).toThrow();
  });

  it('rejects a corrupt result', () => {
    expect(() => deserializeTafl(mangle({ result: { winner: 'attackers', by: 'luck' } }))).toThrow();
    expect(() => deserializeTafl(mangle({ result: { winner: null, by: 'escape' } }))).toThrow();
    expect(() => deserializeTafl(mangle({ result: 'attackers' }))).toThrow();
  });
});
