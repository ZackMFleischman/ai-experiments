// GENERATED — do not hand-edit. Regenerate with `pnpm refresh:streams` (from katmai-bears/),
// which reads the explore.org Katmai playlist and writes the current live video ids + titles
// here. This IS committed (unlike public/icons + public/ffmpeg): it's the seasonal source of
// truth the app imports, and we don't want the deploy build to depend on YouTube being
// reachable. `streams.ts` treats these entries as authoritative and enriches them with the
// curated blurbs/tags/explore.org links by matching titles.
//
// Seeded empty: until you run `pnpm refresh:streams`, the app falls back to the curated
// seed ids in `streams.ts`, i.e. behaves exactly as before.

export interface GeneratedStream {
  /** YouTube live video id (the `watch?v=<id>` / `live/<id>` value). */
  youtubeId: string;
  /** Raw video title as it appears in the playlist, used to match curated cams. */
  title: string;
}

/** ISO timestamp of the last successful refresh, or null if never run. */
export const GENERATED_AT: string | null = null;

/** Source playlist the entries below were derived from. */
export const PLAYLIST_URL =
  'https://www.youtube.com/playlist?list=PLAnuZBl2BUgvvh9Nm_QQeSHrRQM_GbtY9';

/** Current live cams, in playlist order. Empty until the first refresh. */
export const GENERATED: GeneratedStream[] = [];
