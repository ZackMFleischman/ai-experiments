#!/usr/bin/env node
// check-stamps — the stale-copy lint (PORTFOLIO-HARDENING M5). For every
// true-glue file in registry/stamped-manifest.mjs, each non-exemplar app of
// that kind must carry a `// stamped-from <exemplar-path>@<sha>` header
// whose sha matches the exemplar's CURRENT blob sha (working tree, so a
// not-yet-committed exemplar edit already flags every copy). Also fails on
// a stamped-from header anywhere the manifest doesn't sanction one — a
// "regenerate, don't hand-sync" marker on a per-game file is a lie.
// Zero deps; node 22+. Run by registry-ci.yml.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAMPED, blobSha, parseStamp, stampHeader } from './stamped-manifest.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const apps = JSON.parse(readFileSync(join(repoRoot, 'registry', 'apps.json'), 'utf8')).apps;

const errors = [];
const sanctioned = new Set(); // "<app>/<rel>" allowed (or excused) to carry a header

for (const [kind, { exemplar, files }] of Object.entries(STAMPED)) {
  const exemplarApp = apps.find((a) => a.name === exemplar);
  if (!exemplarApp || exemplarApp.kind !== kind) {
    errors.push(`manifest exemplar ${exemplar} (${kind}) missing from registry or wrong kind`);
    continue;
  }
  const copies = apps.filter((a) => a.kind === kind && a.name !== exemplar);
  for (const [rel, spec] of Object.entries(files)) {
    const exemplarPath = `${exemplar}/${rel}`;
    const exemplarAbs = join(repoRoot, exemplarApp.dir, rel);
    if (!existsSync(exemplarAbs)) {
      errors.push(`exemplar file missing: ${exemplarPath} — fix the manifest or the exemplar`);
      continue;
    }
    const raw = readFileSync(exemplarAbs);
    if (parseStamp(raw.toString('utf8'))) {
      errors.push(`${exemplarPath} is the exemplar (source) but carries a stamped-from header — remove it`);
    }
    const currentSha = blobSha(raw);
    for (const app of copies) {
      const copyRel = `${app.dir}/${rel}`;
      if (spec.exclude?.[app.name]) {
        sanctioned.add(copyRel); // excused, but a header here would still be a lie
        continue;
      }
      sanctioned.add(copyRel);
      const abs = join(repoRoot, app.dir, rel);
      if (!existsSync(abs)) {
        errors.push(`${copyRel}: missing — manifest expects every ${kind} app to have this glue file`);
        continue;
      }
      const stamp = parseStamp(readFileSync(abs, 'utf8'));
      if (!stamp) {
        errors.push(
          `${copyRel}: no stamped-from header. Add as line 1:\n    ${stampHeader(exemplarPath, currentSha)}`,
        );
      } else if (stamp.exemplarPath !== exemplarPath) {
        errors.push(`${copyRel}: header points at ${stamp.exemplarPath}, expected ${exemplarPath}`);
      } else if (stamp.sha !== currentSha) {
        errors.push(
          `${copyRel}: STALE — synced against ${exemplarPath}@${stamp.sha.slice(0, 12)}, exemplar is now @${currentSha.slice(0, 12)}.\n` +
            `    Review the exemplar's change (git diff ${stamp.sha.slice(0, 12)} ${currentSha.slice(0, 12)}, or git log -p -- ${exemplarPath}),\n` +
            `    re-apply it to this copy (identity tokens preserved), then update the header sha to ${currentSha}.`,
        );
      }
    }
  }
}

// No unsanctioned markers: scan every registry app's sources for stamped-from
// headers the manifest doesn't know about.
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'lib', 'coverage', 'artifacts', 'test-results',
  'playwright-report', 'blob-report', '.firebase', 'dev-dist', '.git',
]);
const CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (CODE_EXT.test(entry)) yield path;
  }
}
for (const app of apps) {
  const appRoot = join(repoRoot, app.dir);
  if (!existsSync(appRoot)) continue; // check-registry owns dir parity
  for (const path of walk(appRoot)) {
    const rel = relative(repoRoot, path);
    if (sanctioned.has(rel)) continue;
    if (parseStamp(readFileSync(path, 'utf8'))) {
      errors.push(
        `${rel}: carries a stamped-from header but isn't in registry/stamped-manifest.mjs — ` +
          `per-game files must not claim "regenerate, don't hand-sync"; add it to the manifest only if it's audited true glue`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`check-stamps: ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ✗ ${e}\n`);
  process.exit(1);
}
console.log('check-stamps: all stamped glue copies in sync with their exemplars.');
