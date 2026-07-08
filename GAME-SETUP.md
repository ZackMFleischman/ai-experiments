# Standing up a new parlor game

The checklist for building a new turn-based, two-player, invite-a-friend PWA on
the `@parlor/*` platform (hive, lex are the reference consumers). It kills the
"clone hive/ and delete the Hive parts" onboarding cost by naming every wiring
point and the tribal knowledge that is otherwise scattered across hive's
`DECISIONS.md`. Scope is **2-player** (N-player is a parked epic).

> Placement: this lives at the repo root, not under `parlor/`, because parlor
> keeps a closed, line-budgeted doc set (`CLAUDE.md` + `README.md` only —
> `parlor/scripts/check-docs.mjs`). Same reason `PARLOR-PLATFORM-HARDENING.md`
> is here. The **canonical surfaces** are the parlor source + `lex/DESIGN.md §4`;
> this file is the how-to that points at them.

Replace `GAME` with your game's short name (lowercase, e.g. `checkers`)
throughout. `$N` is the number of standard callables you export.

---

## 1. Workspace skeleton

An independent pnpm workspace at the repo root, a sibling of `parlor/`:

```
GAME/
├── package.json            # root scripts (dev, typecheck, test, validate:m*)
├── pnpm-workspace.yaml      # packages: ['packages/*']
├── tsconfig.base.json       # strict TS + the @parlor/* path map (§2)
├── firebase.json  .firebaserc
├── firestore.rules  firestore.indexes.json     # from the parlor template (§6)
├── scripts/                 # check-docs.mjs, check-rules-parity.mjs, check-bundle.mjs
├── .github/ (workflows live at the REPO root, not here — see §9/§10)
└── packages/
    ├── engine/              # @GAME/engine — pure, zero-dep, deterministic rules kernel
    ├── app/                 # @GAME/app — React PWA (Vite); firebase only under src/sync/
    └── functions/           # @GAME/functions — Cloud Functions = @parlor/server shells
```

`@parlor/*` are **source-linked siblings** (pnpm workspaces don't span repo
roots): `link:` dependencies + TS path mapping. Install parlor **before** the
game (`link:` deps don't install the linked package's own deps):

```
cd parlor && pnpm install
cd ../GAME && pnpm install
```

react / firebase / MUI are **peerDependencies** the game provides; `@parlor/core`
and `@GAME/engine` stay zero-dependency, pure, deterministic (no `Date.now`/
`Math.random`; seed/bag order is an input).

## 2. TypeScript path map (`tsconfig.base.json`)

```jsonc
"paths": {
  "@parlor/core": ["../parlor/packages/core/src/index.ts"],
  "@parlor/server": ["../parlor/packages/server/src/index.ts"],
  "@parlor/web": ["../parlor/packages/web/src/index.ts"],
  "@parlor/web/firebase":   ["../parlor/packages/web/src/firebase.ts"],
  "@parlor/web/transport":  ["../parlor/packages/web/src/transport.ts"],
  "@parlor/web/gameApi":    ["../parlor/packages/web/src/gameApi.ts"],
  "@parlor/web/lobby":      ["../parlor/packages/web/src/lobby.ts"],
  "@parlor/web/lobby-ui":   ["../parlor/packages/web/src/lobby-ui/index.ts"],
  "@parlor/web/push":       ["../parlor/packages/web/src/push.ts"],
  "@parlor/web/AppSyncProviders":  ["../parlor/packages/web/src/AppSyncProviders.tsx"],
  "@parlor/web/NotificationsSetup":["../parlor/packages/web/src/NotificationsSetup.tsx"],
  "@parlor/harness": ["../parlor/packages/harness/src/index.ts"]
}
```

Add the game's own package aliases (`@GAME/engine`, …) alongside.

## 3. `firebase.json` + `.firebaserc`

