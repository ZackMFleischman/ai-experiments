import { create } from 'zustand';
import { DEFAULT_THRESHOLDS, type Thresholds } from '../contract';

const LS_KEY = 'katmai.settings.v1';

export type SourceKind = 'simulator' | 'websocket';

/** Wall tile size. Each spans a SQUARE block of base cells so it stays 16:9 (no letterbox). */
export type TileSize = 'sm' | 'md' | 'lg';
export const TILE_SIZES: TileSize[] = ['sm', 'md', 'lg'];
/** Side length (in base cells) of each size's square block. */
export const TILE_SPAN: Record<TileSize, number> = { sm: 1, md: 2, lg: 3 };

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
  /** streamId → true when hidden from the dashboard. Absent/false = visible. */
  hiddenStreams: Record<string, true>;
  /** User-chosen tile order (streamIds). Ids absent here fall back to the catalog order. */
  streamOrder: string[];
  /** streamId → tile size on the wall. Absent = 'sm'. */
  tileSizes: Record<string, TileSize>;
}

const DEFAULTS: Settings = {
  thresholds: DEFAULT_THRESHOLDS,
  streamOverrides: {},
  notificationsEnabled: false,
  sourceKind: 'simulator',
  backendUrl: '',
  autoplayAll: true,
  hiddenStreams: {},
  streamOrder: [],
  tileSizes: {},
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
      hiddenStreams: { ...(parsed.hiddenStreams ?? {}) },
      streamOrder: Array.isArray(parsed.streamOrder) ? [...parsed.streamOrder] : [],
      tileSizes: { ...(parsed.tileSizes ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

function persist(s: Settings): void {
  if (typeof localStorage === 'undefined') return;
  const { thresholds, streamOverrides, notificationsEnabled, sourceKind, backendUrl, autoplayAll, hiddenStreams, streamOrder, tileSizes } = s;
  localStorage.setItem(
    LS_KEY,
    JSON.stringify({ thresholds, streamOverrides, notificationsEnabled, sourceKind, backendUrl, autoplayAll, hiddenStreams, streamOrder, tileSizes }),
  );
}

interface SettingsStore extends Settings {
  setThresholds: (t: Partial<Thresholds>) => void;
  setOverride: (streamId: string, youtubeId: string) => void;
  clearOverride: (streamId: string) => void;
  setNotificationsEnabled: (v: boolean) => void;
  setSource: (kind: SourceKind, backendUrl?: string) => void;
  setAutoplayAll: (v: boolean) => void;
  setStreamHidden: (streamId: string, hidden: boolean) => void;
  setStreamOrder: (order: string[]) => void;
  setTileSize: (streamId: string, size: TileSize) => void;
  /** Reset the wall: default order, sizes, and un-hide every cam. */
  resetLayout: () => void;
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
  setStreamHidden: (streamId, hidden) => {
    set((s) => {
      const next = { ...s.hiddenStreams };
      if (hidden) next[streamId] = true;
      else delete next[streamId];
      return { hiddenStreams: next };
    });
    persist(get());
  },
  setStreamOrder: (order) => {
    set({ streamOrder: [...order] });
    persist(get());
  },
  setTileSize: (streamId, size) => {
    set((s) => ({ tileSizes: { ...s.tileSizes, [streamId]: size } }));
    persist(get());
  },
  resetLayout: () => {
    set({ streamOrder: [], tileSizes: {}, hiddenStreams: {} });
    persist(get());
  },
}));

/** Resolve the effective YouTube id for a stream: runtime override wins over the seasonal seed. */
export function effectiveYoutubeId(streamId: string, seed: string | undefined): string | undefined {
  const override = useSettings.getState().streamOverrides[streamId];
  return override ?? seed;
}
