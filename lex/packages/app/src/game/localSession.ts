// ported from hive/packages/app/src/game/localSession.ts (adapted)
// The hot-seat session: bag shuffled HERE (randomness at the edge, DESIGN
// §3.3), the whole game behind LocalStorageTransport so refresh resumes,
// dictionary loaded per the stored game's options. Singleton across routes.
import type { InvalidWordRule, Ruleset, TileFace } from '@lex/engine';
import { RULESETS } from '@lex/engine';
import { loadDictionary } from '@lex/dict';
import { LocalStorageTransport, type KeyValueStorage } from '@parlor/core';
import type { Dictionary } from '@lex/engine';
import type { HotSeatOptions, LexEntry } from '../controller/entries';
import { GameController } from '../controller/GameController';

export const HOTSEAT_STORAGE_KEY = 'lex.hotseat.v1';

/** What a hot-seat game is configured with. Turn order and time control are
 * meaningless on one device (p0 always starts; there is no clock), so the
 * hot-seat setup screen offers exactly these three. */
export interface HotSeatChoices {
  rulesetId: string;
  dictionaryId: string;
  invalidWords: InvalidWordRule;
}

export const DEFAULT_HOTSEAT: HotSeatChoices = {
  rulesetId: 'classic',
  dictionaryId: 'nwl2023',
  invalidWords: 'blocked',
};

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

/** Deal a fresh hot-seat game under `choices`. Takes an OBJECT rather than
 * positional arguments: the settings list grows (invalidWords was the third),
 * and a caller that silently omitted one used to get the default back — which
 * is how a rematch could quietly change the rules mid-session. */
export function createHotSeatOptions(
  choices: Partial<HotSeatChoices> = {},
  rng: () => number = cryptoRng,
): HotSeatOptions {
  const { rulesetId, dictionaryId, invalidWords } = { ...DEFAULT_HOTSEAT, ...choices };
  const ruleset = RULESETS[rulesetId];
  if (!ruleset) throw new Error(`unknown ruleset '${rulesetId}'`);
  return {
    rulesetId,
    dictionaryId,
    invalidWords,
    bagOrder: shuffledBagOrder(ruleset, rng),
    seats: 2,
  };
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
    const fresh = createHotSeatOptions(DEFAULT_HOTSEAT, rng);
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
    exposeDebugHandle(controller);
    return controller;
  })();
  return initPromise;
}

/** Dev/e2e debug surface (validate:ux reads controller state through it). */
function exposeDebugHandle(c: GameController): void {
  if (typeof window === 'undefined') return;
  try {
    if (import.meta.env?.DEV) {
      (window as unknown as { __lex?: { controller: GameController } }).__lex = { controller: c };
    }
  } catch {
    // import.meta.env absent outside vite — nothing to expose.
  }
}

/** Is there a hot-seat game in storage to resume? Read WITHOUT building a
 * controller: /game/local uses it to decide between resuming and sending the
 * player to the setup screen, and building a controller for a game that may be
 * under a different dictionary is exactly what we're avoiding. */
export function hasStoredGame(storage: KeyValueStorage = window.localStorage): boolean {
  try {
    const raw = storage.getItem(HOTSEAT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { options?: unknown; log?: unknown };
    return typeof parsed?.options === 'object' && parsed.options !== null && Array.isArray(parsed.log);
  } catch {
    return false;
  }
}

/**
 * Start a fresh hot-seat game under newly chosen options, replacing whatever
 * was stored. NOT `controller.newGame()`: the dictionary is injected at
 * construction, so changing it needs a new controller — and the ORDER below
 * matters. `newGame` runs first so the stored log is reset before `init`
 * reloads it; init-then-reset would replay the OLD log through the NEW
 * dictionary, and a word the previous list allowed can throw under a stricter
 * one (2of12inf ⊂ enable1 ⊂ nwl2023 — switching down is the common case).
 */
export async function startLocalGame(
  choices: HotSeatChoices,
  deps: LocalSessionDeps = {},
): Promise<GameController> {
  const storage = deps.storage ?? window.localStorage;
  const loadDict = deps.loadDict ?? loadDictionary;
  const rng = deps.rng ?? cryptoRng;
  const options = createHotSeatOptions(choices, rng);
  const dict = await loadDict(options.dictionaryId);
  const transport = new LocalStorageTransport<HotSeatOptions, LexEntry>(
    options,
    HOTSEAT_STORAGE_KEY,
    storage,
  );
  controller?.dispose();
  const next = new GameController(transport, options, { dict, rng });
  await next.newGame(options);
  await next.init();
  setLocalController(next);
  exposeDebugHandle(next);
  return next;
}

export function getLocalController(): GameController | null {
  return controller;
}

/** Test/gallery hook: replace (or clear) the singleton. */
export function setLocalController(next: GameController | null): void {
  controller = next;
  initPromise = next ? Promise.resolve(next) : null;
}
