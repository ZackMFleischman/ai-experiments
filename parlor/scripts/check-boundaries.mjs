// Boundary lint (parlor/CLAUDE.md hard rules) — wired into `pnpm typecheck`
// and CI. Fails when:
//   (a) any @parlor/* source imports a game package (@lex/*, @hive/*) —
//       parlor is generic by construction;
//   (b) firebase is imported outside packages/web/ and packages/server/;
//   (c) react / firebase / MUI appear as regular dependencies (they must be
//       peerDependencies — the consuming game provides them).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set(['node_modules', 'dist', 'lib', 'coverage', 'test-results']);
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (SOURCE_EXT.test(entry)) yield relative(root, path);
  }
}

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

function imports(text) {
  const specs = [];
  for (const match of text.matchAll(IMPORT_RE)) specs.push(match[1]);
  return specs;
}

const GAME_RE = /^@(lex|hive)\//;
const FIREBASE_RE = /^(firebase|firebase-admin|firebase-functions)(\/|$)/;
const FIREBASE_ALLOWED = [/^packages\/web\//, /^packages\/server\//];
const PROVIDED_BY_CONSUMER = /^(react|react-dom|firebase|firebase-admin|firebase-functions|@mui\/.*|@emotion\/.*)$/;

const errors = [];

for (const file of sourceFiles(join(root, 'packages'))) {
  const text = readFileSync(join(root, file), 'utf8');
  for (const spec of imports(text)) {
    if (GAME_RE.test(spec)) {
      errors.push(`${file}: imports '${spec}' — @parlor/* never imports a game package (parlor/CLAUDE.md)`);
    }
    if (FIREBASE_RE.test(spec) && !FIREBASE_ALLOWED.some((re) => re.test(file))) {
      errors.push(`${file}: imports '${spec}' — firebase is confined to packages/web/ and packages/server/`);
    }
  }
}

for (const pkg of readdirSync(join(root, 'packages'))) {
  const manifestPath = join(root, 'packages', pkg, 'package.json');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    continue;
  }
  for (const dep of Object.keys(manifest.dependencies ?? {})) {
    if (GAME_RE.test(dep)) {
      errors.push(`packages/${pkg}/package.json: depends on '${dep}' — @parlor/* never depends on a game package`);
    }
    if (PROVIDED_BY_CONSUMER.test(dep)) {
      errors.push(`packages/${pkg}/package.json: '${dep}' must be a peerDependency — the consuming game provides it (parlor/CLAUDE.md)`);
    }
  }
}

if (errors.length > 0) {
  console.error('boundary violations:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log('boundaries: OK');
