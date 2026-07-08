// Refresh the live cam catalog from the explore.org Katmai YouTube playlist.
//
//   pnpm refresh:streams                 # uses the default playlist below
//   pnpm refresh:streams <playlistUrl>   # or a full URL / bare list id
//
// Scrapes the public playlist page for `ytInitialData` and pulls every video's id + title,
// in playlist order, then writes src/streams.generated.ts. No API key: this reads the same
// HTML a browser gets. It must run somewhere with network access to youtube.com (your
// machine or CI) — the generated file is committed so the app/deploy never needs YouTube.
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PLAYLIST = 'https://www.youtube.com/playlist?list=PLAnuZBl2BUgvvh9Nm_QQeSHrRQM_GbtY9';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, '..', 'src', 'streams.generated.ts');

/** Accept a full playlist URL, a `watch?...&list=` URL, or a bare list id. */
function toPlaylistUrl(arg) {
  if (!arg) return DEFAULT_PLAYLIST;
  if (arg.startsWith('http')) return arg;
  return `https://www.youtube.com/playlist?list=${arg}`;
}

/** Extract the JSON object literal that follows `marker` via brace matching (robust to layout churn). */
function extractJsonAfter(html, marker) {
  const at = html.indexOf(marker);
  if (at === -1) return null;
  const start = html.indexOf('{', at);
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      return html.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Walk any object graph, collecting every playlistVideoRenderer as {youtubeId, title} in
 * document order (recursive DFS — the first occurrence of a videoId wins, so dedup keeps the
 * playlist's own ordering, which is the wall order).
 */
function collectVideos(root) {
  const out = [];
  const seen = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    const r = node.playlistVideoRenderer;
    if (r && typeof r.videoId === 'string' && !seen.has(r.videoId)) {
      seen.add(r.videoId);
      const title = r.title?.runs?.[0]?.text ?? r.title?.simpleText ?? '';
      out.push({ youtubeId: r.videoId, title: String(title).trim() });
    }
    for (const v of Array.isArray(node) ? node : Object.values(node)) visit(v);
  };
  visit(root);
  return out;
}

function serialize(videos, playlistUrl, generatedAt) {
  const entries = videos
    .map((v) => `  { youtubeId: ${JSON.stringify(v.youtubeId)}, title: ${JSON.stringify(v.title)} },`)
    .join('\n');
  const body = videos.length ? `[\n${entries}\n]` : '[]';
  return `// GENERATED — do not hand-edit. Regenerate with \`pnpm refresh:streams\` (from katmai-bears/),
// which reads the explore.org Katmai playlist and writes the current live video ids + titles
// here. This IS committed (unlike public/icons + public/ffmpeg): it's the seasonal source of
// truth the app imports, and we don't want the deploy build to depend on YouTube being
// reachable. \`streams.ts\` treats these entries as authoritative and enriches them with the
// curated blurbs/tags/explore.org links by matching titles.

export interface GeneratedStream {
  /** YouTube live video id (the \`watch?v=<id>\` / \`live/<id>\` value). */
  youtubeId: string;
  /** Raw video title as it appears in the playlist, used to match curated cams. */
  title: string;
}

/** ISO timestamp of the last successful refresh, or null if never run. */
export const GENERATED_AT: string | null = ${JSON.stringify(generatedAt)};

/** Source playlist the entries below were derived from. */
export const PLAYLIST_URL = ${JSON.stringify(playlistUrl)};

/** Current live cams, in playlist order. Empty until the first refresh. */
export const GENERATED: GeneratedStream[] = ${body};
`;
}

async function main() {
  const playlistUrl = toPlaylistUrl(process.argv[2]);
  process.stdout.write(`Fetching ${playlistUrl}\n`);

  const res = await fetch(playlistUrl, {
    headers: {
      // Ask for the desktop HTML (ytInitialData) and English titles.
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`Playlist fetch failed: HTTP ${res.status}`);
  const html = await res.text();

  const raw = extractJsonAfter(html, 'ytInitialData');
  if (!raw) throw new Error('Could not find ytInitialData in the playlist page.');

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to parse ytInitialData JSON: ${e instanceof Error ? e.message : e}`);
  }

  const videos = collectVideos(data);
  if (videos.length === 0) {
    throw new Error('Parsed the playlist but found no videos — the page layout may have changed.');
  }

  const generatedAt = new Date().toISOString();
  await writeFile(outFile, serialize(videos, playlistUrl, generatedAt), 'utf8');

  process.stdout.write(`Wrote ${videos.length} cam(s) to src/streams.generated.ts:\n`);
  for (const v of videos) process.stdout.write(`  ${v.youtubeId}  ${v.title}\n`);
}

main().catch((err) => {
  process.stderr.write(`refresh:streams failed — ${err instanceof Error ? err.message : err}\n`);
  process.exitCode = 1;
});
