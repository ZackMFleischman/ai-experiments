// T4.8 regression: a snapshot taken BEFORE init() builds display slots from
// the fallback state's phantom rack (canonical bag order); the first real
// sync must NOT inherit that arrangement — the e2e caught CATS staging as
// CATT because a kept phantom 'T' hijacked a slot.
import { RULESETS, initialState, serializeState } from '@lex/engine';
import { describe, expect, it } from 'vitest';
import type { GameTransport } from '@parlor/core';
import { GameController } from '../src/controller/GameController';
import type { GameOptions, LexEntry } from '../src/controller/entries';
import { canonicalBagOrder } from '../src/sync/firestoreTransport';

const classic = RULESETS['classic']!;
const acceptAll = { id: 'stub', has: () => true };

function riggedSyncEntry(myRack: string): LexEntry {
  const order = [...myRack, ...'REDOGNU'] as string[];
  const remaining = new Map<string, number>(Object.entries(classic.tiles.counts));
  for (const face of order) remaining.set(face, (remaining.get(face) ?? 0) - 1);
  for (const [face, count] of remaining) {
    for (let i = 0; i < count; i++) order.push(face);
  }
  const state = initialState(classic, order as never, 2);
  return { kind: 'sync', state: serializeState(state), myRack, rows: [] };
}

function syncTransport(entry: LexEntry): GameTransport<GameOptions, LexEntry> {
  return {
    load: async () => ({
      options: {
        rulesetId: 'classic',
        dictionaryId: 'stub',
        bagOrder: canonicalBagOrder('classic'),
        seats: 2,
      },
      log: [entry],
    }),
    submit: async () => {},
    onRemoteEntry: () => () => {},
    reset: async () => {},
  };
}

describe('remote rack arrangement', () => {
  it('the first real rack keeps the rack-doc order despite a pre-init snapshot', async () => {
    const controller = new GameController(
      syncTransport(riggedSyncEntry('CATSNTI')),
      {
        rulesetId: 'classic',
        dictionaryId: 'stub',
        bagOrder: canonicalBagOrder('classic'),
        seats: 2,
      },
      { dict: acceptAll },
      0,
    );
    // A React mount reads the snapshot before init resolves — this is what
    // used to poison the slot arrangement.
    expect(controller.getSnapshot().rack).toHaveLength(classic.rackSize);
    await controller.init();
    expect(controller.getSnapshot().rack.join('')).toBe('CATSNTI');
    controller.dispose();
  });
});
