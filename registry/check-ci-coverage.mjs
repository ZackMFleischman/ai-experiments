#!/usr/bin/env node
// CI-coverage meta-check: every parlor-consuming game in the registry must
// have a `<name>-ci.yml` whose path filters include BOTH the game's own dir
// and `parlor/**`. This kills the silent-failure mode where a game's CI never
// fires on a platform change (the "8th game whose CI forgot parlor/**") — the
// exact hole that motivated the registry. Zero deps; text-scan, not a YAML lib.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadRegistry, GAME_KINDS, REPO_ROOT } from './check-registry.mjs';

const errors = [];
for (const app of loadRegistry().filter((a) => GAME_KINDS.includes(a.kind))) {
  const ci = `${app.name}-ci.yml`;
  const path = join(REPO_ROOT, '.github/workflows', ci);
  if (!existsSync(path)) {
    errors.push(`${app.name}: missing .github/workflows/${ci}`);
    continue;
  }
  if (!(app.workflows || []).includes(ci)) errors.push(`${app.name}: registry.workflows should list ${ci}`);
  const text = readFileSync(path, 'utf8');
  // Both filters must appear inside a `paths:` line (they always live there).
  const pathLines = text.split('\n').filter((l) => l.includes('paths:'));
  const joined = pathLines.join('\n');
  if (!/parlor\/\*\*/.test(joined)) errors.push(`${ci}: path filters must include 'parlor/**' (or platform changes skip this game's CI)`);
  if (!new RegExp(`${app.dir}/\\*\\*`).test(joined)) errors.push(`${ci}: path filters must include '${app.dir}/**'`);
}

if (errors.length) {
  console.error('✗ CI coverage:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ CI coverage: every game has a <name>-ci.yml filtered on its dir + parlor/**`);
