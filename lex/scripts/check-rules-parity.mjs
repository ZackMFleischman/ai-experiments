// ported from hive/scripts/check-rules-parity.mjs (adapted)
// Firestore security-model parity lint — wired into `pnpm typecheck` and CI.
// PARLOR-PLATFORM-HARDENING.md Phase 1: `parlor/firestore.rules` +
// `parlor/firestore.indexes.json` are the canonical reference for every parlor
// game's security model. Firebase requires each game to keep its rules/indexes
// files INSIDE its own project dir (a `../parlor/...` path is rejected by
// `emulators:exec`/deploy — "outside of project directory"), so we can't share
// the physical file; instead every game keeps a copy and this lint fails if it
// drifts from — or weakens — the shared base. A hidden-information game (lex)
// may ADD tiers (racks/private) on top of the base; it may never drop or alter
// a base tier. The negative-path rules-unit-tests remain the behavioral gate;
// this is the anti-copy-paste-drift gate.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const parlorRoot = join(gameRoot, '..', 'parlor');

// Significant lines only: drop `//` comment lines + blanks, trim, collapse
// internal whitespace. Comments (headers differ per game) don't affect rule
// evaluation, so they're ignored here.
function normalize(text) {
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !l.startsWith('//'));
}

// Is `base` an in-order subsequence of `target`? (each base line matched to a
// distinct, later target line). Proves the base is present verbatim: a dropped
// or weakened base line can't be matched, so the check fails. Multiplicity is
// respected, so changing one of N identical `allow` lines is still caught.
function isSubsequence(base, target) {
  let i = 0;
  for (const line of target) {
    if (i < base.length && line === base[i]) i++;
  }
  return i === base.length;
}

const errors = [];

const base = normalize(readFileSync(join(parlorRoot, 'firestore.rules'), 'utf8'));
const game = normalize(readFileSync(join(gameRoot, 'firestore.rules'), 'utf8'));
if (!isSubsequence(base, game)) {
  const missing = base.filter((l) => !game.includes(l));
  errors.push(
    'firestore.rules drifted from the canonical parlor base (parlor/firestore.rules).\n' +
      '    Every base tier must be present verbatim; a game may only ADD tiers.\n' +
      (missing.length
        ? '    Base lines missing/altered:\n' + missing.map((l) => `      - ${l}`).join('\n')
        : '    Base lines are present but reordered.'),
  );
}

const parlorIdx = readFileSync(join(parlorRoot, 'firestore.indexes.json'), 'utf8');
const gameIdx = readFileSync(join(gameRoot, 'firestore.indexes.json'), 'utf8');
if (JSON.stringify(JSON.parse(parlorIdx)) !== JSON.stringify(JSON.parse(gameIdx))) {
  errors.push(
    'firestore.indexes.json differs from the canonical parlor reference ' +
      '(parlor/firestore.indexes.json) — the lobby/sweep indexes are shared; keep them identical.',
  );
}

if (errors.length > 0) {
  console.error('rules parity violations:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log('rules parity: OK');
