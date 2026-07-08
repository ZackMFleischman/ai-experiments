import { create } from 'zustand';
import { DEFAULT_THRESHOLDS, type Thresholds } from '../contract';

const LS_KEY = 'katmai.settings.v1';

export type SourceKind = 'simulator' | 'websocket';

export interface Settings {
  thresholds: Thresholds;
  /** streamId → user-supplied YouTube live id, overriding the seasonal seed in streams.ts. */
  streamOverrides: Record<string, string>;
  notificationsEnabled: boolean;
  sourceKind: SourceKind;
  /** wss URL for the future backend detector (the seam). Empty until one exists. */
  backendUrl: string;
  /** Video-wall default: every tile plays live at once. Off = tap-to-play facades. */
  autoplayAll: boolean;
}

const DEFAULTS: Settings = {
  thresholds: DEFAULT_THRESHOLDS,
  streamOverrides: {},
  notificationsEnabled: false,
  sourceKind: 'simulator',
  backendUrl: '',
  autoplayAll: true,
};

function load(): Settings {
  if (typeof localStorage === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULTS,
      ...parsed,
      thresholds: { ...DEFAULT_THRESHOLDS, ...(parsed.thresholds ?? {}) },
      streamOverrides: { ...(parsed.streamOverrides ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

function persist(s: Settings): void {
  if (typeof localStorage === 'undefined') return;
  const { thresholds, streamOverrides, notificationsEnabled, sourceKind, backendUrl, autoplayAll } = s;
  localStorage.setItem(
    LS_KEY,
    JSON.stringify({ thresholds, streamOverrides, notificationsEnabled, sourceKind, backendUrl, autoplayAll }),
  );
}

interface SettingsStore extends Settings {
  setThresholds: (t: Partial<Thresholds>) => void;
  setOverride: (streamId: string, youtubeId: string) => void;
  clearOverride: (streamId: string) => void;
  setNotificationsEnabled: (v: boolean) => void;
  setSource: (kind: SourceKind, backendUrl?: string) => void;
  setAutoplayAll: (v: boolean) => void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  setThresholds: (t) => {
    set((s) => ({ thresholds: { ...s.thresholds, ...t } }));
    persist(get());
  },
  setOverride: (streamId, youtubeId) => {
    set((s) => ({ streamOverrides: { ...s.streamOverrides, [streamId]: youtubeId } }));
    persist(get());
  },
  clearOverride: (streamId) => {
    set((s) => {
      const next = { ...s.streamOverrides };
      delete next[streamId];
      return { streamOverrides: next };
    });
    persist(get());
  },
  setNotificationsEnabled: (v) => {
    set({ notificationsEnabled: v });
    persist(get());
  },
  setSource: (kind, backendUrl) => {
    set(backendUrl === undefined ? { sourceKind: kind } : { sourceKind: kind, backendUrl });
    persist(get());
  },
  setAutoplayAll: (v) => {
    set({ autoplayAll: v });
    persist(get());
  },
}));

/** Resolve the effective YouTube id for a stream: runtime override wins over the seasonal seed. */
export function effectiveYoutubeId(streamId: string, seed: string | undefined): string | undefined {
  const override = useSettings.getState().streamOverrides[streamId];
  return override ?? seed;
}
