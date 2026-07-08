// The Katmai / Brooks River cam catalog.
//
// ⚠️ YouTube live-stream IDs ROTATE EACH SEASON (explore.org restarts the streams,
// minting a fresh watch?v=<id> every year). So `defaultYoutubeId` is a best-effort
// seed, not gospel. The app lets you paste a fresh ID at runtime (Settings → "Stream
// IDs", persisted to localStorage) which overrides the seed — no code change needed.
// To refresh a seed here: open the cam's `explorePage`, click through to its YouTube
// live video, copy the id from the URL, paste below, and bump SEASON.
//
// The cam SET itself (names, blurbs, explore.org slugs) is stable across seasons.

export const SEASON = 2026;

export interface StreamMeta {
  id: string;
  title: string;
  blurb: string;
  tags: string[];
  /** Canonical explore.org page — always works as a fallback / "open externally" link. */
  explorePage: string;
  /** Seasonal YouTube live id. May be stale; overridable at runtime. `undefined` = degrade to explorePage. */
  defaultYoutubeId?: string;
}

export const STREAMS: StreamMeta[] = [
  {
    id: 'brooks-falls',
    title: 'Brooks Falls',
    blurb: 'The famous falls-top view — bears line up to snag sockeye leaping the falls.',
    tags: ['falls', 'flagship'],
    explorePage: 'https://explore.org/livecams/brown-bears/brown-bear-salmon-cam-brooks-falls',
    defaultYoutubeId: 'J7ZrIDvqlic',
  },
  {
    id: 'brooks-falls-low',
    title: 'Brooks Falls Low (Riffles)',
    blurb: 'Just downstream of the falls where less dominant bears fish the riffles.',
    tags: ['falls', 'riffles'],
    explorePage: 'https://explore.org/livecams/brown-bears/brooks-falls-brown-bears-low',
    defaultYoutubeId: 'EwTH5yY7Mks',
  },
  {
    id: 'underwater',
    title: 'Brooks Falls Underwater',
    blurb: 'Mounted on the floating bridge — salmon and swimming bears from below the surface.',
    tags: ['underwater', 'salmon'],
    explorePage: 'https://explore.org/livecams/brown-bears/brown-bear-salmon-cam-brooks-falls-underwater-cam',
  },
  {
    id: 'lower-river',
    title: 'Lower Brooks River',
    blurb: 'The river mouth — where autumn bears scavenge spent salmon near Naknek Lake.',
    tags: ['river', 'autumn'],
    explorePage: 'https://explore.org/livecams/brown-bears/brooks-river-lower-river-bear-cam',
  },
  {
    id: 'riffles',
    title: 'Brooks River Riffles',
    blurb: 'Shallow braided runs upstream of the falls — cubs and patient anglers.',
    tags: ['river', 'riffles'],
    explorePage: 'https://explore.org/livecams/brown-bears/brooks-river-riffles-brown-bear-cam',
  },
  {
    id: 'dumpling-mountain',
    title: 'Dumpling Mountain',
    blurb: 'A panoramic overlook 2,200 ft up, looking down the valley toward the falls.',
    tags: ['scenic', 'overlook'],
    explorePage: 'https://explore.org/livecams/brown-bears/dumpling-mountain-cam',
  },
  {
    id: 'spawning-channel',
    title: 'Brooks Falls Spawning Channel',
    blurb: 'A quiet side channel where salmon spawn — foxes and bears drop by.',
    tags: ['salmon', 'quiet'],
    explorePage: 'https://explore.org/livecams/brown-bears/brooks-falls-spawning-channel',
  },
];

export function getStream(id: string): StreamMeta | undefined {
  return STREAMS.find((s) => s.id === id);
}

/** Poster thumbnail for a facade tile. YouTube's still frame when we have an id, else a gradient placeholder handled in CSS. */
export function posterUrl(youtubeId: string | undefined): string | undefined {
  return youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : undefined;
}
