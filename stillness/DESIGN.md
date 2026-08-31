# DESIGN — Stillness

How the smallest brand app is built. Read with `REQUIREMENTS.md`; the
platform pieces it leans on are documented at their sources
(`parlor/README.md`, `GAME-SETUP.md` §12).

## Shape

The standard shape at its smallest: an engine package, the app package, and
the e2e visual workspace. `@stillness/engine` is 60 lines of pure timer
arithmetic — small, but a real engine: it gets the same purity boundary,
zero-dep package, and property gate (`validate:m1`) as every other title, so
the portfolio has one convention instead of a "too small to count" exception.

```
stillness/
├── packages/engine     # @stillness/engine — the pure timer machine + property gate
├── packages/app        # @stillness/app — the PWA
│   ├── src/App.tsx     # providers: stats + storage context, brand theme,
│   │                   #   color mode, status-bar sync
│   ├── src/screens/    # Home (choose), Sit (ring/pause/done)
│   ├── src/timer/      # bell.ts (WebAudio synth — I/O, so app-side)
│   └── src/dev/        # gallery registry + route (DEV-only)
├── e2e                 # stillness-e2e — validate:visual over the registry
├── native/{ios,android}# committed Capacitor shells (factory config)
├── store/listing.ts    # typed StoreListing, test-validated
└── scripts/            # check-docs, check-bundle
```

## The timer (packages/engine)

A `SitTimer` is `{durationMs, startedAt, pausedAt, pausedTotalMs}` — three
timestamps and a target. Remaining time is `duration − (now − started −
pausedTotal)` with `now` injected at every call site. Consequences:

- No interval owns the truth. The UI's 250 ms tick only refreshes `now`;
  browsers throttling background tabs (or a WebView pausing JS entirely)
  cannot drift the clock, because the next tick recomputes from wall time.
- Pause is one timestamp; resume banks the paused span. Both are idempotent
  on the wrong phase (StrictMode-safe).
- "End now" is `durationMs = 0` — done falls out of the same arithmetic, and
  `elapsedMs` still reports the time actually sat (that's what gets
  recorded; FR-2).
- `formatRemaining` ceils, so a fresh sit shows its full time and 0:00 only
  at true zero.

## The bell (src/timer/bell.ts)

Three sine partials (432 Hz fundamental, a slightly-sharp octave, a high
shimmer) with exponential decay — a struck bowl, ~zero bytes. Never throws:
no AudioContext (jsdom) or no user-gesture unlock just means silence. The
*backgrounded* bell is not audio at all: Sit schedules a local notification
at the projected end **+1 s**, so a foreground finish (which cancels it)
wins the race and only a locked phone hears the system chime. Pause cancels
and resume reschedules; the id is fixed so a reschedule replaces, never
stacks.

## Native lifecycle (src/screens/Sit.tsx)

One effect keyed on the running phase owns keep-awake + the parked
notification; its cleanup releases both. Completion is a separate
run-once effect: bell, success haptic, record, review-from-third-sit.
Everything goes through `@parlor/native` wrappers, so the web build renders
the identical UI with every native call a resolved no-op (NFR-4). The
gallery's paused/done fixtures use Sit's `fixture` prop — those are interior
states unreachable through props otherwise; the prop does nothing in
production routes.

## Stats

`@parlor/solo` `StatsStore` (`stillness:stats`) over injected storage —
sits recorded as wins in bucket `'sit'` with the elapsed duration; Home
shows `played` and the day streak. Same storage-injection seam as sudoku,
so tests and gallery fixtures run on Maps.

## Gallery / visual gate

Registry entries: home, home-streak, sit-running, sit-paused, sit-done ×
3 viewports × 2 themes (30 captures). The machine checks assert a
well-formed m:ss face inside the viewport and console cleanliness — not
pixel equality, because the running face ticks live.

## Store wrap

Everything per `GAME-SETUP.md` §12: factory `capacitor.config.ts`
(`com.zmfapps.stillness`, paper `#f5f3ee`), committed shells, brand-template
icons (ring-and-dot mark, sage field), `store/listing.ts` validated against
the config in unit tests. Plugins: the brand floor (haptics, share,
status-bar, splash-screen) + the utility trio's shipping half
(local-notifications, keep-awake) + in-app-review. `BackgroundAudio` stays a
bridge contract until M2 picks the plugin.
