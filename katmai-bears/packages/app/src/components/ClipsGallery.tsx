import { useState } from 'react';
import { clipsForToday, stitchClipsToMp4 } from '../clips/reel';
import { useClips, type ClipView } from '../clips/store';
import { useUi } from '../state/ui';

interface Playing {
  list: ClipView[];
  index: number;
}

interface StitchState {
  running: boolean;
  progress: number;
  url?: string;
  error?: string;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ClipsGallery() {
  const setPanel = useUi((s) => s.setPanel);
  const clips = useClips((s) => s.clips);
  const remove = useClips((s) => s.remove);
  const clearAll = useClips((s) => s.clearAll);

  const [playing, setPlaying] = useState<Playing | null>(null);
  const [stitch, setStitch] = useState<StitchState>({ running: false, progress: 0 });

  const today = clipsForToday(clips);

  const runStitch = async () => {
    if (today.length === 0 || stitch.running) return;
    setStitch({ running: true, progress: 0 });
    try {
      const blob = await stitchClipsToMp4(today, (p) => setStitch((s) => ({ ...s, progress: p })));
      setStitch({ running: false, progress: 1, url: URL.createObjectURL(blob) });
    } catch (err) {
      setStitch({ running: false, progress: 0, error: err instanceof Error ? err.message : 'stitch failed' });
    }
  };

  const advance = () => {
    setPlaying((p) => {
      if (!p) return null;
      const next = p.index + 1;
      return next < p.list.length ? { list: p.list, index: next } : null;
    });
  };

  const current = playing ? playing.list[playing.index] : undefined;

  return (
    <aside className="drawer">
      <div className="drawer__head">
        <h2>Clips & Daily Reel</h2>
        <button className="iconbtn" onClick={() => setPanel('none')} aria-label="Close">
          ✕
        </button>
      </div>

      <section className="drawer__section">
        <h3>Daily Reel — {today.length} catch{today.length === 1 ? '' : 'es'} today</h3>
        <p className="muted small">Auto-saved when a bear lands a salmon. Stitched into one mp4, playable everywhere.</p>
        <div className="reel__controls">
          <button className="btn" disabled={today.length === 0} onClick={() => setPlaying({ list: today, index: 0 })}>
            ▶ Play reel
          </button>
          <button className="btn" disabled={today.length === 0 || stitch.running} onClick={() => void runStitch()}>
            {stitch.running ? `Stitching… ${Math.round(stitch.progress * 100)}%` : '⬇ Stitch & download mp4'}
          </button>
        </div>
        {stitch.url ? (
          <a className="btn btn--light" href={stitch.url} download="katmai-daily-reel.mp4">
            Save katmai-daily-reel.mp4
          </a>
        ) : null}
        {stitch.error ? <p className="error small">Stitch failed ({stitch.error}). You can still play the reel above.</p> : null}
      </section>

      <section className="drawer__section">
        <div className="drawer__section-head">
          <h3>All clips ({clips.length})</h3>
          {clips.length > 0 ? (
            <button className="btn btn--sm btn--ghost" onClick={() => void clearAll()}>
              Clear all
            </button>
          ) : null}
        </div>
        {clips.length === 0 ? (
          <p className="muted">No catches recorded yet. They'll appear here automatically.</p>
        ) : (
          <div className="clips">
            {clips.map((c) => (
              <div className="clip" key={c.id}>
                <button className="clip__thumb" onClick={() => setPlaying({ list: [c], index: 0 })}>
                  <img src={c.thumbnail} alt="" />
                  <span className="clip__play">▶</span>
                </button>
                <div className="clip__meta">
                  <span className="clip__title">{c.streamTitle}</span>
                  <span className="muted small">{fmtTime(c.ts)}</span>
                </div>
                <div className="clip__actions">
                  <a className="iconbtn iconbtn--sm" href={c.url} download={`catch-${c.id}.webm`} title="Download">
                    ⬇
                  </a>
                  <button className="iconbtn iconbtn--sm" onClick={() => void remove(c.id)} title="Delete">
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {current ? (
        <div className="clipmodal" onClick={() => setPlaying(null)}>
          <div className="clipmodal__inner" onClick={(e) => e.stopPropagation()}>
            <video src={current.url} autoPlay controls onEnded={advance} />
            <div className="clipmodal__bar">
              <span>
                {current.streamTitle} · {fmtTime(current.ts)}
                {playing && playing.list.length > 1 ? ` · ${playing.index + 1}/${playing.list.length}` : ''}
              </span>
              <button className="iconbtn" onClick={() => setPlaying(null)} aria-label="Close">
                ✕
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
