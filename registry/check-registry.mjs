#!/usr/bin/env node
// The app registry (`registry/apps.json`) is the single source of truth for
// "the list of apps" — the fact that used to exist only as hand-copies in
// family arrays, boundary-lint scopes, CI path filters, and the arcade site.
// This script validates the registry's shape and that it agrees with the
// filesystem, and exports `loadRegistry()` for the other registry-driven
// checks (family generation, CI-coverage, boundary scope) to consume.
//
// Zero deps, run with plain `node`. Exit 1 on any violation.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = dirname(HERE);

const KINDS = ['duo', 'solo', 'arcade', 'utility', 'other'];
const STATUSES = ['live', 'built', 'coming-soon'];
// Kinds that are parlor-consuming games (get CI parity, family listing, etc.).
export const GAME_KINDS = ['duo', 'solo', 'arcade', 'utility'];

/** Load + minimally shape-check the registry. Throws on structural rot. */
export function loadRegistry() {
  const path = join(HERE, 'apps.json');
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!raw || !Array.isArray(raw.apps)) {
    throw new Error('registry/apps.json must be an object with an `apps` array');
  }
  return raw.apps;
}

/** The banned `@<name>/*` game-scope list for parlor boundary linting. */
export function gameScopes(apps = loadRegistry()) {
  return apps.filter((a) => GAME_KINDS.includes(a.kind)).map((a) => `@${a.name}/*`);
}

// Discover on-disk game workspaces (a dir with packages/app) so a new game
// added to the tree without a registry entry fails CI instead of going silent.
function discoverGameDirs() {
  return readdirSync(REPO_ROOT)
    .filter((d) => {
      const p = join(REPO_ROOT, d);
      if (!statSync(p).isDirectory()) return false;
      if (d.startsWith('.') || d === 'parlor' || d === 'node_modules') return false;
      return existsSync(join(p, 'packages', 'app', 'package.json'));
    });
}

function main() {
  const errors = [];
  let apps;
  try {
    apps = loadRegistry();
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }

  const REQUIRED = ['name', 'dir', 'kind', 'displayName', 'tagline', 'glyph', 'accent', 'status'];
  const seenNames = new Set();
  const seenDirs = new Set();
  const parlorPkgs = existsSync(join(REPO_ROOT, 'parlor/packages'))
    ? new Set(readdirSync(join(REPO_ROOT, 'parlor/packages')))
    : new Set();

  for (const a of apps) {
    const id = a && a.name ? `app "${a.name}"` : `app #${apps.indexOf(a)}`;
    for (const f of REQUIRED) {
      if (a[f] === undefined || a[f] === null || a[f] === '') errors.push(`${id}: missing required field "${f}"`);
    }
    if (!KINDS.includes(a.kind)) errors.push(`${id}: kind "${a.kind}" not in ${KINDS.join('|')}`);
    if (!STATUSES.includes(a.status)) errors.push(`${id}: status "${a.status}" not in ${STATUSES.join('|')}`);
    if (typeof a.accent === 'string' && !/^#[0-9a-fA-F]{6}$/.test(a.accent)) errors.push(`${id}: accent "${a.accent}" is not a #rrggbb hex`);
    if (a.webUrl != null && !/^https?:\/\//.test(a.webUrl)) errors.push(`${id}: webUrl "${a.webUrl}" is not an absolute http(s) URL`);

    if (seenNames.has(a.name)) errors.push(`duplicate name "${a.name}"`);
    seenNames.add(a.name);
    if (seenDirs.has(a.dir)) errors.push(`duplicate dir "${a.dir}"`);
    seenDirs.add(a.dir);

    if (a.dir && !existsSync(join(REPO_ROOT, a.dir))) errors.push(`${id}: dir "${a.dir}" does not exist`);

    // firebaseProject is required for and exclusive to duo (server-backed) games.
    if (a.kind === 'duo' && !a.firebaseProject) errors.push(`${id}: duo game must set firebaseProject`);
    if (a.kind !== 'duo' && a.firebaseProject) errors.push(`${id}: non-duo game must not set firebaseProject`);

    for (const w of a.workflows || []) {
      if (!existsSync(join(REPO_ROOT, '.github/workflows', w))) errors.push(`${id}: workflow "${w}" not found under .github/workflows`);
    }
    for (const pkg of a.linkedParlor || []) {
      if (parlorPkgs.size && !parlorPkgs.has(pkg)) errors.push(`${id}: linkedParlor "${pkg}" is not a parlor package`);
    }
  }

  // Every on-disk game workspace must have a registry entry.
  for (const dir of discoverGameDirs()) {
    if (!apps.some((a) => a.dir === dir)) errors.push(`game workspace "${dir}/" has no registry entry`);
  }

  if (errors.length) {
    console.error('✗ registry/apps.json invalid:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`✓ registry: ${apps.length} apps, ${apps.filter((a) => GAME_KINDS.includes(a.kind)).length} games — shape + filesystem parity OK`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
