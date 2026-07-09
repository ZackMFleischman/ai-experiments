import { useCallback, useEffect, useRef, useState } from 'react';
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
  const audioStreamId = useUi((s) => s.audioStreamId);
  const toggleAudioStream = useUi((s) => s.toggleAudioStream);
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

  // Chrome (nav arrows, top bar, hint) auto-hides while watching so it never sits on top
  // of the feed, and reappears on any interaction — the usual video-player behaviour.
  // Swipe and arrow keys work whether or not the chrome is showing.
  const [chromeVisible, setChromeVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeChrome = useCallback(() => {
    setChromeVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChromeVisible(false), 3000);
  }, []);

  useEffect(() => {
    if (!fullscreenId) return;
    nudgeChrome();
    const handler = (e: KeyboardEvent) => {
      nudgeChrome();
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') closeFullscreen();
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [fullscreenId, go, closeFullscreen, nudgeChrome]);

  if (!fullscreenId || index < 0) return null;
  const stream = STREAMS[index];
  if (!stream) return null;
  const youtubeId = overrides[stream.id] ?? effectiveYoutubeId(stream.id, stream.defaultYoutubeId);
  const isAudio = audioStreamId === stream.id;

  return (
    <div
      className={`fs${chromeVisible ? '' : ' fs--idle'}`}
      {...swipe}
      onPointerMove={nudgeChrome}
      onPointerDown={nudgeChrome}
    >
      <div className="fs__player">
        <StreamPlayer youtubeId={youtubeId} title={stream.title} explorePage={stream.explorePage} active muted={!isAudio} />
      </div>

      {/* Transparent edge zones sit above the cross-origin iframe (which swallows pointer
          events), so moving the mouse toward an edge reliably re-reveals the arrows. */}
      <div className="fs__edge fs__edge--left" onPointerEnter={nudgeChrome} />
      <div className="fs__edge fs__edge--right" onPointerEnter={nudgeChrome} />

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
        <div className="fs__actions">
          <button
            className={`iconbtn iconbtn--lg${isAudio ? ' iconbtn--on' : ''}`}
            onClick={() => toggleAudioStream(stream.id)}
            title={isAudio ? 'Mute this cam' : 'Listen to this cam'}
            aria-label={isAudio ? `Mute ${stream.title}` : `Listen to ${stream.title}`}
            aria-pressed={isAudio}
            disabled={!youtubeId}
          >
            {isAudio ? '🔊' : '🔇'}
          </button>
          <button className="iconbtn iconbtn--lg" onClick={closeFullscreen} aria-label="Close">
            ✕
          </button>
        </div>
      </div>

      <div className="fs__hint">Swipe or ← → to change cam · {index + 1}/{STREAMS.length}</div>
    </div>
  );
}
