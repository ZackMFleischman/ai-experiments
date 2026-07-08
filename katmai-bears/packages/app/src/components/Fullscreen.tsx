import { useCallback, useEffect } from 'react';
import { FEATURES } from '../features';
import { useSwipe } from '../hooks/useSwipe';
import { useDetection } from '../state/detection';
import { effectiveYoutubeId, useSettings } from '../state/settings';
import { useUi } from '../state/ui';
import { STREAMS } from '../streams';
import { StreamPlayer } from './StreamPlayer';

// Immersive single-feed view. A CSS-fixed overlay (works on iOS) with swipe-left/right,
// arrow keys, on-screen prev/next, and Esc to close. Deep-linkable via ?stream&full.
export function Fullscreen() {
  const fullscreenId = useUi((s) => s.fullscreenId);
  const openFullscreen = useUi((s) => s.openFullscreen);
  const closeFullscreen = useUi((s) => s.closeFullscreen);
  const overrides = useSettings((s) => s.streamOverrides);
  const count = useDetection((s) => (fullscreenId ? (s.state.byStream[fullscreenId]?.bearCount ?? 0) : 0));

  const index = STREAMS.findIndex((s) => s.id === fullscreenId);

  const go = useCallback(
    (delta: number) => {
      if (index < 0) return;
      const next = STREAMS[(index + delta + STREAMS.length) % STREAMS.length];
      if (next) openFullscreen(next.id);
    },
    [index, openFullscreen],
  );

  const swipe = useSwipe(
    () => go(1),
    () => go(-1),
  );

  useEffect(() => {
    if (!fullscreenId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') closeFullscreen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreenId, go, closeFullscreen]);

  if (!fullscreenId || index < 0) return null;
  const stream = STREAMS[index];
  if (!stream) return null;
  const youtubeId = overrides[stream.id] ?? effectiveYoutubeId(stream.id, stream.defaultYoutubeId);

  return (
    <div className="fs" {...swipe}>
      <div className="fs__player">
        <StreamPlayer youtubeId={youtubeId} title={stream.title} explorePage={stream.explorePage} active />
      </div>

      <button className="fs__nav fs__nav--prev" onClick={() => go(-1)} aria-label="Previous cam">
        ‹
      </button>
      <button className="fs__nav fs__nav--next" onClick={() => go(1)} aria-label="Next cam">
        ›
      </button>

      <div className="fs__top">
        <div className="fs__title">
          {stream.title}
          {FEATURES.detection ? <span className="badge badge--count badge--count-on">🐻 {count}</span> : null}
        </div>
        <button className="iconbtn iconbtn--lg" onClick={closeFullscreen} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="fs__hint">Swipe or ← → to change cam · {index + 1}/{STREAMS.length}</div>
    </div>
  );
}
