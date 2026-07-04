// ported from hive/scripts/check-docs.mjs (adapted for parlor's two-doc set)
// Docs policy lint — wired into `pnpm typecheck` and CI. Parlor keeps exactly
// two docs (CLAUDE.md + README.md, ≤55 lines each, current-state only);
// decisions go to the consumer's DECISIONS.md (parlor/CLAUDE.md).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const BUDGETS = new Map([
  ['README.md', 55],
  ['CLAUDE.md', 55],
]);

const SKIP_DIRS = new Set(['node_modules', 'dist', 'lib', 'coverage', 'test-results']);

function* mdFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* mdFiles(path);
    else if (entry.endsWith('.md')) yield relative(root, path);
  }
}

const errors = [];

for (const file of mdFiles(root)) {
  if (!BUDGETS.has(file)) {
    errors.push(`${file}: parlor's doc set is closed (CLAUDE.md + README.md only) — new docs need a consumer DECISIONS.md entry`);
  }
}

for (const [file, budget] of BUDGETS) {
  let text;
  try {
    text = readFileSync(join(root, file), 'utf8');
  } catch {
    continue;
  }
  const lines = text.split('\n').length;
  if (lines > budget) {
    errors.push(`${file}: ${lines} lines exceeds its budget of ${budget}`);
  }
}

if (errors.length > 0) {
  console.error('docs policy violations:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log('docs policy: OK');
