#!/usr/bin/env node
// peerDependency coherence across the portfolio. parlor ships react / firebase
// / MUI / emotion as peerDependencies (the consuming game provides them), so a
// game can silently install a version outside parlor's peer range or diverge
// from its siblings — a class of "works on my game, breaks on yours" bug that
// no per-app gate catches. This reads each game's committed lockfile and:
//   HARD-FAILS on the load-bearing cases — a resolved major outside parlor's
//     declared peer range, or two versions of one dep inside a single lockfile;
//   WARNS on cross-game minor/patch drift (same major) — real but low-risk, and
//     only reconcilable by a coordinated re-install, so it advises rather than
//     blocking every unrelated PR on a stale sibling lockfile.
// Zero deps; a line scan of the pnpm-lock importers, not a YAML lib.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadRegistry, GAME_KINDS, REPO_ROOT } from './check-registry.mjs';

const SHARED = ['react', 'react-dom', 'firebase', '@mui/material', '@emotion/react'];

// parlor's peer range per dep (union across parlor packages; they agree).
function parlorPeerMajors() {
  const majors = {};
  const pkgDir = join(REPO_ROOT, 'parlor/packages');
  for (const pkg of ['web', 'core', 'server', 'brand', 'native', 'solo', 'arcade', 'harness']) {
    const mf = join(pkgDir, pkg, 'package.json');
    if (!existsSync(mf)) continue;
    const peers = JSON.parse(readFileSync(mf, 'utf8')).peerDependencies ?? {};
    for (const dep of SHARED) {
      if (peers[dep]) majors[dep] = majorOf(peers[dep]);
    }
  }
  return majors;
}

const majorOf = (v) => (String(v).match(/(\d+)/) ?? [])[1];

// Pull each SHARED dep's resolved version out of a lockfile's importer blocks:
//   `      react:` / `        version: 18.3.1(...)` → 18.3.1
function resolvedVersions(lock) {
  const lines = lock.split('\n');
  const found = {};
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^ {6}'?([@a-z0-9/._-]+)'?:\s*$/i);
    if (!m || !SHARED.includes(m[1])) continue;
    // next couple of lines carry specifier + version
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const vm = lines[j].match(/^ {8}version:\s*([\d.]+)/);
      if (vm) {
        (found[m[1]] ??= new Set()).add(vm[1]);
        break;
      }
    }
  }
  return found;
}

const peerMajors = parlorPeerMajors();
const perApp = {}; // dep -> { version -> [apps] }
const errors = [];

for (const app of loadRegistry().filter((a) => GAME_KINDS.includes(a.kind))) {
  const lock = join(REPO_ROOT, app.dir, 'pnpm-lock.yaml');
  if (!existsSync(lock)) {
    errors.push(`${app.name}: no pnpm-lock.yaml (run its install)`);
    continue;
  }
  const resolved = resolvedVersions(readFileSync(lock, 'utf8'));
  for (const dep of SHARED) {
    const versions = resolved[dep];
    if (!versions) continue;
    if (versions.size > 1) errors.push(`${app.name}: multiple ${dep} versions in one lockfile: ${[...versions].join(', ')}`);
    const v = [...versions][0];
    ((perApp[dep] ??= {})[v] ??= []).push(app.name);
    if (peerMajors[dep] && majorOf(v) !== peerMajors[dep]) {
      errors.push(`${app.name}: ${dep}@${v} — major ${majorOf(v)} ≠ parlor peer major ${peerMajors[dep]}`);
    }
  }
}

// Cross-game divergence: a shared dep resolving to >1 version across games.
// Same major → warn (advisory); different major would already be a hard error
// above (peer-range check), so anything landing here is minor/patch drift.
const warnings = [];
for (const dep of SHARED) {
  const byVersion = perApp[dep];
  if (byVersion && Object.keys(byVersion).length > 1) {
    const detail = Object.entries(byVersion).map(([v, apps]) => `${v} (${apps.join(',')})`).join(' vs ');
    warnings.push(`${dep}: games disagree on version — ${detail}; align on the next coordinated install`);
  }
}

if (warnings.length) {
  console.warn('⚠ peerDep drift (advisory):');
  for (const w of warnings) console.warn(`  - ${w}`);
}
if (errors.length) {
  console.error('✗ peerDep coherence:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const summary = SHARED.filter((d) => perApp[d]).map((d) => `${d}@${Object.keys(perApp[d]).sort().join('/')}`).join(', ');
console.log(`✓ peerDeps within parlor peer ranges; no in-lockfile conflicts — ${summary}`);
