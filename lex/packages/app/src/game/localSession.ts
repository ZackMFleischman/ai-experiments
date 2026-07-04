// ported from hive/packages/app/src/game/localSession.ts (adapted)
// The hot-seat session: bag shuffled HERE (randomness at the edge, DESIGN
// §3.3), the whole game behind LocalStorageTransport so refresh resumes,
// dictionary loaded per the stored game's options. Singleton across routes.
import type { Ruleset, TileFace } from '@lex/engine';
import { RULESETS } from '@lex/engine';
import { loadDictionary } from '@lex/dict';
import { LocalStorageTransport, type KeyValueStorage } from '@parlor/core';
import type { Dictionary } from '@lex/engine';
import type { HotSeatOptions, LexEntry } from '../controller/entries';
import { GameController } from '../controller/GameController';

export const HOTSEAT_STORAGE_KEY = 'lex.hotseat.v1';

export const DEFAULT_HOTSEAT = { rulesetId: 'classic', dictionaryId: '2of12inf' } as const;

/** Crypto-backed uniform rng in [0,1); Math.random fallback for old engines. */
function cryptoRng(): number {
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0]! / 0x1_0000_0000;
  }
  return Math.random();
}

function shuffledBagOrder(ruleset: Ruleset, rng: () => number): TileFace[] {
  const order: TileFace[] = [];
  for (const [face, count] of Object.entries(ruleset.tiles.counts)) {
    for (let i = 0; i < count; i++) order.push(face);
  }
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

export function createHotSeatOptions(
  rulesetId: string = DEFAULT_HOTSEAT.rulesetId,
  dictionaryId: string = DEFAULT_HOTSEAT.dictionaryId,
  rng: () => number = cryptoRng,
): HotSeatOptions {
  const ruleset = RULESETS[rulesetId];
  if (!ruleset) throw new Error(`unknown ruleset '${rulesetId}'`);
  return { rulesetId, dictionaryId, bagOrder: shuffledBagOrder(ruleset, rng), seats: 2 };
}

export interface LocalSessionDeps {
  storage?: KeyValueStorage;
  loadDict?: (id: string) => Promise<Dictionary>;
  rng?: () => number;
}

let controller: GameController | null = null;
let initPromise: Promise<GameController> | null = null;

export function initLocalController(deps: LocalSessionDeps = {}): Promise<GameController> {
  initPromise ??= (async () => {
    const storage = deps.storage ?? window.localStorage;
    const loadDict = deps.loadDict ?? loadDictionary;
    const rng = deps.rng ?? cryptoRng;
    const fresh = createHotSeatOptions(DEFAULT_HOTSEAT.rulesetId, DEFAULT_HOTSEAT.dictionaryId, rng);
    const transport = new LocalStorageTransport<HotSeatOptions, LexEntry>(
      fresh,
      HOTSEAT_STORAGE_KEY,
      storage,
    );
    const stored = await transport.load();
    const options = stored?.options ?? fresh;
    const dict = await loadDict(options.dictionaryId);
    controller = new GameController(transport, options, { dict, rng });
    await controller.init();
    return controller;
  })();
  return initPromise;
}

export function getLocalController(): GameController | null {
  return controller;
}

/** Test/gallery hook: replace (or clear) the singleton. */
export function setLocalController(next: GameController | null): void {
  controller = next;
  initPromise = next ? Promise.resolve(next) : null;
}
