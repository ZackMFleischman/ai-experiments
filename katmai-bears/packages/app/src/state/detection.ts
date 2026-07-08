import { create } from 'zustand';
import { emptyState, reduceFrame, type DetectionFrame, type DetectionState } from '../contract';
import { emitEvent } from '../detection/eventBus';
import { useSettings } from './settings';

interface DetectionStore {
  state: DetectionState;
  /** Fold a frame from whichever source is active, then broadcast any resulting events. */
  ingest: (f: DetectionFrame) => void;
  reset: () => void;
}

export const useDetection = create<DetectionStore>((set, get) => ({
  state: emptyState(),
  ingest: (f) => {
    const thresholds = useSettings.getState().thresholds;
    const { state, events } = reduceFrame(get().state, f, thresholds);
    set({ state });
    for (const e of events) emitEvent(e);
  },
  reset: () => set({ state: emptyState() }),
}));
