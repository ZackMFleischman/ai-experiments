# DECISIONS.md — hive/

Append-only. New entries at the bottom: date, decision, one-line why. ≤8 lines each.
Milestone SHIPPED entries follow the same format (date, gates run, deviations,
stumbles). Pre-build design decisions 1–17 live in DESIGN.md §9 — this log starts at
build time. Post-v1 ideas go here as one-liners tagged `post-v1`.

---

- **2026-07-02 — Documentation policy adopted** (IMPLEMENTATION.md §7): closed doc
  set with CI-enforced line budgets; this file is the only doc that grows; the
  implementation plan self-consumes as milestones ship (task tables collapse to
  SHIPPED entries here).

- **2026-07-02 — M0–M3 ship without any Firebase console setup** (authorized
  deviation): no cloud project exists yet, so T0.6 drops its ⚑ half — CI is GitHub
  Actions only (typecheck + unit layers + e2e); emulators run against `demo-hive`.
  Two tasks added: T3.11 hot-seat persistence (localStorage behind `GameTransport`;
  refresh resumes) and T3.12 static deploy of the hot-seat PWA (LocalTransport
  default, no firebase in bundle, minimal manifest — subset of T5.1) via Cloudflare
  Pages project `hive` (GitHub Pages fallback). Firebase Hosting/M4+ unaffected.

- **2026-07-03 — Production Firebase project `hive-zmf` registered** (DESIGN §5.6
  steps 1–3 done by Zack): web-app config committed as `VITE_FIREBASE_*` in
  `packages/app/.env` (public identifiers). `.firebaserc` gains a `prod` alias;
  `default` stays `demo-hive` so emulators/CI keep running fully offline —
  deploys use `--project prod`. VAPID key + deploy service account still pending.
