// GENERATED — do not hand-edit. Regenerate with `pnpm refresh:streams` (from katmai-bears/),
// which reads the explore.org Katmai playlist and writes the current live video ids + titles
// here. This IS committed (unlike public/icons + public/ffmpeg): it's the seasonal source of
// truth the app imports, and we don't want the deploy build to depend on YouTube being
// reachable. `streams.ts` treats these entries as authoritative and enriches them with the
// curated blurbs/tags/explore.org links by matching titles.

export interface GeneratedStream {
  /** YouTube live video id (the `watch?v=<id>` / `live/<id>` value). */
  youtubeId: string;
  /** Raw video title as it appears in the playlist, used to match curated cams. */
  title: string;
}

/** ISO timestamp of the last successful refresh, or null if never run. */
export const GENERATED_AT: string | null = "2026-07-08T23:35:16.775Z";

/** Source playlist the entries below were derived from. */
export const PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLAnuZBl2BUgvvh9Nm_QQeSHrRQM_GbtY9";

/** Current live cams, in playlist order. Empty until the first refresh. */
export const GENERATED: GeneratedStream[] = [
  { youtubeId: "J7ZrIDvqlic", title: "LIVE Brooks Falls - Katmai National Park, Alaska 2026 | explore.org" },
  { youtubeId: "z7_GhJeFxQI", title: "LIVE Riffles - Katmai National Park, Alaska | explore.org" },
  { youtubeId: "wkVLYfU-Kew", title: "LIVE River Watch - Katmai National Park, Alaska | explore.org" },
  { youtubeId: "cTsjMtjRLCo", title: "LIVE Kat's River View - Katmai National Park, Alaska | explore.org" },
  { youtubeId: "EwTH5yY7Mks", title: "LIVE Brooks Falls Brown Bears Low | explore.org" },
  { youtubeId: "oQsznpmNcn8", title: "LIVE Underwater Salmon Cam - Katmai National Park, Alaska | explore.org" },
  { youtubeId: "uLgdUiT9WZQ", title: "LIVE Dumpling Mountain - Katmai National Park, Alaska Camera | explore.org" },
];
