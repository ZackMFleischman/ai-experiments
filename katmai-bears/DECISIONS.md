# DECISIONS — katmai-bears/

Append-only. Newest first. Keep entries ≤8 lines.

## 2026-07-08 — Single-threaded ffmpeg.wasm, no COOP/COEP
The Daily Reel stitches clips client-side. The multithreaded ffmpeg core needs
SharedArrayBuffer → cross-origin isolation → which breaks third-party YouTube iframes, and
`COEP: credentialless` is unsupported on Safari. Chose the single-threaded `@ffmpeg/core`
(self-hosted, wasm excluded from precache). Reel output standardized to mp4/H.264 so it
plays on iOS too.

## 2026-07-08 — Detection is a runtime seam, not a package
Requirement: frontend detector now, backend push later, no rewrite. Satisfied by a
`DetectionSource` interface + framework-free `src/contract/` (types + thresholds + pure
reducer). Did NOT create `packages/shared` yet — it only earns its keep once a second
deployable (the backend) imports it; until then it's just tsconfig/versioning friction. Lift
via `git mv` when the backend ships.

## 2026-07-08 — Simulator ships as the default detector
Cross-origin YouTube pixels can't be read in-browser, so real CV on the live feeds needs a
backend. Rather than ship viewing-only, wired a `SimulatorSource` (plausible bounded random
walk + occasional catches/surges) so the counter, alerts, Bearapalooza, clips, and reel are
all real and demoable today — clearly labeled "simulated" in the UI.

## 2026-07-08 — Stream ids are runtime-overridable
explore.org mints fresh YouTube ids every season. The catalog ships best-effort seeds, but
Settings → Stream IDs lets a user paste fresh ids (persisted to localStorage) so the app
stays usable across seasons with no code change. Cams with no id degrade to an explore.org
link.

## 2026-07-08 — Clips recorded from a synthetic canvas
Can't capture real YouTube pixels, so a fish-catch records a hidden `<canvas>`
(`captureStream` → codec-aware `MediaRecorder`) drawing a labeled recap card. Real,
downloadable video; synthetic imagery until a backend supplies true frames. Verified end to
end in headless Chromium via the e2e debug surface (`window.__katmai.ingest`).
