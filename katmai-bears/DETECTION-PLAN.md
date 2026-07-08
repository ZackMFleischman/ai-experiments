# DETECTION-PLAN — real bear counts, per stream

How we go from **simulated** counts to **real, trustworthy** per-stream bear counts on the
live Katmai cams — shipped as a sequence of milestones, each independently valuable and
independently mergeable. Read [`DESIGN.md`](./DESIGN.md) first: this plan builds on the
detection seam it describes and never violates it.

## The one constraint that shapes everything

The dashboard shows each cam as a **cross-origin YouTube iframe**. The browser refuses to
expose those pixels — `drawImage(iframe)` taints the canvas — so real CV *cannot* run
in-browser on the live feeds. (`FrontendCvSource` is webcam-only for exactly this reason.)
Real counts therefore require a **server** that ingests each stream, detects bears, and
pushes `DetectionFrame` JSON to the client over the WebSocket that `WebSocketSource` already
speaks. No frontend rewrite — the seam was built for this.

Three problems hide inside "count the bears," and the milestones attack them in order:

1. **Plumbing** — get readable pixels to a detector and frames back to the client.
2. **Model** — turn pixels into accurate boxes (the accuracy axis).
3. **Counting semantics** — turn flickering per-frame boxes into a stable, meaningful number.

## Guardrails (true for every milestone)

- **The contract is the wire format.** The backend emits JSON matching `DetectionFrame`
  (`src/contract/types.ts`) exactly. No field is added client-side to make a milestone work;
  if the schema must grow, it grows in `src/contract/` first, with a reducer test.
- **Detection stays behind `DetectionSource`.** Every improvement lands as a new/better
  *source* or a better *backend*, never as downstream coupling.
- **Never enable COOP/COEP.** Unchanged. The backend is a separate origin; the client only
  opens a WebSocket to it (`connect-src` gets one `wss://` entry).
- **`FEATURES.detection` gating is honest.** Simulated data stays off in production. Real
  data from a deployed backend is what flips detection on in prod — see M3.

---

## M1 — End-to-end spike: one real stream, real bears, locally

**Goal:** prove the entire pipeline on the flagship cam, on your machine, with no deploy.

**Ship:**
- A new `detector/` service (Python — `ultralytics`, `yt-dlp`, `ffmpeg` all live there).
  Resolves **Brooks Falls** only: `yt-dlp` → HLS manifest → `ffmpeg` samples ~1 fps.
- Off-the-shelf detector (YOLOv11, COCO `bear`/`fish` classes). Per frame, emit
  `{ streamId, ts, bearCount, boxes }` matching the contract, over a local WebSocket.
- Point the existing `WebSocketSource` at `ws://localhost:…` via Settings → Backend
  WebSocket. Nothing else in the app changes.
- **Lift `src/contract/` → `packages/shared`** via `git mv`. This is the trigger DESIGN
  names: a second deployable now consumes the schema. Publish a JSON Schema (or codegen from
  the TS types) as the backend's source of truth so the two halves can't drift.

**Good on its own:** the "it actually works" moment — real bears on the real flagship cam,
counted live, end to end. Everything after this is robustness, coverage, and accuracy.

**Explicitly deferred:** other cams, jitter smoothing, deploy, background alerts, accuracy
tuning. COCO on a wide riverscape will miss distant/occluded bears — that's expected here and
fixed in M4.

**Done when:** with the detector running locally, the dashboard's Brooks Falls tile shows a
count that tracks reality within a bear or two, and the fish-catch clip fires on a real catch.

---

## M2 — All cams, stable counts, resilient

**Goal:** every cam covered, and a number you'd actually trust glance-to-glance.

**Ship:**
- **All streams** ingested concurrently (one worker per cam; bounded CPU via frame-rate and
  resolution caps).
- **Temporal smoothing** — the under-appreciated axis. Raw per-frame counts flicker as bears
  wade in/out and occlude. Add a rolling-median / debounce stage so the emitted `bearCount`
  is stable. Decide and document the semantic: **instantaneous smoothed count** vs **peak over
  a rolling window**. Put the smoother where it's unit-testable — a pure function in
  `packages/shared` so both a future in-process client and the backend share it, and the
  existing reducer keeps consuming clean frames.
