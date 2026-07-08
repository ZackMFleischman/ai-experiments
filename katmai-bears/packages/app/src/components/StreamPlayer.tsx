interface Props {
  youtubeId: string | undefined;
  title: string;
  explorePage: string;
  /** When false, the iframe is not mounted (facade). Fullscreen always passes true. */
  active: boolean;
  /** Hide the YouTube player controls — used on the wall so our overlay owns the chrome
      and nothing overlaps the native buttons. Fullscreen leaves them on for scrubbing. */
  minimalChrome?: boolean;
  /** Play with sound. Defaults to muted; unmuting reloads the embed with mute=0, which is
      allowed because the toggle is a user gesture. Only one cam is ever unmuted at a time. */
  muted?: boolean;
}

// A plain YouTube embed (NOT the IFrame API) — lighter for a grid of tiles, and the
// facade means only the tapped/focused tiles ever mount a player. Muted + playsinline
// keeps autoplay within browser policy and stops iOS from hijacking to fullscreen.
export function StreamPlayer({ youtubeId, title, explorePage, active, minimalChrome = false, muted = true }: Props) {
  if (!youtubeId) {
    return (
      <div className="player player--fallback">
        <div className="player__fallback-inner">
          <p>No live stream id on file for this cam.</p>
          <p className="muted">IDs rotate each season — add one in Settings, or:</p>
          <a className="btn" href={explorePage} target="_blank" rel="noreferrer">
            Open on explore.org ↗
          </a>
        </div>
      </div>
    );
  }
  if (!active) return null;

  const params = new URLSearchParams({ autoplay: '1', mute: muted ? '1' : '0', playsinline: '1', rel: '0', modestbranding: '1' });
  if (minimalChrome) {
    params.set('controls', '0');
    params.set('disablekb', '1');
  }
  const src = `https://www.youtube.com/embed/${youtubeId}?${params.toString()}`;
  return (
    <iframe
      className="player__iframe"
      src={src}
      title={title}
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
    />
  );
}
