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
| Dashboard of all Katmai cams (facade tiles → tap to play) | ✅ real |
| One-tap fullscreen, swipe / arrow-key / prev-next cycling | ✅ real |
| Deep links (`/?stream=<id>&full=1`) | ✅ real |
| Installable PWA (offline app shell, service worker) | ✅ real |
| Live bear counter (per-feed chip + total + peak) | ✅ via simulator |
| Alert when a feed has **more than N** bears (N configurable) | ✅ via simulator |
| **Bearapalooza** banner + notification at **12+** bears, deep-linking to that feed | ✅ via simulator |
| Fish-catch **clips** saved to IndexedDB, browsable gallery | ✅ real recording pipeline |
| **Daily Reel** — play sequence + stitch to one downloadable mp4 (ffmpeg.wasm) | ✅ real |
| In-tab / installed notifications | ✅ real |
| True 24/7 background push (app closed) | ⏳ needs backend (seam wired) |
| Real CV bear/fish detection on live feeds | ⏳ needs backend (seam wired) |

Clips are recorded from a synthetic overlay canvas (title + animated boxes + "FISH CATCH!"),
since the real YouTube pixels are off-limits — real, downloadable video, synthetic imagery
until a backend supplies true frames.

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
*set* is stable; the ids are not. Two ways to keep it current:

1. **In-app (no code):** Settings → **Stream IDs** → paste a fresh YouTube video id. Saved
   to `localStorage`, overrides the built-in seed. This is the recommended path.
2. **In code:** update `defaultYoutubeId` in
   [`packages/app/src/streams.ts`](./packages/app/src/streams.ts) and bump `SEASON`.

Cams with no known id degrade gracefully to an "Open on explore.org ↗" link.

## Deploy

`pnpm build` emits a static `dist/` — host it anywhere (Cloudflare Pages, Netlify, etc.).
No deploy workflow is wired here (it would need host secrets). The production build injects
a CSP that intentionally does **not** enable cross-origin isolation, so YouTube embeds keep
working; the ffmpeg reel uses the single-threaded core precisely so it needs no isolation.

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
