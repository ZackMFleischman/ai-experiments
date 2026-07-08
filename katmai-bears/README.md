# Katmai Bearcam Dashboard 🐻🎣

A React PWA that puts every [Katmai / Brooks Falls](https://explore.org/livecams/brown-bears)
live bear cam in one dashboard — tap any feed to go fullscreen, swipe to cycle between
them, watch a live **bear counter**, get **alerts** when a feed gets crowded, auto-save a
**clip** whenever a bear lands a salmon, stitch a **daily reel**, and celebrate a
**Bearapalooza** the instant 12+ bears crowd a single cam.

> **Status:** viewing + the full alert/clip/reel experience are live today, driven by a
> **simulated** detector. Real computer vision on the live feeds is deferred behind a clean
> seam (see *Detection* below) — because you fundamentally can't run it in the browser.

## Why the detection is simulated (the one hard constraint)

The cams are **YouTube-hosted live streams**. A cross-origin YouTube `<iframe>` won't let
the page read its pixels — `canvas.getImageData()` throws on the tainted canvas — so
**in-browser ML (TensorFlow.js) cannot see the live feeds.** This is a browser security
boundary, not something code can work around.

So the app is built in two halves that don't fight each other:

- **Viewing** is 100% real: YouTube embeds, fullscreen, swipe, PWA install.
- **Detection** (bear counts, fish catches) is produced by a swappable **`DetectionSource`**.
  Today that's a live *simulator* so every downstream feature is real and demoable. Real
  detection ultimately needs a **backend** that ingests the streams server-side and pushes
  `DetectionFrame` events over a WebSocket — a drop-in replacement that changes nothing
  downstream. See [`DESIGN.md`](./DESIGN.md).

## Features

| Feature | State |
| --- | --- |
| Video wall — every Katmai cam plays live at once | ✅ real |
| Per-stream show/hide; grid reflows to fill the space | ✅ real |
| One-tap fullscreen, swipe / arrow-key / prev-next cycling | ✅ real |
| Deep links (`/?stream=<id>&full=1`) | ✅ real |
| Installable PWA (offline app shell, service worker) | ✅ real |
| Live bear counter (per-feed chip + total + peak) | ✅ via simulator · flagged off in prod |
| Alert when a feed has **more than N** bears (N configurable) | ✅ via simulator · flagged off in prod |
| **Bearapalooza** banner + notification at **12+** bears, deep-linking to that feed | ✅ via simulator · flagged off in prod |
| Fish-catch **clips** saved to IndexedDB, browsable gallery | ✅ real pipeline · flagged off in prod |
| **Daily Reel** — play sequence + stitch to one downloadable mp4 (ffmpeg.wasm) | ✅ real · flagged off in prod |
| In-tab / installed notifications | ✅ real · flagged off in prod |
| True 24/7 background push (app closed) | ⏳ needs backend (seam wired) |
| Real CV bear/fish detection on live feeds | ⏳ needs backend (seam wired) |

Clips are recorded from a synthetic overlay canvas (title + animated boxes + "FISH CATCH!"),
since the real YouTube pixels are off-limits — real, downloadable video, synthetic imagery
until a backend supplies true frames.

**The detection features are behind a flag (`FEATURES.detection`) that is OFF in production**
— the deployed site is a clean video wall, because the counts are simulated. It's on in dev,
and you can force it anywhere by appending **`?detection=1`** to the URL (`?detection=0` to
force off). See `src/features.ts`.

## Develop

Standalone pnpm workspace (Node 22, pnpm 10). From `katmai-bears/`:

```
pnpm install
pnpm dev            # Vite dev server (packages/app)
pnpm build          # production build (generates icons + copies ffmpeg core)
pnpm typecheck      # tsc --noEmit across the workspace (the contract gate)
pnpm test           # vitest unit tests (contract reducer + simulator)
pnpm e2e            # Playwright smoke suite (builds + previews, then drives a browser)
pnpm validate:m0    # typecheck && test && e2e — the full gate
```

## Refreshing stream IDs each season

explore.org restarts the YouTube streams every summer, minting **new video ids**. The cam
*set* is stable; the ids are not. Three ways to keep it current, easiest first:

1. **Refresh from the playlist (recommended):** run

   ```
   pnpm refresh:streams                 # explore.org's Katmai live-cams playlist
   pnpm refresh:streams <playlistUrl>   # or a different playlist / bare list id
   ```

   from `katmai-bears/`. It scrapes the playlist page (no API key) and rewrites
   [`packages/app/src/streams.generated.ts`](./packages/app/src/streams.generated.ts) with
   the current ids + titles, **in playlist order**. That file is the live source of truth:
   [`streams.ts`](./packages/app/src/streams.ts) enriches each entry with the curated
   blurb / tags / explore.org link by matching titles, and any playlist cam with no curated
   match still shows up (title/blurb derived from the playlist). Commit the regenerated file.
   Must run somewhere with access to youtube.com (your machine or CI); the app + deploy build
   never touch YouTube.
2. **In-app (no code, one cam):** Settings → **Stream IDs** → paste a fresh YouTube video id.
   Saved to `localStorage`, overrides everything for that cam.
3. **In code (seed):** update a curated cam's `defaultYoutubeId` in
   [`packages/app/src/streams.ts`](./packages/app/src/streams.ts). These seeds are only used
   as a fallback until `refresh:streams` has been run (`streams.generated.ts` is empty).

Cams with no known id degrade gracefully to an "Open on explore.org ↗" link.

## Deploy

Wired to **Cloudflare Pages** via `.github/workflows/katmai-deploy.yml` (project
`katmai-bears`) — production deploys on merge to `main`, and each PR touching
`katmai-bears/` gets a preview URL commented on the PR. It reuses the repo's shared
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets and self-provisions the Pages
project; if those secrets are absent it builds and skips the deploy with a notice.

`pnpm build` emits a static `dist/` you can also host anywhere. The production build injects
a CSP that intentionally does **not** enable cross-origin isolation, so YouTube embeds keep
working; the ffmpeg reel uses the single-threaded core (fetched from jsDelivr) precisely so
it needs no isolation.

## Layout

```
packages/app/        the PWA
  src/contract/      framework-free detection contract (types, thresholds, pure reducer)
  src/detection/     sources: simulator (default), webSocket (backend seam), frontend-cv (optional)
  src/clips/         canvas recorder, IndexedDB store, ffmpeg reel stitcher
  src/notifications/ in-tab + push seam
  src/components/    dashboard, tile, player, fullscreen, banner, alerts, settings, clips
e2e/                 Playwright smoke suite
```

See [`DESIGN.md`](./DESIGN.md) for the architecture and the backend migration path, and
[`DECISIONS.md`](./DECISIONS.md) for why things are the way they are.
