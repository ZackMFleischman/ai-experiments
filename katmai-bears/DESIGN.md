# DESIGN — Katmai Bearcam Dashboard

## The load-bearing seam

Everything downstream of detection — the counter, alerts, Bearapalooza, clips, and reel —
consumes ONE typed event stream, no matter who produces it:

```
DetectionSource ──emits──▶ DetectionFrame ──▶ detectionStore (pure reducer)
   (swappable)                                   │
                                                 ├─▶ BearCounter (total / peak / per-feed chip)
   implementations:                              ├─▶ alert  (bearCount > N)
   • SimulatorSource   (default; plausible fake) ├─▶ bearapalooza (bearCount >= 12)
   • WebSocketSource   (backend seam, same JSON) ├─▶ ClipManager (fish-catch → webm/mp4)
   • FrontendCvSource  (optional COCO-SSD demo)  └─▶ NotificationDispatcher
```

- **`DetectionSource`** (`src/contract/types.ts`): `subscribe(cb) => unsubscribe`, plus
  `start()`/`stop()`. The app depends only on this interface.
- **`DetectionFrame`** = `{ streamId, ts, bearCount, boxes?, fishCatch? }`. This JSON *is*
  the wire format the future backend emits — nothing else needs to change.
- **`reduceFrame`** (`src/contract/reducer.ts`) is pure: `(state, frame, thresholds) →
  { state, events }`. It derives per-stream + total counts, `peakTotal`, and fires domain
  events on threshold crossings (once per crossing, not per frame). Unit-tested; identical
  on client or server.

The whole `src/contract/` folder is framework-free (no React, no DOM) so it lifts into a
`packages/shared` package via `git mv` the day the backend ships. Not before — a shared
workspace package only earns its keep once a second deployable imports it.

## The frontend-now → backend-later migration

The user's requirement was: start with a frontend detector, migrate to a global backend
detector that pushes to the frontend, **without a rewrite**. This is satisfied by the
runtime seam, not a package boundary:

1. **Today:** `createActiveSource()` returns `SimulatorSource`.
2. **Optional demo:** `FrontendCvSource` runs real COCO-SSD (has a native "bear" class) on
   a CORS-enabled `<video>` (a webcam) — proving the pipeline end to end on a source you
   control. TF.js is lazy-loaded; it never touches the base bundle.
3. **Production:** stand up a backend that ingests each stream server-side (e.g.
   `yt-dlp` → frames → a detector), and emit `DetectionFrame` JSON over a WebSocket.
   Point Settings → *Backend WebSocket* at it. `WebSocketSource` already speaks the schema.

## Technical constraints (why the odd choices)

- **No cross-origin isolation (no COOP/COEP).** The Daily Reel stitches clips with
  `ffmpeg.wasm`. The *multithreaded* core needs `SharedArrayBuffer`, which needs COOP+COEP,
  which **breaks third-party YouTube iframes** (and `COEP: credentialless` is unsupported on
  Safari). So we use the **single-threaded** `@ffmpeg/core`, self-hosted under
  `public/ffmpeg/` (copied by `scripts/copy-ffmpeg.mjs`), loaded on demand. The ~32 MB wasm
  is deliberately excluded from the SW precache.
- **Codec-aware recording.** `MediaRecorder` on Safari produces **mp4/H.264 only** (never
  webm), so the recorder negotiates `video/webm;vp9 → vp8 → video/mp4` at runtime, and the
  reel normalizes everything to **mp4/H.264** so it plays everywhere.
- **Clip source.** Cross-origin YouTube pixels are unreadable, so clips are recorded from a
  hidden `<canvas>` (`captureStream` → `MediaRecorder`) drawing a labeled recap card.
- **Facade tiles.** A grid of 7 live YouTube players is heavy, so tiles are poster facades
  (`i.ytimg.com/vi/<id>/hqdefault.jpg`) that mount a plain `youtube.com/embed/…` iframe only
  on tap. The heavier IFrame API is avoided.

## Notifications & background

In-tab / installed notifications work today. `src/sw.ts` also wires `push` +
`notificationclick` (deep-linking to `/?stream=<id>&full=1`), so a VAPID backend drops in for
true closed-app delivery later. Real 24/7 background alerts land with the backend detector —
both need the server — which is the honest boundary of a client-only v1.

## State

Zustand stores: `state/detection` (reduced detection state), `state/ui` (fullscreen, panels,
alert feed, Bearapalooza banner), `state/settings` (persisted thresholds, per-stream id
overrides, notifications toggle, source selection), `clips/store` (IndexedDB-backed clips).
A module-level `eventBus` carries domain events so firing one never forces a re-render.