- **Seasonal-ID resilience.** IDs rotate each season; the backend reads the *same* override
  the frontend uses (surface the runtime ID set to the detector via a small config endpoint
  or shared store) so refreshing an ID in Settings re-points ingest with no redeploy.
- **Fault tolerance.** A cam whose `yt-dlp` resolve fails degrades to "no data" (not a crash);
  workers auto-restart with backoff; a `/health` endpoint reports per-cam liveness.

**Good on its own:** a genuinely useful multi-cam live counter — the product's core promise,
minus 24/7 background delivery.

**Note on cross-cam totals:** Brooks Falls high/low overlap physically, so `total` across
streams can double-count one bear. Decide here: accept the overcount (simplest, honest if
labeled "bears on camera") or add camera-overlap reconciliation (defer to M5). Document the
choice in `DECISIONS.md`.

---

## M3 — Always-on deploy + real background alerts

**Goal:** the headline feature — bear alerts that fire when the app is closed — becomes real.

**Ship:**
- Containerize `detector/`; deploy to an **always-on** host (a small VPS / container service —
  Cloudflare Pages can't run it; it's a stateful long-lived process). Expose `wss://`.
- Flip production: point `WebSocketSource` at the deployed backend and enable detection in
  prod **against real data** (the honest version of `FEATURES.detection`). The site stops
  being viewing-only.
- **Real push.** `src/sw.ts` already wires `push` + `notificationclick`; stand up the VAPID
  sender in the backend so Bearapalooza/threshold alerts deliver to installed PWAs with the
  tab closed — the "24/7 background alerts need the server" boundary DESIGN calls out.

**Good on its own:** the app now does the thing it always advertised — you get pinged when the
falls get busy, phone in your pocket. This is the milestone that changes the deployed product.

**Cost reality:** this is the first milestone with a standing bill (always-on compute + GPU or
CPU-inference budget). Sizing and the CPU-vs-GPU call get decided here, informed by M2's
measured per-frame cost.

---

## M4 — Accuracy: a fine-tuned Katmai model

**Goal:** counts go from "respectable" to "trustworthy," with zero downstream change.

**Ship:**
- Use the running M2/M3 sampler to **harvest frames** (it's already decoding them). Label a
  few hundred per cam — the cameras are *fixed*, so angle/lighting are consistent and a small
  set goes a long way. Crowdsource or hand-label.
- **Fine-tune** YOLO on Katmai bears and swap the weights behind the identical detector
  interface. Optionally an open-vocab model (Grounding DINO / OWL-ViT, prompt "brown bear") as
  an interim step if labeling lags.
- Track a simple accuracy metric against a held-out labeled set so "better" is measured, not
  vibes.

**Good on its own:** same app, same pipeline, materially better numbers — distant and
partially-occluded bears that COCO dropped now get counted, false positives on rocks/logs drop.

---

## M5 (stretch) — Unique-bear counting & cross-cam dedup

**Goal:** answer "how many *distinct* bears," not just "how many on screen now."

**Ship (research-grade, clearly optional):**
- Re-identification from fur/scars/size to count unique individuals over a window (the
  "Fat Bear Week" identity problem — genuinely hard).
- Cross-cam overlap reconciliation so a bear seen on Brooks high *and* low counts once in the
  grand total.

**Good on its own:** a headline number ("14 unique bears today") that no per-frame counter can
produce. Explicitly out of scope for a trustworthy v1; listed so the earlier milestones don't
accidentally over-promise it.

---

## Sequencing rationale

- **M1 is the cheap spike first** — one cam, local, no infra — so the riskiest unknowns
  (`yt-dlp` reliability, real per-frame cost, schema-across-a-network) are proven before any
  money or deploy is committed.
- **M2 before M3** — get counts *trustworthy* on your machine before paying to run them 24/7;
  M2's measurements size M3's box.
- **M3 before M4** — a running sampler is what *produces the training frames* for M4, so
  deploying first makes the accuracy work cheaper.
- **M5 last** — it's a different (research) problem; nothing below it depends on it.

Each milestone leaves the app strictly better and fully working. Stopping after any one of
M1–M4 yields a coherent product; only M5 is optional polish.
