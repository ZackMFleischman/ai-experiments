import { useSyncExternalStore } from 'react';
import type { GameController, Snapshot } from './GameController';

export function useGameController(controller: GameController): Snapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
