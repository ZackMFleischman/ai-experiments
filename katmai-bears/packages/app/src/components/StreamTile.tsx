import { useState } from 'react';
import { FEATURES } from '../features';
import { useDetection } from '../state/detection';
import { effectiveYoutubeId, TILE_SIZES, useSettings } from '../state/settings';
import { useUi } from '../state/ui';
import { posterUrl, type StreamMeta } from '../streams';
import { StreamPlayer } from './StreamPlayer';

interface Props {
  stream: StreamMeta;
  /** Side length (in base cells) this tile spans on the wall. */
  span: number;
  registerRef: (id: string, el: HTMLElement | null) => void;
  isDragged: boolean;
  isOver: boolean;
  onGripDown: () => void;
  onGripMove: (x: number, y: number) => void;
  onGripUp: () => void;
}

// A wall tile. The tile itself is exactly 16:9 (sized by the wall layout) so the live video
// fills it edge-to-edge with no letterboxing. All chrome (badges, resize, hide, drag, and
// fullscreen) lives in hover-reveal overlays that sit above the iframe, so an idle wall is
// pure video and the controls never fight the YouTube player's own chrome.
export function StreamTile({ stream, span, registerRef, isDragged, isOver, onGripDown, onGripMove, onGripUp }: Props) {
  const autoplayAll = useSettings((s) => s.autoplayAll);
  const [tapped, setTapped] = useState(false);
  const showPlayer = autoplayAll || tapped;
  // Subscribe to overrides so the resolved id updates when the user edits Settings.
  const overrides = useSettings((s) => s.streamOverrides);
  const youtubeId = overrides[stream.id] ?? effectiveYoutubeId(stream.id, stream.defaultYoutubeId);
  const status = useDetection((s) => s.state.byStream[stream.id]);
  const openFullscreen = useUi((s) => s.openFullscreen);
  const setStreamHidden = useSettings((s) => s.setStreamHidden);
  const size = useSettings((s) => s.tileSizes[stream.id] ?? 'sm');
  const setTileSize = useSettings((s) => s.setTileSize);

  const count = status?.bearCount ?? 0;
  const poster = posterUrl(youtubeId);
  const isApalooza = status?.bearapalooza ?? false;
  const isAlerting = status?.alerting ?? false;

  const sizeIdx = TILE_SIZES.indexOf(size);
  const bigger = (): void => {
    const next = TILE_SIZES[sizeIdx + 1];
    if (next) setTileSize(stream.id, next);
  };
  const smaller = (): void => {
    const next = TILE_SIZES[sizeIdx - 1];
    if (next) setTileSize(stream.id, next);
  };

  const stateClass = isApalooza ? ' tile--apalooza' : isAlerting ? ' tile--alert' : '';
  const dragClass = `${isDragged ? ' tile--dragging' : ''}${isOver ? ' tile--over' : ''}`;

  return (
    <div
      ref={(el) => registerRef(stream.id, el)}
      className={`tile${stateClass}${dragClass}`}
      style={{ gridColumn: `span ${span}`, gridRow: `span ${span}` }}
    >
      <div
        className="tile__media"
        style={poster ? { backgroundImage: `url(${poster})` } : undefined}
      >
        {showPlayer ? (
          <StreamPlayer youtubeId={youtubeId} title={stream.title} explorePage={stream.explorePage} active minimalChrome />
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
              title="Make smaller"
              aria-label={`Make ${stream.title} smaller`}
              onClick={smaller}
              disabled={sizeIdx <= 0}
            >
              −
            </button>
            <button
              className="iconbtn iconbtn--sm"
              title="Make bigger"
              aria-label={`Make ${stream.title} bigger`}
              onClick={bigger}
              disabled={sizeIdx >= TILE_SIZES.length - 1}
            >
              ＋
            </button>
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
          <button
            className="iconbtn iconbtn--sm tile__grip"
            title="Drag to reorder"
            aria-label={`Reorder ${stream.title}`}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              onGripDown();
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) onGripMove(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
              onGripUp();
            }}
            onPointerCancel={onGripUp}
          >
            ⠿
          </button>
          <span className="tile__title">{stream.title}</span>
          <button
            className="iconbtn iconbtn--sm"
            title="Fullscreen"
            aria-label={`Fullscreen ${stream.title}`}
            onClick={() => openFullscreen(stream.id)}
          >
            ⛶
          </button>
        </div>
      </div>
    </div>
  );
}
