# HIVE

A digital, two-player PWA version of the board game Hive (with the Mosquito, Ladybug,
and Pillbug expansions) — playable over the internet, synchronously or asynchronously,
like chess dailies.

Status: **ready to build**. Start with [DESIGN.md](./DESIGN.md) (what & why), then
[IMPLEMENTATION.md](./IMPLEMENTATION.md) — the task-by-task builder playbook with
per-milestone validation gates.

Planned stack: pure-TypeScript rules engine · React + MUI + Vite PWA · Firebase
(Auth / Firestore / Cloud Functions / FCM). Independent pnpm workspace.

Pinned majors: TypeScript 5 · React 18 · MUI 5 · Vite 5 · react-router 6 ·
Vitest 3 · fast-check 3 · Playwright 1 · firebase-functions 6 · firebase-admin 13 ·
firebase-tools 14 · vite-plugin-pwa 0.21.
