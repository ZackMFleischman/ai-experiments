# DECISIONS — katmai-bears/

Append-only. Newest first. Keep entries ≤8 lines.

## 2026-07-08 — Catalog is driven by the explore.org YouTube playlist (build-time refresh)
Seasonal id churn was manual (edit `streams.ts`). Now `pnpm refresh:streams` scrapes the
playlist's `ytInitialData` (no API key) and writes `streams.generated.ts` — the live source
of truth, in playlist order. Chose **build-time** over runtime: in-browser reads of a
playlist need a public API key (quota/abuse) or hit the same cross-origin wall as the pixels,
and we don't want the deploy to depend on YouTube. `streams.ts` merges: playlist entries are
authoritative, enriched by a small CURATED table (blurb/tags/explore link) via title-keyword
match; unmatched cams surface with derived metadata; empty generated file ⇒ old seed behavior.

## 2026-07-08 — Wall maximizes video area (gallery-fit), not just "fills the page"
First pass filled the viewport with a CSS `1fr` grid, but that made cells taller than 16:9
so the YouTube videos letterboxed — huge black bands, little actual video. Reworked to a
gallery-fit engine (`useWallLayout`): every tile is exactly 16:9 (video fills it), and we
search column counts, densely pack the s×s blocks to get row counts, and size the base unit
so the packed grid just fits W×H — the column count giving the largest tile wins (max video
pixels; provably optimal for equal tiles). Narrow screens (<700px) drop to a scrolling
1–2-col stack instead of shrinking to nothing. Per-tile size = SQUARE spans (sm/md/lg =
1/2/3) so enlarged tiles stay 16:9. Reorder is now pointer-based (setPointerCapture on the
⠿ grip + rect hit-test) — robust across iframes, which swallow HTML5 drag events. Wall chrome
is hover-revealed and the iframe uses `controls=0`, so app buttons never overlap YouTube's.
Order + sizes persist (localStorage); "Reset wall" clears them.

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
