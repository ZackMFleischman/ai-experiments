import { create } from 'zustand';
import { CONFIG } from '../config';
import { addClip, allClips, clearClips, deleteClip, evictBeyond, type ClipRecord } from './db';

export interface ClipView {
  id: string;
  streamId: string;
  streamTitle: string;
  ts: number;
  mime: string;
  durationMs: number;
  thumbnail: string;
  /** Object URL for playback/download; revoked and rebuilt on reload. */
  url: string;
  blob: Blob;
}

interface ClipsStore {
  clips: ClipView[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (rec: ClipRecord) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

function toView(rec: ClipRecord): ClipView {
  return {
    id: rec.id,
    streamId: rec.streamId,
    streamTitle: rec.streamTitle,
    ts: rec.ts,
    mime: rec.mime,
    durationMs: rec.durationMs,
    thumbnail: rec.thumbnail,
    url: URL.createObjectURL(rec.blob),
    blob: rec.blob,
  };
}

export const useClips = create<ClipsStore>((set, get) => ({
  clips: [],
  loaded: false,
  load: async () => {
    for (const c of get().clips) URL.revokeObjectURL(c.url);
    const records = await allClips();
    set({ clips: records.map(toView), loaded: true });
  },
  add: async (rec) => {
    await addClip(rec);
    await evictBeyond(CONFIG.maxClips);
    await get().load();
  },
  remove: async (id) => {
    await deleteClip(id);
    await get().load();
  },
  clearAll: async () => {
    await clearClips();
    await get().load();
  },
}));
