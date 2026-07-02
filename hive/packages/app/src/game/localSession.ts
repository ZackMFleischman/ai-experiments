// The hot-seat session singleton: survives route changes; "New game" resets it.
import type { GameOptions } from '@hive/engine';
import { GameController } from '../controller/GameController';
import { LocalTransport } from '../controller/transport';

export const DEFAULT_OPTIONS: GameOptions = {
  mosquito: true,
  ladybug: true,
  pillbug: true,
  tournamentOpening: true,
};

let controller: GameController | null = null;
let initialized = false;

export function getLocalController(): GameController {
  if (!controller) controller = new GameController(new LocalTransport(DEFAULT_OPTIONS), DEFAULT_OPTIONS);
  return controller;
}

export async function initLocalController(): Promise<GameController> {
  const c = getLocalController();
  if (!initialized) {
    initialized = true;
    await c.init();
  }
  return c;
}

/** Test/gallery hook: replace the singleton. */
export function setLocalController(next: GameController | null): void {
  controller = next;
  initialized = next != null;
}
