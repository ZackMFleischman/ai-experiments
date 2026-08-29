// Gallery fixtures (T3.11, §4.1): named, reproducible states built ONLY
// through the engine's public API + the controller — replayed from the
// pinned GCG fixtures. Deterministic: rigged bags, fixed rng, no clocks.
import { Box, CircularProgress } from '@mui/material';
import { RULESETS, applyMove, initialState, parseGcg, serializePublic, withdraw } from '@lex/engine';
import type { GameState, InvalidWordRule, Seat, TileFace } from '@lex/engine';
import { LocalTransport } from '@parlor/core';
import { useEffect, useState, type ReactNode } from 'react';
import { canonicalBagOrder, riggedBagOrder, stubDict } from '../../../engine/test/helpers';
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

export function freshOptions(
  rulesetId = 'classic',
  invalidWords: InvalidWordRule = 'blocked',
): HotSeatOptions {
  const ruleset = RULESETS[rulesetId];
  if (!ruleset) throw new Error(`unknown ruleset '${rulesetId}'`);
  return {
    rulesetId,
    dictionaryId: 'stub',
    invalidWords,
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
  /** 'costs-turn' (§2.3): the preview withholds every dictionary verdict, and
   * a committed phoney raises the beat instead of being refused. */
  invalidWords: InvalidWordRule = 'blocked',
): Promise<GameController> {
  const base = fixture ? storedLog(fixture) : { options: freshOptions(), log: [] };
  const { log } = base;
  const options: HotSeatOptions = { ...base.options, invalidWords };
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

/** Rigged racks for the N-seat table fixtures (T7.14), seat order. */
const TABLE_RACKS: readonly (readonly TileFace[])[] = [
  ['C', 'A', 'T', 'S', 'E', 'R', 'N'],
  ['D', 'O', 'G', 'L', 'I', 'P', 'U'],
  ['M', 'I', 'N', 'E', 'R', 'A', 'L'],
  ['B', 'O', 'X', 'E', 'S', 'T', 'Y'],
];

/**
 * An N-seat hot-seat controller for the catch-up / columnar-sheet entries
 * (T7.14): rigged racks per seat and a fixed rng, driven through the
 * controller's own actions so every sheet row is real recorded verdict data.
 */
export async function tableController(
  seats: number,
  script?: (controller: GameController) => void,
): Promise<GameController> {
  const ruleset = RULESETS['classic']!;
  const options: HotSeatOptions = {
    rulesetId: 'classic',
    dictionaryId: 'stub',
    // A pinned draw tail too, so refills are letters rather than the blanks
    // and A's the sorted remainder starts with.
    bagOrder: riggedBagOrder(ruleset, TABLE_RACKS.slice(0, seats), [
      'R', 'A', 'T', 'E', 'S', 'O', 'N', 'I', 'T', 'E', 'A', 'D',
    ]),
    seats,
  };
  const transport = new LocalTransport<HotSeatOptions, LexEntry>(options);
  const controller = new GameController(transport, options, {
    dict: stubDict(),
    rng: () => 0.5,
  });
  await controller.init();
  script?.(controller);
  return controller;
}

/** Lay `letters` (found in the acting rack, whatever slot they landed in)
 * into `cells` and commit the turn. Slot order is a reconciliation detail —
 * addressing tiles by letter keeps the fixtures readable and stable. */
export function playWord(
  controller: GameController,
  letters: string,
  cells: readonly { row: number; col: number }[],
): void {
  [...letters].forEach((letter, i) => {
    const slot = controller.getSnapshot().rack.indexOf(letter as TileFace);
    if (slot < 0) throw new Error(`no '${letter}' in the rack`);
    controller.placeAt(cells[i]!, slot);
  });
  controller.submitPlay();
}

/**
 * A dealt N-seat state for the score-bar entries (T7.13): `passes` rotate the
 * turn, `out` seats withdraw. Built through the engine so the rail's queue is
 * the real `turnQueue`, never a hand-written order.
 */
export function seatedState(
  seats: number,
  opts: { passes?: number; out?: readonly Seat[] } = {},
): GameState {
  const ruleset = RULESETS['classic']!;
  const dict = stubDict();
  let state = initialState(ruleset, canonicalBagOrder(ruleset), seats);
  for (let i = 0; i < (opts.passes ?? 0); i++) state = applyMove(state, { type: 'pass' }, dict);
  for (const seat of opts.out ?? []) state = withdraw(state, seat);
  return state;
}
