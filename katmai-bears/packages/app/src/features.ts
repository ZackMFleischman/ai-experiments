// Feature flags.
//
// `detection` gates the whole simulated bear-detection experience — the counter,
// per-tile count chips, alerts, Bearapalooza, clips/reel, and notifications. It's the
// *plumbing* for a feature whose data is currently faked (real CV needs a backend), so
// we keep it OFF in production and ship the deployed site as a clean video wall.
//
// Resolution order:
//   1. `?detection=1` / `?detection=0` in the URL — a runtime override for demos/e2e.
//   2. Build flag `VITE_DETECTION=1` — force it on for a specific build.
//   3. Default: on in dev, off in prod.
function resolveDetection(): boolean {
  if (typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search).get('detection');
    if (q === '1') return true;
    if (q === '0') return false;
  }
  if (import.meta.env.VITE_DETECTION === '1') return true;
  return import.meta.env.DEV;
}

export const FEATURES = {
  detection: resolveDetection(),
} as const;
