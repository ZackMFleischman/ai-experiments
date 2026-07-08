import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface ClipRecord {
  id: string;
  streamId: string;
  streamTitle: string;
  ts: number;
  mime: string;
  durationMs: number;
  /** JPEG data URL for gallery previews. */
  thumbnail: string;
  blob: Blob;
}

interface ClipsDB extends DBSchema {
  clips: {
    key: string;
    value: ClipRecord;
    indexes: { 'by-ts': number };
  };
}

let dbPromise: Promise<IDBPDatabase<ClipsDB>> | null = null;

function db(): Promise<IDBPDatabase<ClipsDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ClipsDB>('katmai-clips', 1, {
      upgrade(database) {
        const store = database.createObjectStore('clips', { keyPath: 'id' });
        store.createIndex('by-ts', 'ts');
      },
    });
  }
  return dbPromise;
}

export async function addClip(clip: ClipRecord): Promise<void> {
  const d = await db();
  await d.put('clips', clip);
}

export async function allClips(): Promise<ClipRecord[]> {
  const d = await db();
  const clips = await d.getAllFromIndex('clips', 'by-ts');
  return clips.reverse(); // newest first
}

export async function deleteClip(id: string): Promise<void> {
  const d = await db();
  await d.delete('clips', id);
}

export async function clearClips(): Promise<void> {
  const d = await db();
  await d.clear('clips');
}

/** Keep only the newest `max` clips; delete the rest. Returns ids removed. */
export async function evictBeyond(max: number): Promise<string[]> {
  const d = await db();
  const keys = await d.getAllKeysFromIndex('clips', 'by-ts'); // ascending ts (oldest first)
  const removed: string[] = [];
  const overflow = keys.length - max;
  for (let i = 0; i < overflow; i++) {
    const key = keys[i];
    if (key !== undefined) {
      await d.delete('clips', key);
      removed.push(key);
    }
  }
  return removed;
}
