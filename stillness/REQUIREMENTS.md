# REQUIREMENTS — Stillness

The strategy's archetype 4 exemplar (`MINIMALIST-APPS-STRATEGY.md`): a
minimalist utility that must feel *unmistakably crafted* while doing almost
nothing — that tension is the product. Free web PWA; $1 native app whose
whole pitch is the three things iOS Safari can't do reliably in a PWA.

## Functional

- **FR-1 Choose a length.** Presets (5/10/15/20 min) + a custom slider
  (1–90). One tap from launch to sitting.
- **FR-2 The sit.** A draining ring and mm:ss remaining. Pause/resume. An
  explicit End finishes early and counts the time actually sat. Back
  abandons (nothing recorded).
- **FR-3 The bell.** A synthesized bowl strike at zero (no audio assets).
  Foreground: WebAudio. Backgrounded/locked native app: a local notification
  scheduled at the projected end rings instead (cancelled on pause, early
  end, natural completion in foreground, or abandon).
- **FR-4 Keep-awake.** The screen stays on during a running sit (native);
  released on pause/done/leave.
- **FR-5 Stats, quietly.** Sits and day-streak via `@parlor/solo`
  `StatsStore` under injected storage. One line on Home; no charts, no
  goals, no guilt.
- **FR-6 Brand chrome.** `@parlor/brand` AppShell, theme with the sage
  accent, light/dark persisted (OS default), `MoreFromUs` panel.
- **FR-7 Native polish** (all no-ops on web): success haptic at the bell,
  share from the done state, OS review ask from the third sit on, status
  bar synced to color mode.

## Non-functional

- **NFR-1 Zero backend, enforced.** No firebase anywhere; `check-bundle.mjs`
  fails the build if it appears in dist. No accounts, no analytics, no
  network calls.
- **NFR-2 Offline-complete.** PWA precaches everything; cold offline start
  on any route works (SPA fallback).
- **NFR-3 Deterministic core.** The timer is a pure machine over an injected
  clock; a throttled tab or paused WebView can't drift it.
- **NFR-4 The wrap changes nothing on web.** All Capacitor access via
  `@parlor/native`'s bridge wrappers; the web bundle contains no Capacitor
  import.
- **NFR-5 Store-ready by construction.** `store/listing.ts` validates in CI
  (privacy = Data Not Collected); icons/splash from the brand template;
  Apple 4.2 checklist wired (launch screen, offline, native plugins, no
  login wall).

## Out of scope (v1)

- Ambient/background soundscapes — M2, and the reason the `BackgroundAudio`
  bridge contract exists; the native plugin choice is the M2 decision.
- Interval bells, guided anything, breathing animations, HealthKit/Google
  Fit, widgets, watch apps.
- Resuming a sit across an app kill (a sit is an intention, not a document).
