# Stillness

A quiet meditation timer: choose a length, sit, a bell ends the sit. No
accounts, no ads, no analytics, no network — free on the web, $1 in the
stores (strategy: repo-root `MINIMALIST-APPS-STRATEGY.md`, archetype 4).

The first **utility** title of the minimalist-apps brand, and the app that
exists to exercise `@parlor/native`'s utility trio: keep-awake while sitting,
a local notification as the backgrounded bell, and (M2) background audio.

- `packages/app` — React PWA over `@parlor/brand` + `@parlor/solo` stats +
  `@parlor/native`; the timer is a pure clock-injected machine.
- `e2e` — the visual gallery sweep (`pnpm validate:visual`).
- `native/` — committed Capacitor shells (iOS + Android).
- `store/` — the typed, test-validated store listing.

Docs: `CLAUDE.md` (rules), `REQUIREMENTS.md`, `DESIGN.md`,
`IMPLEMENTATION.md` (status), append-only `DECISIONS.md`.