```json
// firebase.json
{
  "hosting":  { "public": "packages/app/dist",
                "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
                "rewrites": [{ "source": "**", "destination": "/index.html" }] },
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "functions": [{ "source": "packages/functions", "codebase": "default" }],
  "emulators": { "auth": {"port": 9099}, "firestore": {"port": 8080},
                 "functions": {"port": 5001}, "ui": {"enabled": true, "port": 4000},
                 "singleProjectMode": true }
}
```

```json
// .firebaserc  — default is a DEMO project so emulators/CI run fully offline
{ "projects": { "default": "demo-GAME", "prod": "GAME-zmf" } }
```

**Rules + indexes must live INSIDE the project dir** — a `../parlor/...` path is
rejected by `emulators:exec`/deploy ("outside of project directory"). Copy the
parlor template (§6) in; the parity lint keeps it honest.

## 4. Functions build + emulator tests

Bundle with esbuild so the source-linked `@parlor/server` (and `@GAME/engine`)
are inlined for deploy; keep the Firebase runtime deps external:

```jsonc
// packages/functions/package.json
"scripts": {
  "build": "esbuild src/index.ts --bundle --platform=node --target=node22 --format=cjs --outfile=lib/index.js --external:firebase-admin --external:firebase-functions",
  "typecheck": "tsc --noEmit",
  "test": "pnpm build && firebase emulators:exec --only functions,firestore,auth --project demo-GAME --import emulator-seed \"vitest run\""
}
```

Commit an **emulator seed** at `packages/functions/emulator-seed/`
(`firebase-export-metadata.json` + `firestore_export/…`, produced by
`firebase emulators:export`). Note: `env.clearFirestore()` in rules/callable
tests wipes the imported seed too — re-`setDoc` any fixture the other suites read
(e.g. `users/demo-user`) in `beforeEach`, so suites stay order-independent.

## 5. Vite wiring (`packages/app/vite.config.ts`)

The linked `@parlor/web` source pulls singletons from parlor's own
`node_modules` unless deduped to the game's copies (or the MUI icons / React
double up):

```ts
resolve: { dedupe: [
  'react', 'react-dom', 'react-router-dom', '@tanstack/react-query',
  '@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled', 'firebase',
] },
optimizeDeps: { exclude: ['@parlor/web'] },
// let Vite read the sibling parlor workspace outside the app root:
server: { fs: { allow: ['.', /* repo root */, /* parlorRoot */ ] } },
```

For deploy, Cloud Build npm-installs the packed functions dir including
devDependencies; the `workspace:*`/`link:` dev-only deps (already inlined by
esbuild) break that install, so the deploy job runs
`cd packages/functions && npm pkg delete devDependencies` before `firebase
deploy` (§10).

## 6. Firestore rules + indexes (parlor Phase 1)

