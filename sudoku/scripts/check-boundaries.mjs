// Boundary lint (CLAUDE.md hard rules) — wired into `pnpm typecheck` and CI.
// Sudoku is a zero-backend app (no Firebase project at all), so this fails when:
//   (a) any source imports firebase — it must never appear in the bundle;
//   (b) a source reaches into @parlor/* internals via a deep src/dist/lib path
//       instead of the package's export map;
//   (c) any sudoku source imports another game's package.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set(['node_modules', 'dist', 'lib', 'artifacts', 'coverage', 'test-results', 'playwright-report', 'generated', 'native']);
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
// Reach @parlor/* through its export map only, never a deep src/dist/lib path.
const PARLOR_DEEP_RE = /^@parlor\/[^/]+\/(src|dist|lib)(\/|$)/;
// The other games' package scopes (sudoku never imports a sibling game).
const OTHER_GAME_RE = /^@(hive|lex|checkers|tafl|breakout|stillness)\//;

const errors = [];

for (const file of sourceFiles(join(root, 'packages'))) {
  const text = readFileSync(join(root, file), 'utf8');
  for (const spec of imports(text)) {
    if (FIREBASE_RE.test(spec)) {
      errors.push(`${file}: imports '${spec}' — Sudoku is zero-backend; firebase must never enter the bundle`);
    }
    if (PARLOR_DEEP_RE.test(spec)) {
      errors.push(`${file}: imports '${spec}' — reach @parlor/* through its export map only, never its src/ internals`);
    }
    if (OTHER_GAME_RE.test(spec)) {
      errors.push(`${file}: imports '${spec}' — sudoku never imports another game's packages`);
    }
  }
}

if (errors.length > 0) {
  console.error('boundary violations:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log('boundaries: OK');
