// Gallery fixtures (T3.11, §4.1): named, reproducible states built ONLY
// through the engine's public API + the controller — replayed from the
// pinned GCG fixtures. Deterministic: rigged bags, fixed rng, no clocks.
import { Box, CircularProgress } from '@mui/material';
import { RULESETS, applyMove, initialState, parseGcg, serializePublic } from '@lex/engine';
import type { GameState, TileFace } from '@lex/engine';
import { LocalTransport } from '@parlor/core';
import { useEffect, useState, type ReactNode } from 'react';
import { riggedBagOrder, stubDict } from '../../../engine/test/helpers';
import type { HotSeatOptions, LexEntry } from '../controller/entries';
import { GameController } from '../controller/GameController';

export interface GameFixture {
  rulesetId: string;
  seats: number;
  startingRacks: readonly (readonly TileFace[])[];
  bagPrefix?: readonly TileFace[];
  moves: readonly string[];
}

export const P0_RACK: TileFace[] = ['C', 'A', 'T', 'S', '?', 'E', 'R'];
export const P1_RACK: TileFace[] = ['D', 'O', 'G', 'L', 'I', 'P', 'U'];

export function freshOptions(rulesetId = 'classic'): HotSeatOptions {
  const ruleset = RULESETS[rulesetId];
  if (!ruleset) throw new Error(`unknown ruleset '${rulesetId}'`);
  return {
    rulesetId,
    dictionaryId: 'stub',
    bagOrder: riggedBagOrder(ruleset, [P0_RACK, P1_RACK]),
    seats: 2,
  };
}

function storedLog(fixture: GameFixture): { options: HotSeatOptions; log: LexEntry[] } {
  const ruleset = RULESETS[fixture.rulesetId];
  if (!ruleset) throw new Error(`unknown ruleset '${fixture.rulesetId}'`);
  const bagOrder = riggedBagOrder(ruleset, fixture.startingRacks, fixture.bagPrefix ?? []);
  const dict = stubDict();
  let state: GameState = initialState(ruleset, bagOrder, fixture.seats);
  const log: LexEntry[] = [];
  for (const line of fixture.moves) {
    const move = parseGcg(line, state);
    state = applyMove(state, move, dict);
    if (move.type === 'play') log.push({ kind: 'play', placements: move.placements });
    else if (move.type === 'exchange') log.push({ kind: 'exchange', tiles: move.tiles, bagAfter: state.bag });
    else log.push({ kind: 'pass' });
  }
  return {
    options: { rulesetId: fixture.rulesetId, dictionaryId: 'stub', bagOrder, seats: fixture.seats },
    log,
  };
}

/** The public snapshot of a fixture's final position (lobby thumbnails, T4.7). */
export function fixturePublic(fixture: GameFixture): string {
  const ruleset = RULESETS[fixture.rulesetId];
  if (!ruleset) throw new Error(`unknown ruleset '${fixture.rulesetId}'`);
  const bagOrder = riggedBagOrder(ruleset, fixture.startingRacks, fixture.bagPrefix ?? []);
  const dict = stubDict();
  let state: GameState = initialState(ruleset, bagOrder, fixture.seats);
  for (const line of fixture.moves) state = applyMove(state, parseGcg(line, state), dict);
  return serializePublic(state);
}

/** Build a controller from a fixture replay, then run `setup` on it. */
export async function fixtureController(
  fixture: GameFixture | null,
  setup?: (controller: GameController) => void | Promise<void>,
  rejectWords: readonly string[] = [],
  extraEntries: readonly LexEntry[] = [],
): Promise<GameController> {
  const { options, log } = fixture ? storedLog(fixture) : { options: freshOptions(), log: [] };
  log.push(...extraEntries);
  const transport = new LocalTransport<HotSeatOptions, LexEntry>(options);
  for (let i = 0; i < log.length; i++) await transport.submit(log[i]!, i);
  const controller = new GameController(transport, options, {
    dict: stubDict(rejectWords),
    rng: () => 0.5,
  });
  await controller.init();
  await setup?.(controller);
  return controller;
}

/** Renders once the async fixture is built (the walker waits for content). */
export function WithController({
  make,
  render,
}: {
  make: () => Promise<GameController>;
  render: (controller: GameController) => ReactNode;
}) {
  const [controller, setController] = useState<GameController | null>(null);
  useEffect(() => {
    let alive = true;
    void make().then((c) => {
      if (alive) setController(c);
    });
    return () => {
      alive = false;
    };
    // make is stable per entry render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!controller) return <CircularProgress size={20} sx={{ m: 2 }} />;
  return <Box data-gallery-ready sx={{ height: '100%' }}>{render(controller)}</Box>;
}
