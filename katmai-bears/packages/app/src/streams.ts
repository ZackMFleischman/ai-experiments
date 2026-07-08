// The Katmai / Brooks River cam catalog.
//
// The LIVE source of truth is the explore.org YouTube playlist, mirrored into
// `streams.generated.ts` by `pnpm refresh:streams`. Those entries drive the catalog: their
// order is the wall order and their ids are the ones the app plays. We keep a small CURATED
// table below — stable across seasons (slug, blurb, tags, explore.org fallback link) — and
// enrich each playlist entry by matching its title to a curated cam. Playlist cams with no
// curated match still appear, with a title/blurb derived from the playlist.
//
// ⚠️ YouTube live ids ROTATE EACH SEASON (explore.org restarts the streams). That's exactly
// what the playlist refresh handles. `defaultYoutubeId` on a CURATED row is only a
// best-effort seed used when the playlist hasn't been refreshed yet; it's still
// runtime-overridable (Settings → "Stream IDs", persisted to localStorage).

import { GENERATED, type GeneratedStream } from './streams.generated';

export const SEASON = 2026;

export interface StreamMeta {
  id: string;
  title: string;
  blurb: string;
  tags: string[];
  /** Canonical explore.org page — always works as a fallback / "open externally" link. */
  explorePage: string;
  /** Effective YouTube live id (playlist-derived when refreshed, else seed). `undefined` = degrade to explorePage. */
  defaultYoutubeId?: string;
}

/** A curated cam: stable metadata plus lowercase keywords used to match a playlist title. */
interface CuratedStream extends StreamMeta {
  /** All keywords must appear (case-insensitively) in a playlist title to match. */
  match: string[];
}

const CURATED: CuratedStream[] = [
  {
    id: 'brooks-falls',
    title: 'Brooks Falls',
    blurb: 'The famous falls-top view — bears line up to snag sockeye leaping the falls.',
    tags: ['falls', 'flagship'],
    explorePage: 'https://explore.org/livecams/brown-bears/brown-bear-salmon-cam-brooks-falls',
    defaultYoutubeId: 'J7ZrIDvqlic',
    match: ['brooks falls'],
  },
  {
    id: 'brooks-falls-low',
    title: 'Brooks Falls Low',
    blurb: 'Just downstream of the falls where less dominant bears fish the riffles.',
    tags: ['falls', 'riffles'],
    explorePage: 'https://explore.org/livecams/brown-bears/brooks-falls-brown-bears-low',
    defaultYoutubeId: 'EwTH5yY7Mks',
    match: ['brooks falls', 'low'],
  },
  {
    id: 'riffles',
    title: 'Riffles',
    blurb: 'Shallow braided runs — cubs and patient anglers working the current.',
    tags: ['river', 'riffles'],
    explorePage: 'https://explore.org/livecams/brown-bears/brooks-river-riffles-brown-bear-cam',
    defaultYoutubeId: 'z7_GhJeFxQI',
    match: ['riffle'],
  },
  {
    id: 'underwater-salmon',
    title: 'Underwater Salmon Cam',
    blurb: 'Below the surface at the river mouth — salmon runs and swimming bears.',
    tags: ['underwater', 'salmon'],
    explorePage: 'https://explore.org/livecams/brown-bears/brown-bear-salmon-cam-brooks-falls-underwater-cam',
    defaultYoutubeId: 'oQsznpmNcn8',
    match: ['underwater'],
  },
  {
    id: 'kats-river-view',
    title: "Kat's River View / Lower River",
    blurb: 'The lower river toward Naknek Lake — prime autumn scavenging on spent salmon.',
    tags: ['river', 'autumn'],
    explorePage: 'https://explore.org/livecams/brown-bears/brooks-river-lower-river-bear-cam',
    defaultYoutubeId: 'cTsjMtjRLCo',
    match: ['lower river'],
  },
];

/** Fallback explore.org page for a playlist cam we couldn't match to a curated one. */
const EXPLORE_INDEX = 'https://explore.org/livecams/brown-bears';

function stripMatch(c: CuratedStream): StreamMeta {
  const { match: _m, ...meta } = c;
  return meta;
}

/** A YouTube title → a short display title (drop the "| Brown Bear Cam | Katmai …" suffix). */
function displayTitle(raw: string): string {
  const head = raw.split('|')[0]?.trim();
  return head && head.length > 0 ? head : raw.trim();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Find the curated cam that best matches a playlist title (all keywords present, most specific wins). */
function bestMatch(title: string, pool: CuratedStream[]): CuratedStream | undefined {
  const hay = title.toLowerCase();
  let best: CuratedStream | undefined;
  for (const c of pool) {
    if (!c.match.every((k) => hay.includes(k))) continue;
    if (!best || c.match.length > best.match.length) best = c;
  }
  return best;
}

/**
 * Resolve the effective catalog. When the playlist has been refreshed, it is authoritative:
 * entries appear in playlist order, enriched by curated metadata where a title matches.
 * Any curated cam not present in the playlist is appended (keeping its seed), so a known cam
 * never silently disappears. When the playlist is empty (never refreshed), we fall back to
 * the curated catalog verbatim — identical to the pre-playlist behavior.
 */
export function resolveCatalog(curated: CuratedStream[], generated: GeneratedStream[]): StreamMeta[] {
  if (generated.length === 0) return curated.map(stripMatch);

  const pool = [...curated];
  const usedIds = new Set<string>();
  const takenSlugs = new Set<string>();
  const out: StreamMeta[] = [];

  const claimSlug = (base: string, fallback: string): string => {
    let slug = base || fallback;
    let n = 2;
    while (takenSlugs.has(slug)) slug = `${base || fallback}-${n++}`;
    takenSlugs.add(slug);
    return slug;
  };

  for (const g of generated) {
    const match = bestMatch(g.title, pool.filter((c) => !usedIds.has(c.id)));
    if (match) {
      usedIds.add(match.id);
      takenSlugs.add(match.id);
      out.push({ ...stripMatch(match), defaultYoutubeId: g.youtubeId });
    } else {
      const title = displayTitle(g.title);
      out.push({
        id: claimSlug(slugify(title), `yt-${g.youtubeId}`),
        title,
        blurb: 'Live Katmai brown-bear cam from the explore.org playlist.',
        tags: ['katmai'],
        explorePage: EXPLORE_INDEX,
        defaultYoutubeId: g.youtubeId,
      });
    }
  }

  for (const c of curated) {
    if (!usedIds.has(c.id)) out.push(stripMatch(c));
  }
  return out;
}

export const STREAMS: StreamMeta[] = resolveCatalog(CURATED, GENERATED);

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
