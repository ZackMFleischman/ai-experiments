# Agent build log

Append-only progress log, newest entries at the bottom. Basic beats only; details live in commits and `DECISIONS.md`.

## 2026-06-09 20:10 — M0 started

- Read requirements + implementation plan. Scope for M0: pnpm monorepo, Vite engine-app, WebGPURenderer + fps meter, hardcoded `defineScene` TSL scene, HMR hot-swap with error rejection.
- Branch: `claude/add-docs-loom-folder-8s4ox5` (M0 here; M1 will be cut onto its own branch per Zack's instruction).

## 2026-06-09 20:30 — M0 scaffold complete, typecheck green

- Monorepo: `loom/` root with `packages/runtime` (minimal `defineScene` + `SceneOutput` contract) and `packages/engine-app` (Vite app: fullscreen canvas, `WebGPURenderer`, `QuadMesh` fullscreen pass, fps meter).
- `content/scenes/hello.scene.ts`: animated TSL rings scene.
- HMR: `import.meta.hot.accept` on the scene file in `main.ts`; `SceneHost.setScene` try/catches `build()` and keeps the previous scene on any throw. Vite error overlay disabled so compile errors can't paint the Output window.
- Pinned `three@0.184.0` (exact, per plan risk table). One type fix: `colorNode` must be the typed node union from `NodeMaterial["colorNode"]`, not base `Node`.
- `pnpm typecheck` green. Playwright + Chromium installed for automated visual validation (will also serve M1).

## 2026-06-09 20:42 — M0 SHIPPED: 10/10 automated acceptance checks pass

- `pnpm validate:m0` (scripts/validate-m0.mjs) spins up Vite + headless Chromium and asserts the plan's "shipped when" end-to-end:
  - initial scene renders non-black (avg luminance 137)
  - editing the scene file hot-swaps in **102 ms** (plan budget: <2 s)
  - solid-green edit visibly lands on screen (center pixel rgb(0,255,0))
  - syntax error → screen unchanged, no reload, no error overlay
  - `build()` that throws → scene rejected, previous scene stays live
  - restoring the file hot-swaps the original back in
- Screenshots of each state saved to `loom/artifacts/m0-*.png` for inspection.
- Caveats: headless Chromium has no WebGPU adapter, so the automated run exercised three's WebGL2 fallback; desktop Chrome gets WebGPU. First pixel-sampling attempt via canvas `drawImage` read black (no `preserveDrawingBuffer`) — switched to decoding Playwright screenshots with pngjs.
- Next: commit M0, cut a new branch, build M1 (Signals).
