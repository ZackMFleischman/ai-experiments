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
    title: 'Brooks Falls Low',
    blurb: 'Just downstream of the falls where less dominant bears fish the riffles.',
    tags: ['falls', 'riffles'],
    explorePage: 'https://explore.org/livecams/brown-bears/brooks-falls-brown-bears-low',
    defaultYoutubeId: 'EwTH5yY7Mks',
  },
  {
    id: 'riffles',
    title: 'Riffles',
    blurb: 'Shallow braided runs — cubs and patient anglers working the current.',
    tags: ['river', 'riffles'],
    explorePage: 'https://explore.org/livecams/brown-bears/brooks-river-riffles-brown-bear-cam',
    defaultYoutubeId: 'z7_GhJeFxQI',
  },
  {
    id: 'underwater-salmon',
    title: 'Underwater Salmon Cam',
    blurb: 'Below the surface at the river mouth — salmon runs and swimming bears.',
    tags: ['underwater', 'salmon'],
    explorePage: 'https://explore.org/livecams/brown-bears/brown-bear-salmon-cam-brooks-falls-underwater-cam',
    defaultYoutubeId: 'oQsznpmNcn8',
  },
  {
    id: 'kats-river-view',
    title: "Kat's River View / Lower River",
    blurb: 'The lower river toward Naknek Lake — prime autumn scavenging on spent salmon.',
    tags: ['river', 'autumn'],
    explorePage: 'https://explore.org/livecams/brown-bears/brooks-river-lower-river-bear-cam',
    defaultYoutubeId: 'cTsjMtjRLCo',
  },
];

export function getStream(id: string): StreamMeta | undefined {
  return STREAMS.find((s) => s.id === id);
}

/**
 * Apply a user-chosen order to the catalog. Ids in `order` come first (in that order,
 * de-duped, unknown ids dropped); any catalog cam missing from `order` is appended in
 * its default position, so new cams surface automatically and a stale order never hides one.
 */
export function orderedStreams(order: string[]): StreamMeta[] {
  const byId = new Map(STREAMS.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const out: StreamMeta[] = [];
  for (const id of order) {
    const s = byId.get(id);
    if (s && !seen.has(id)) {
      out.push(s);
      seen.add(id);
    }
  }
  for (const s of STREAMS) if (!seen.has(s.id)) out.push(s);
  return out;
}

/** Poster thumbnail for a facade tile. YouTube's still frame when we have an id, else a gradient placeholder handled in CSS. */
export function posterUrl(youtubeId: string | undefined): string | undefined {
  return youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : undefined;
}
