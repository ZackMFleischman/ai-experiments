// Test/gallery helper: convert the engine's pinned full-game fixtures (GCG
// lines) into a StoredGame the transport seam understands, by replaying the
// engine. Exchange entries pin the engine's deterministic post-bag order.
import { RULESETS, applyMove, initialState, parseGcg } from '@lex/engine';
import type { GameState, TileFace } from '@lex/engine';
import { riggedBagOrder, stubDict } from '../../engine/test/helpers';
import type { HotSeatOptions, LexEntry } from '../src/controller/entries';

export interface GameFixture {
  rulesetId: string;
  seats: number;
  startingRacks: readonly (readonly TileFace[])[];
  bagPrefix?: readonly TileFace[];
  moves: readonly string[];
}

export function storedGameFromFixture(fixture: GameFixture): {
  options: HotSeatOptions;
  log: LexEntry[];
  finalState: GameState;
} {
  const ruleset = RULESETS[fixture.rulesetId];
  if (!ruleset) throw new Error(`unknown ruleset '${fixture.rulesetId}'`);
  const bagOrder = riggedBagOrder(ruleset, fixture.startingRacks, fixture.bagPrefix ?? []);
  const dict = stubDict();
  let state = initialState(ruleset, bagOrder, fixture.seats);
  const log: LexEntry[] = [];
  for (const line of fixture.moves) {
    const move = parseGcg(line, state);
    state = applyMove(state, move, dict);
    if (move.type === 'play') log.push({ kind: 'play', placements: move.placements });
    else if (move.type === 'exchange')
      log.push({ kind: 'exchange', tiles: move.tiles, bagAfter: state.bag });
    else log.push({ kind: 'pass' });
  }
  return {
    options: { rulesetId: fixture.rulesetId, dictionaryId: 'stub', bagOrder, seats: fixture.seats },
    log,
    finalState: state,
  };
}
