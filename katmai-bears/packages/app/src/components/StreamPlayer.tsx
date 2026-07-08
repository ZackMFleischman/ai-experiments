interface Props {
  youtubeId: string | undefined;
  title: string;
  explorePage: string;
  /** When false, the iframe is not mounted (facade). Fullscreen always passes true. */
  active: boolean;
}

// A plain YouTube embed (NOT the IFrame API) — lighter for a grid of tiles, and the
// facade means only the tapped/focused tiles ever mount a player. Muted + playsinline
// keeps autoplay within browser policy and stops iOS from hijacking to fullscreen.
export function StreamPlayer({ youtubeId, title, explorePage, active }: Props) {
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

  const src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1`;
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