Copy `parlor/firestore.rules` + `parlor/firestore.indexes.json` into the game.
A perfect-information game uses the base three tiers verbatim; a
hidden-information game adds the documented `racks/{uid}` (owner-read) +
`private/*` (server-secret) override. Add `scripts/check-rules-parity.mjs`
(copy hive's) and wire it into `pnpm typecheck` — it fails if your rules drift
from / weaken the parlor base or your indexes diverge. The negative-path
rules-unit-tests are the security gate.

## 7. Server callables (parlor Phase 2)

`packages/functions/src/`:
- `config.ts` — the `GameServerConfig` (seat keys, option parse, seat choice,
  time control, `initialGame`, optional `seatRackDoc` for hidden info) + the
  `SubmitMoveConfig` (`parseMove` + the game's engine `advance`) + the
  `NotifyConfig` (per-trigger push copy + `isMyTurn`).
- `index.ts` — assemble the callables:

```ts
export const { createGame, joinGame, cancelGame, challengeUser,
               respondChallenge, rematch, resign } = createGameCallables(config);
export const submitMove = createSubmitMove(submitConfig);
// opt-in capabilities by inclusion — draws shown; omit if the game has none:
export const { offerDraw, respondDraw } = createDrawCallables(config);
export const { forfeitExpired } = createForfeitHandlers(config); // or a game sweep
```

## 8. Client transport (parlor Phase 3)

`packages/app/src/sync/firestoreTransport.ts` — a `GameTransport` over Firestore.
Reuse the shell from `@parlor/web/transport`: `seatIndexOf` (seat resolution),
`watchGameMeta` (the game-doc meta listener, incl. the permission-denied
**delete-detection**), and — for a perfect-information game — the log-replay
reads `fetchOrderedMoves` + `watchAddedMoves` (map each move doc → your entry,
replay through the engine). A hidden-information game supplies its own coherent-
adoption strategy (re-read game+rack+log per signal behind coherence + monotonic
gates) instead. Writes go through the typed callables from `@parlor/web/gameApi`.

## 9. CI (`.github/workflows/GAME-ci.yml`, at the REPO root)

Trigger on `['GAME/**', 'parlor/**', '.github/workflows/GAME-ci.yml']`. Node 22.
Three jobs (see `lex-ci.yml`):
- **parlor · typecheck · unit** — gates the shared workspace on its own.
- **checks** — `pnpm typecheck` + `pnpm test`; needs `setup-java@v4` (21) + a
  `~/.cache/firebase/emulators` cache for the emulator jars.
- **validate** — `pnpm validate` (the `validate:m*` milestone gates, incl.
  Playwright: `pnpm exec playwright install --with-deps chromium`).

Every job installs **parlor first** (`pnpm install --frozen-lockfile` in
`parlor/`), then the game. Cache key covers both `GAME/pnpm-lock.yaml` and
`parlor/pnpm-lock.yaml`.

## 10. Deploy (`.github/workflows/GAME-deploy.yml`, at the REPO root)

Two jobs (see `hive-deploy.yml`):

1. **Cloudflare Pages** — the firebase-free static hot-seat PWA (`build` +
   `scripts/check-bundle.mjs` asserting no firebase in the bundle), on every PR
   (preview URL + sticky comment) and main. `wrangler pages project create GAME
   --production-branch main || true` self-provisions.
2. **firebase deploy** (push/dispatch only) — the multiplayer app to Hosting,
   callables to Functions, rules+indexes to Firestore. Load-bearing gotchas
   (lift verbatim — hive learned each the hard way):
   - auth via a **service-account JSON secret** written to
     `GOOGLE_APPLICATION_CREDENTIALS` (`login:ci` tokens are deprecated);
   - `gcloud services enable cloudbilling.googleapis.com` first — the CLI queries
     the Billing API for v2 functions but never auto-enables it;
   - `npm pkg delete devDependencies` in the packed functions dir (§5);
   - **invoker-IAM repair, idempotent every deploy**: functions first-created in
     a failed deploy never get their invoker binding and the CLI never retries on
     update — the callables then 403 at Cloud Run ("internal" in the app). For
     each public callable:
     `gcloud run services add-iam-policy-binding <fn> --member allUsers --role roles/run.invoker`;
     a scheduled function stays private to the Cloud Scheduler OIDC identity
     (the `<projectNumber>-compute@developer.gserviceaccount.com` SA only).
     Requires **`roles/run.admin`** on the deploy service account.

## 11. Manual / owner steps (⚑ — outside code)

- Register the prod Firebase project `GAME-zmf`; commit its web config as public
  `VITE_FIREBASE_*` in `packages/app/.env`, and the VAPID public key
  (`VITE_FIREBASE_VAPID_KEY`) for push.
- Create the deploy service account (Editor **+ `roles/run.admin`**); store its
  JSON key as the GitHub secret `FIREBASE_SERVICE_ACCOUNT_GAME_ZMF`.
- Cloudflare: `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets/vars (the
  deploy job no-ops with a notice when absent).
- Custom domain / DNS, first real OAuth sign-in, real-device push + iOS
  home-screen install check.

---

A generator (`create-parlor-game <name>`) that stamps this skeleton is the
plan's second, more ambitious Phase-4 deliverable; until it exists, this
checklist is the source of truth (`PARLOR-PLATFORM-HARDENING.md` Phase 4).
