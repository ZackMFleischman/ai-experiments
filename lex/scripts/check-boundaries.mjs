// Boundary lint (CLAUDE.md hard rules; IMPLEMENTATION.md §0.7/§3) — wired
// into `pnpm typecheck` and CI. Fails when:
//   (a) firebase escapes its confinement: inside lex, firebase imports are
//       legal only under packages/app/src/sync/ and packages/functions/
//       (+ the emulator integration suite, which drives the real SDK)
//       (@parlor/web|server are checked by parlor's own copy of this gate);
//   (b) any lex source imports another game's package (@hive/*).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set(['node_modules', 'dist', 'lib', 'artifacts', 'coverage', 'test-results', 'playwright-report', 'emulator-seed', '.firebase', 'words', 'generated']);
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (SOURCE_EXT.test(entry)) yield relative(root, path);
  }
}

// import … from 'x' | import 'x' | export … from 'x' | import('x') | require('x')
const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

function imports(text) {
  const specs = [];
  for (const match of text.matchAll(IMPORT_RE)) specs.push(match[1]);
  return specs;
}

const FIREBASE_RE = /^(firebase|firebase-admin|firebase-functions)(\/|$)/;
const FIREBASE_ALLOWED = [
  /^packages\/app\/src\/sync\//,
  /^packages\/app\/test-integration\//,
  /^packages\/functions\//,
];

const errors = [];

for (const file of sourceFiles(join(root, 'packages'))) {
  const text = readFileSync(join(root, file), 'utf8');
  for (const spec of imports(text)) {
    if (FIREBASE_RE.test(spec) && !FIREBASE_ALLOWED.some((re) => re.test(file))) {
      errors.push(`${file}: imports '${spec}' — firebase is confined to packages/app/src/sync/ and packages/functions/ (CLAUDE.md hard rules)`);
    }
    if (spec.startsWith('@hive/')) {
      errors.push(`${file}: imports '${spec}' — lex never imports another game's packages`);
    }
  }
}

if (errors.length > 0) {
  console.error('boundary violations:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log('boundaries: OK');
