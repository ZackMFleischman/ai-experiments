// ported from hive/packages/app/src/controller/useGameController.ts (adapted)
import { useSyncExternalStore } from 'react';
import type { GameController, Snapshot } from './GameController';

export function useGameController(controller: GameController): Snapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}
