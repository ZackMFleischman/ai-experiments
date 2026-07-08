import { useState } from 'react';
import { FEATURES } from '../features';
import { useDetection } from '../state/detection';
import { effectiveYoutubeId, useSettings } from '../state/settings';
import { useUi } from '../state/ui';
import { posterUrl, type StreamMeta } from '../streams';
import { StreamPlayer } from './StreamPlayer';

interface Props {
  stream: StreamMeta;
}

// A dashboard tile. By default (autoplayAll) it mounts a live player immediately — the
// whole point of the dashboard is a wall of feeds playing at once. When autoplay is off
// it falls back to a tap-to-play facade for constrained devices/data.
export function StreamTile({ stream }: Props) {
  const autoplayAll = useSettings((s) => s.autoplayAll);
  const [tapped, setTapped] = useState(false);
  const showPlayer = autoplayAll || tapped;
  // Subscribe to overrides so the resolved id updates when the user edits Settings.
  const overrides = useSettings((s) => s.streamOverrides);
  const youtubeId = overrides[stream.id] ?? effectiveYoutubeId(stream.id, stream.defaultYoutubeId);
  const status = useDetection((s) => s.state.byStream[stream.id]);
  const openFullscreen = useUi((s) => s.openFullscreen);
  const setStreamHidden = useSettings((s) => s.setStreamHidden);

  const count = status?.bearCount ?? 0;
  const poster = posterUrl(youtubeId);
  const isApalooza = status?.bearapalooza ?? false;
  const isAlerting = status?.alerting ?? false;

  return (
    <div className={`tile${isApalooza ? ' tile--apalooza' : isAlerting ? ' tile--alert' : ''}`}>
      <div
        className="tile__media"
        style={poster ? { backgroundImage: `url(${poster})` } : undefined}
      >
        {showPlayer ? (
          <StreamPlayer youtubeId={youtubeId} title={stream.title} explorePage={stream.explorePage} active />
        ) : (
          <button className="tile__facade" onClick={() => setTapped(true)} aria-label={`Play ${stream.title}`}>
            {poster ? (
              <img className="tile__poster" src={poster} alt="" loading="lazy" />
            ) : (
              <div className="tile__poster tile__poster--placeholder" />
            )}
            <span className="tile__play">▶</span>
          </button>
        )}
      </div>

      <div className="tile__overlay">
        <div className="tile__topline">
          <span className="badge badge--live">● LIVE</span>
          <div className="tile__topright">
            {FEATURES.detection ? (
              <span className={`badge badge--count${count > 0 ? ' badge--count-on' : ''}`} title="Bears on screen">
                🐻 {count}
              </span>
            ) : null}
            <button
              className="iconbtn iconbtn--sm"
              title="Hide this stream"
              aria-label={`Hide ${stream.title}`}
              onClick={() => setStreamHidden(stream.id, true)}
            >
              ✕
            </button>
          </div>
        </div>
        <div className="tile__bottomline">
          <span className="tile__title">{stream.title}</span>
          <button className="iconbtn" title="Fullscreen" aria-label={`Fullscreen ${stream.title}`} onClick={() => openFullscreen(stream.id)}>
            ⛶
          </button>
        </div>
      </div>
    </div>
  );
}
