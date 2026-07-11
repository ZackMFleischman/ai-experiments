#!/usr/bin/env node
// Docs policy lint for the two zones no per-project check-docs covers: the
// repo-root .md files, and katmai-bears/ (unrelated to parlor, so it has no
// parlor-stamped check-docs). Mirrors the per-game check-docs contract —
// closed doc set + line budgets — so the root can't sprout an ungoverned,
// unbudgeted doc. Zero deps. Run by registry-ci.yml.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Repo-root .md files (non-recursive — subdirs carry their own check-docs).
// null budget = uncapped. Raising a budget is a DECISIONS.md decision.
const ROOT_BUDGETS = new Map([
  ['README.md', 25],
  ['CLAUDE.md', 90],
  ['DESIGN-PRINCIPLES.md', 100],
  ['MINIMALIST-APPS-STRATEGY.md', 160],
  ['BRAND-IMPLEMENTATION.md', 400],
  ['GAME-SETUP.md', 350],
  ['PARLOR-PLATFORM-HARDENING.md', 300],
  ['PORTFOLIO-HARDENING.md', 480],
]);

// katmai-bears/ closed doc set (recursive under the dir).
const KATMAI_BUDGETS = new Map([
  ['README.md', 160],
  ['CLAUDE.md', 55],
  ['DESIGN.md', 500],
  ['DECISIONS.md', null],
  ['DETECTION-PLAN.md', 250],
]);

const SKIP_DIRS = new Set(['node_modules', 'dist', 'lib', 'coverage', 'test-results', 'playwright-report', 'android', 'ios']);
const errors = [];

function budgetCheck(absFile, rel, budget) {
  const lines = readFileSync(absFile, 'utf8').split('\n').length;
  if (budget !== null && lines > budget) {
    errors.push(`${rel}: ${lines} lines exceeds its budget of ${budget} — cut or consolidate (raising a budget is a DECISIONS.md decision)`);
  }
}

// --- repo-root .md (non-recursive) ---
for (const entry of readdirSync(ROOT)) {
  if (!entry.endsWith('.md')) continue;
  if (statSync(join(ROOT, entry)).isDirectory()) continue;
  if (!ROOT_BUDGETS.has(entry)) {
    errors.push(`${entry}: repo-root .md outside the closed set — add a ROOT_BUDGETS row in tools/check-root-docs.mjs (and note why in the most-affected DECISIONS.md)`);
  }
}
for (const [file, budget] of ROOT_BUDGETS) {
  const abs = join(ROOT, file);
  if (existsSync(abs)) budgetCheck(abs, file, budget);
  else errors.push(`${file}: in the closed set but missing from repo root`);
}

// --- katmai-bears/ (recursive) ---
const KAT = join(ROOT, 'katmai-bears');
function* mdFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* mdFiles(path);
    else if (entry.endsWith('.md')) yield path;
  }
}
if (existsSync(KAT)) {
  for (const abs of mdFiles(KAT)) {
    const base = abs.slice(abs.lastIndexOf('/') + 1);
    const rel = relative(ROOT, abs);
    if (!KATMAI_BUDGETS.has(base)) {
      errors.push(`${rel}: outside katmai-bears' closed doc set — add a KATMAI_BUDGETS row in tools/check-root-docs.mjs`);
    } else {
      budgetCheck(abs, rel, KATMAI_BUDGETS.get(base));
    }
  }
}

if (errors.length) {
  console.error('root docs policy violations:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log('root docs policy: OK');
