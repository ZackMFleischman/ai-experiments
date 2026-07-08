import { useState } from 'react';
import { FEATURES } from '../features';
import { useDetection } from '../state/detection';
import { effectiveYoutubeId, TILE_SIZES, useSettings } from '../state/settings';
import { useUi } from '../state/ui';
import { posterUrl, type StreamMeta } from '../streams';
import { StreamPlayer } from './StreamPlayer';

interface Props {
  stream: StreamMeta;
  /** True while any tile on the wall is being dragged (arms the drop layer). */
  dragging: boolean;
  /** This tile is the one currently being dragged. */
  isDragged: boolean;
  /** A drag is hovering over this tile (drop target highlight). */
  isOver: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

// A dashboard tile. By default (autoplayAll) it mounts a live player immediately — the
// whole point of the dashboard is a wall of feeds playing at once. When autoplay is off
// it falls back to a tap-to-play facade for constrained devices/data.
export function StreamTile({ stream, dragging, isDragged, isOver, onDragStart, onDragOver, onDrop, onDragEnd }: Props) {
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
  const bigger = () => {
    const next = TILE_SIZES[sizeIdx + 1];
    if (next) setTileSize(stream.id, next);
  };
  const smaller = () => {
    const next = TILE_SIZES[sizeIdx - 1];
    if (next) setTileSize(stream.id, next);
  };

  const stateClass = isApalooza ? ' tile--apalooza' : isAlerting ? ' tile--alert' : '';
  const dragClass = `${isDragged ? ' tile--dragging' : ''}${isOver ? ' tile--over' : ''}`;

  return (
    <div className={`tile tile--${size}${stateClass}${dragClass}`}>
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
          <span
            className="iconbtn iconbtn--sm tile__grip"
            role="button"
            tabIndex={0}
            draggable
            title="Drag to reorder"
            aria-label={`Reorder ${stream.title}`}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', stream.id);
              onDragStart();
            }}
            onDragEnd={onDragEnd}
          >
            ⠿
          </span>
          <span className="tile__title">{stream.title}</span>
          <button className="iconbtn iconbtn--sm" title="Fullscreen" aria-label={`Fullscreen ${stream.title}`} onClick={() => openFullscreen(stream.id)}>
            ⛶
          </button>
        </div>
      </div>

      {/* While a drag is in flight, an overlay above the iframe catches dragover/drop —
          iframes otherwise swallow drag events and no tile would register as a target. */}
      {dragging ? (
        <div
          className="tile__drop"
          onDragEnter={(e) => {
            e.preventDefault();
            onDragOver();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(e) => {
            e.preventDefault();
            onDrop();
          }}
        />
      ) : null}
    </div>
  );
}
