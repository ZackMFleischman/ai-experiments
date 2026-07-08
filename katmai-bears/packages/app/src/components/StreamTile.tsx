import { useState } from 'react';
import { useDetection } from '../state/detection';
import { effectiveYoutubeId, useSettings } from '../state/settings';
import { useUi } from '../state/ui';
import { posterUrl, type StreamMeta } from '../streams';
import { StreamPlayer } from './StreamPlayer';

interface Props {
  stream: StreamMeta;
}

// A dashboard tile. Starts as a facade (poster + play button) and only mounts a live
// YouTube player when tapped — so a grid of 7 cams doesn't spin up 7 players at once.
export function StreamTile({ stream }: Props) {
  const [live, setLive] = useState(false);
  // Subscribe to overrides so the resolved id updates when the user edits Settings.
  const overrides = useSettings((s) => s.streamOverrides);
  const youtubeId = overrides[stream.id] ?? effectiveYoutubeId(stream.id, stream.defaultYoutubeId);
  const status = useDetection((s) => s.state.byStream[stream.id]);
  const openFullscreen = useUi((s) => s.openFullscreen);

  const count = status?.bearCount ?? 0;
  const poster = posterUrl(youtubeId);
  const isApalooza = status?.bearapalooza ?? false;
  const isAlerting = status?.alerting ?? false;

  return (
    <div className={`tile${isApalooza ? ' tile--apalooza' : isAlerting ? ' tile--alert' : ''}`}>
      <div className="tile__media">
        {live ? (
          <StreamPlayer youtubeId={youtubeId} title={stream.title} explorePage={stream.explorePage} active />
        ) : (
          <button className="tile__facade" onClick={() => setLive(true)} aria-label={`Play ${stream.title}`}>
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
          <span className={`badge badge--count${count > 0 ? ' badge--count-on' : ''}`} title="Bears on screen">
            🐻 {count}
          </span>
        </div>
        <div className="tile__bottomline">
          <span className="tile__title">{stream.title}</span>
          <button className="iconbtn" title="Fullscreen" onClick={() => openFullscreen(stream.id)}>
            ⛶
          </button>
        </div>
      </div>
    </div>
  );
}
