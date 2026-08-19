// Docs policy lint (IMPLEMENTATION.md §7.1) — wired into `pnpm typecheck` and CI.
// Thin wrapper over the shared core (../../tools/check-docs-core.mjs, M6);
// this file owns only hive's closed doc set, budgets, and skip list.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDocs } from '../../tools/check-docs-core.mjs';

checkDocs({
  root: join(dirname(fileURLToPath(import.meta.url)), '..'),
  policyRef: 'IMPLEMENTATION.md §7.1',
  newDocHint: 'new .md files need a DECISIONS.md entry AND a §7.1 table row',
  // The closed doc set (§7.1). null = no line cap (DECISIONS.md only).
  budgets: new Map([
    ['README.md', 25],
    ['CLAUDE.md', 50],
    ['DESIGN.md', 850],
    ['IMPLEMENTATION.md', 450],
    ['DECISIONS.md', null],
    ['e2e/visual-checklist.md', 150],
  ]),
  skipDirs: ['node_modules', 'dist', 'lib', 'artifacts', 'coverage', 'test-results', 'playwright-report', 'emulator-seed', '.firebase'],
});
