import { create } from 'zustand';

export type Panel = 'none' | 'clips' | 'settings';

export interface AlertEntry {
  id: string;
  ts: number;
  kind: 'alert' | 'bearapalooza' | 'catch';
  streamId: string;
  message: string;
}

export interface BearapaloozaState {
  streamId: string;
  ts: number;
  count: number;
}

interface UiStore {
  fullscreenId: string | null;
  panel: Panel;
  alerts: AlertEntry[];
  bearapalooza: BearapaloozaState | null;
  openFullscreen: (id: string) => void;
  closeFullscreen: () => void;
  setPanel: (p: Panel) => void;
  pushAlert: (a: AlertEntry) => void;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;
  setBearapalooza: (b: BearapaloozaState | null) => void;
}

const MAX_ALERTS = 30;

export const useUi = create<UiStore>((set) => ({
  fullscreenId: null,
  panel: 'none',
  alerts: [],
  bearapalooza: null,
  openFullscreen: (id) => set({ fullscreenId: id }),
  closeFullscreen: () => set({ fullscreenId: null }),
  setPanel: (panel) => set({ panel }),
  pushAlert: (a) => set((s) => ({ alerts: [a, ...s.alerts].slice(0, MAX_ALERTS) })),
  dismissAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  clearAlerts: () => set({ alerts: [] }),
  setBearapalooza: (bearapalooza) => set({ bearapalooza }),
}));
