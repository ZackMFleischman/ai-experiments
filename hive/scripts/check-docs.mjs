// Docs policy lint (IMPLEMENTATION.md §7) — wired into `pnpm typecheck` and CI.
// Fails on: (a) a §7.1 line budget exceeded, (b) any .md under hive/ outside the
// closed doc set, (c) append-minded "Update (" / "UPDATE:" markers in
// DESIGN.md / IMPLEMENTATION.md.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The closed doc set (§7.1). null = no line cap (DECISIONS.md only).
const BUDGETS = new Map([
  ['README.md', 25],
  ['CLAUDE.md', 50],
  ['DESIGN.md', 850],
  ['IMPLEMENTATION.md', 450],
  ['DECISIONS.md', null],
  ['e2e/visual-checklist.md', 150],
]);

const SKIP_DIRS = new Set(['node_modules', 'dist', 'lib', 'artifacts', 'coverage', 'test-results', 'playwright-report', 'emulator-seed', '.firebase']);

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
    errors.push(`${file}: not in the closed doc set (IMPLEMENTATION.md §7.1) — new .md files need a DECISIONS.md entry AND a §7.1 table row`);
  }
}

for (const [file, budget] of BUDGETS) {
  let text;
  try {
    text = readFileSync(join(root, file), 'utf8');
  } catch {
    continue; // not created yet (e.g. visual-checklist.md before M3)
  }
  const lines = text.split('\n').length;
  if (budget !== null && lines > budget) {
    errors.push(`${file}: ${lines} lines exceeds its §7.1 budget of ${budget} — cut or consolidate (raising a budget is a DECISIONS.md decision)`);
  }
  if (file === 'DESIGN.md' || file === 'IMPLEMENTATION.md') {
    // Line-anchored: §7.3's own policy text quotes the markers mid-sentence.
    if (/^(#+\s*)?(\*\*)?(Update \(|UPDATE:)/m.test(text)) {
      errors.push(`${file}: contains an "Update (" / "UPDATE:" marker — amend the owning section in place (§7.2.1)`);
    }
  }
}

if (errors.length > 0) {
  console.error('docs policy violations:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log('docs policy: OK');
