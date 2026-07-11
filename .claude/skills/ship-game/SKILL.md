---
name: ship-game
description: >-
  Walk a built app through deploy + store wiring for this portfolio. Use when
  asked to "ship / deploy / release" a game, wire its Cloudflare Pages or
  Firebase deploy, fix callables returning "internal"/403, enable the billing
  API, or produce the store-submission checklist. Turns GAME-SETUP §10–§12 deploy
  tribal knowledge into an executable runbook and emits the ⚑ owner checklist.
---

# ship-game — deploy + store wiring

Reference: `GAME-SETUP.md` §10 (deploy), §11 (owner steps), §12 (native track).
The deploy workflows already exist (stamped by the factory); this skill is the
runbook for making them green and for the owner-only store steps.

## 1. Cloudflare Pages (every app — the free static PWA)

`<name>-deploy.yml`'s Pages job builds the firebase-free bundle and runs
`scripts/check-bundle.mjs` (asserts no firebase in the bundle). It
self-provisions with `wrangler pages project create <name> --production-branch
main || true`. Needs repo secrets/vars `CLOUDFLARE_API_TOKEN` +
`CLOUDFLARE_ACCOUNT_ID` (the job no-ops with a notice when absent). PR pushes
post a sticky preview-URL comment.

## 2. Firebase deploy (duo games only) — the load-bearing gotchas

Lift these verbatim; each was learned the hard way (GAME-SETUP §10.2):

- **Auth**: a service-account JSON secret written to
  `GOOGLE_APPLICATION_CREDENTIALS` (`login:ci` tokens are deprecated). The
  deploy SA needs **Editor + `roles/run.admin`**.
- **Billing API first**: `gcloud services enable cloudbilling.googleapis.com`
  — the CLI queries it for v2 functions but never auto-enables it.
- **Pack the functions lean**: `npm pkg delete devDependencies` in the packed
  functions dir before `firebase deploy`.
- **Invoker-IAM repair, idempotent every deploy** (the fix for callables that
  return "internal"/403 at Cloud Run): for each PUBLIC callable,
  `gcloud run services add-iam-policy-binding <fn> --member allUsers --role
  roles/run.invoker`. A scheduled function stays private to the Cloud Scheduler
  OIDC identity (`<projectNumber>-compute@developer.gserviceaccount.com`) only.
  Iterate the callable list from the game's functions config, not a hand list.

Run `check-rules-parity.mjs` immediately before `firebase deploy` so a post-lint
edit of the rules copy can't ship unchecked.

## 3. ⚑ Owner checklist (outside code — emit this for the human)

- [ ] Register prod Firebase project `<name>-zmf`; commit web config as public
      `VITE_FIREBASE_*` in `packages/app/.env` + `VITE_FIREBASE_VAPID_KEY`.
- [ ] Create deploy SA (Editor + `roles/run.admin`); store JSON key as GitHub
      secret `FIREBASE_SERVICE_ACCOUNT_<NAME>_ZMF`.
- [ ] Cloudflare `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.
- [ ] GCP budget alerts ($10 / $50) on the Firebase project.
- [ ] Custom domain / DNS; first real OAuth sign-in; real-device push + iOS
      home-screen install check.
- [ ] Native/store (§12, any app): Apple Developer ($99/yr, all apps) + Play
      ($25 once); 1024 icon, per-platform screenshots, titles/keywords,
      privacy labels ("Data Not Collected" for solo/arcade/utility), rating
      questionnaire, support URL (the brand site). iOS archive/sign/submit runs
      from the owner's Mac (no macOS CI); Android AAB builds in CI.

## 4. After it's live

Set the app's `registry/apps.json` entry: `status` → `live` and `webUrl` → its
URL (this flips it from a `<span>` to a link on arcade-site and into the family
footers). Regenerate: `node registry/gen-family.mjs`. Update
`BRAND-IMPLEMENTATION.md`'s ledger; log judgment calls in the game's
`DECISIONS.md`.
