import { useEffect } from 'react';
import { useUi } from '../state/ui';
import { getStream } from '../streams';

// The 12+ bear celebration. Full-width, unmissable, with a one-tap jump to the feed's
// fullscreen — the same deep link a background notification carries.
export function BearapaloozaBanner() {
  const bearapalooza = useUi((s) => s.bearapalooza);
  const openFullscreen = useUi((s) => s.openFullscreen);
  const setBearapalooza = useUi((s) => s.setBearapalooza);

  useEffect(() => {
    if (!bearapalooza) return;
    const t = setTimeout(() => setBearapalooza(null), 20000);
    return () => clearTimeout(t);
  }, [bearapalooza, setBearapalooza]);

  if (!bearapalooza) return null;
  const title = getStream(bearapalooza.streamId)?.title ?? bearapalooza.streamId;

  return (
    <div className="apalooza" role="alert">
      <span className="apalooza__emoji">🐻🎉</span>
      <span className="apalooza__text">
        <strong>BEARAPALOOZA!</strong> {bearapalooza.count} bears on {title}.
      </span>
      <button
        className="btn btn--light"
        onClick={() => {
          openFullscreen(bearapalooza.streamId);
          setBearapalooza(null);
        }}
      >
        Watch fullscreen →
      </button>
      <button className="iconbtn" onClick={() => setBearapalooza(null)} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
