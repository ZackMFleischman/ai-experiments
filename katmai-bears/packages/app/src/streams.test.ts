import { describe, expect, it } from 'vitest';
import { resolveCatalog, type StreamMeta } from './streams';
import type { GeneratedStream } from './streams.generated';

// resolveCatalog takes the internal CuratedStream shape (StreamMeta + `match`). This fixture
// type is structurally identical, so it's accepted without a cast.
type Curated = StreamMeta & { match: string[] };

const curated: Curated[] = [
  { id: 'brooks-falls', title: 'Brooks Falls', blurb: 'b', tags: ['falls'], explorePage: 'e/bf', defaultYoutubeId: 'seed-bf', match: ['brooks falls'] },
  { id: 'brooks-falls-low', title: 'Brooks Falls Low', blurb: 'b', tags: ['falls'], explorePage: 'e/low', defaultYoutubeId: 'seed-low', match: ['brooks falls', 'low'] },
  { id: 'underwater-salmon', title: 'Underwater Salmon Cam', blurb: 'b', tags: ['uw'], explorePage: 'e/uw', defaultYoutubeId: 'seed-uw', match: ['underwater'] },
];

const call = (gen: GeneratedStream[]) => resolveCatalog(curated, gen);

describe('resolveCatalog', () => {
  it('falls back to the curated catalog when the playlist is empty', () => {
    const out = call([]);
    expect(out.map((s) => s.id)).toEqual(['brooks-falls', 'brooks-falls-low', 'underwater-salmon']);
    expect(out.map((s) => s.defaultYoutubeId)).toEqual(['seed-bf', 'seed-low', 'seed-uw']);
    // Should be plain StreamMeta — no `match` leaking through.
    expect('match' in out[0]!).toBe(false);
  });

  it('uses playlist order and overrides ids while keeping curated metadata', () => {
    const out = call([
      { youtubeId: 'live-uw', title: 'Underwater Bear Cam | Katmai' },
      { youtubeId: 'live-bf', title: 'Brooks Falls | Brown Bear & Salmon Cam' },
    ]);
    expect(out.map((s) => s.id)).toEqual(['underwater-salmon', 'brooks-falls', 'brooks-falls-low']);
    // matched entries keep curated blurb/explorePage, take the live id
    expect(out[0]).toMatchObject({ id: 'underwater-salmon', blurb: 'b', explorePage: 'e/uw', defaultYoutubeId: 'live-uw' });
    expect(out[1]).toMatchObject({ id: 'brooks-falls', defaultYoutubeId: 'live-bf' });
    // curated cam absent from the playlist is appended with its seed, never dropped
    expect(out[2]).toMatchObject({ id: 'brooks-falls-low', defaultYoutubeId: 'seed-low' });
  });

  it('prefers the most specific match (Low over Falls) and never reuses a curated cam', () => {
    const out = call([
      { youtubeId: 'live-low', title: 'Brooks Falls Low | Katmai' },
      { youtubeId: 'live-bf', title: 'Brooks Falls | Katmai' },
    ]);
    const low = out.find((s) => s.defaultYoutubeId === 'live-low');
    const bf = out.find((s) => s.defaultYoutubeId === 'live-bf');
    expect(low?.id).toBe('brooks-falls-low');
    expect(bf?.id).toBe('brooks-falls');
  });

  it('synthesizes a stream for an unmatched playlist cam', () => {
    const out = call([{ youtubeId: 'live-new', title: "Dumpling Mountain | Katmai's Overlook" }]);
    const created = out.find((s) => s.defaultYoutubeId === 'live-new');
    expect(created).toMatchObject({ id: 'dumpling-mountain', title: 'Dumpling Mountain', tags: ['katmai'] });
  });

  it('falls back to a stable id when a title slugifies to empty', () => {
    const out = call([{ youtubeId: 'abc123', title: '—' }]);
    const created = out.find((s) => s.defaultYoutubeId === 'abc123');
    expect(created?.id).toBe('yt-abc123');
  });
});
