# CI & preview environments

How LOOM gets tested on GitHub and how each PR gets a phone-openable preview with
inline scene screenshots. Workflow: `.github/workflows/loom-ci.yml` (repo root).

## What runs on every PR

Three jobs:

| Job | Does | Blocks merge? | Needs secrets? |
|---|---|---|---|
| **checks** | `pnpm typecheck` → `pnpm test` → production `vite build` → `validate:m0` (HMR / never-go-black smoke) | **yes** | no |
| **validators-advisory** | `validate:m1`…`m6` + `validate:modulators` | no (advisory) | no |
| **preview** | builds the static app, renders scene stills, deploys to Cloudflare Pages, upserts a sticky PR comment with the link + screenshots | no | yes (deploy step skips without them) |

`checks` is the required gate — fast and deterministic headless. The heavier
acceptance validators were built for a **real GPU + manual WebGPU verification**
(see `DECISIONS.md`); on headless **software** GL they're informative but
environment-sensitive, so `validators-advisory` runs them on every PR without
gating merge (`continue-on-error` at the job level). Read its logs/artifacts for
signal and reproduce on real hardware. m0 (HMR + never-go-black) is deterministic
enough to stay in the required gate.

Both jobs screenshot three's **WebGL2 fallback**: the validators hide
`navigator.gpu` so `WebGPURenderer` selects the WebGL2 backend (recent headless
Chromium exposes a software WebGPU adapter that renders blank/hangs), and CI sets
`LOOM_RES=640x360` so software GL renders fast enough for the screenshots. Both
are overridable — see `scripts/_browser.mjs` (`LOOM_GL`) and `LOOM_RES`.

## The preview environment

A **static** `vite build` of `packages/engine-app` (Output `/`, Console
`/console.html`, Staged `/staged.html`) deployed to Cloudflare Pages. It is
"view + tweak": watch the Output window and use the Console to spawn library
scenes and drag params live in the browser. It is **not** a live-editing server —
agent/MCP editing and HMR happen in your dev session here, not on the preview
(the preview just retries the absent sidecar WebSocket harmlessly).

Cloudflare gives each PR branch its own preview URL and the sticky comment keeps
the latest one at the top of the PR.

### One-time Cloudflare setup

1. **Create the Pages project** (once). With [wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/):
   ```sh
   npx wrangler pages project create loom --production-branch main
   ```
   (Or in the dashboard: **Workers & Pages → Create → Pages → Direct Upload**,
   name it `loom`.) The name must match `--project-name=loom` in the workflow.

2. **Create an API token.** Cloudflare dashboard → **My Profile → API Tokens →
   Create Token → Create Custom Token**:
   - Permission: **Account → Cloudflare Pages → Edit** (the only one needed)
   - Account Resources: **Include → your account**

3. **Add two GitHub repo secrets** (repo **Settings → Secrets and variables →
   Actions → New repository secret**):
   - `CLOUDFLARE_API_TOKEN` — the token from step 2
   - `CLOUDFLARE_ACCOUNT_ID` — from the Cloudflare dashboard sidebar (or
     **Workers & Pages → Account details**)

Until both secrets exist the preview job still builds the bundle (so the static
build stays tested) and just logs a notice instead of deploying.

## Screenshots in the PR

Two complementary paths:

- **Automated (every PR):** the preview job runs `scripts/shoot.mjs` into the
  deploy's `shots/` folder, so `scripts/preview-comment.mjs` can embed
  `![scene](<preview-url>/shots/<scene>.png)` inline in the sticky comment. No
  binaries enter git; the images render straight from the preview deploy.

- **Durable / in-diff (when authoring a visual):** render a still and commit it.
  ```sh
  node scripts/shoot.mjs pho-nebula          # boot scene if no args
  node scripts/shoot.mjs pulse lava          # specific scenes
  ```
  This writes `preview/screenshots/<scene>.png` (a tracked dir). Commit it and
  reference it in the PR body via a raw URL, which renders on a phone:
  ```md
  ![pulse](https://raw.githubusercontent.com/<owner>/<repo>/<branch>/loom/preview/screenshots/pulse.png)
  ```

`shoot.mjs` mirrors the validators: it spawns the dev server on an isolated port,
drives headless Chromium against the WebGL2 fallback, points `live.scene.ts` at
each target, and **always restores** the original boot scene afterward. Env knobs:
`SHOOT_OUT`, `SHOOT_W`/`SHOOT_H` (default 1280×720), `SHOOT_SETTLE` (warm-up ms).

## Running CI checks locally

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium   # once
LOOM_GL=swiftshader pnpm validate:m0                # reproduce the CI render
pnpm --filter @loom/engine-app exec vite build      # the static preview bundle
```
