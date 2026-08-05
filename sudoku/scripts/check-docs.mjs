// Docs policy lint (IMPLEMENTATION.md §7) — wired into `pnpm typecheck` and CI.
// Thin wrapper over the shared core (../../tools/check-docs-core.mjs, M6);
// this file owns only sudoku's closed doc set, budgets, and skip list.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDocs } from '../../tools/check-docs-core.mjs';

checkDocs({
  root: join(dirname(fileURLToPath(import.meta.url)), '..'),
  policyRef: 'IMPLEMENTATION.md §7',
  newDocHint: 'new .md files need a DECISIONS.md entry AND a §7 table row',
  // The closed doc set (§7). null = no line cap (DECISIONS.md only).
  budgets: new Map([
    ['README.md', 25],
    ['CLAUDE.md', 55],
    ['REQUIREMENTS.md', 250],
    ['DESIGN.md', 500],
    ['IMPLEMENTATION.md', 400],
    ['DECISIONS.md', null],
    // create-app:done-budget — the stamp inserts DONE.md's budget row here
  ]),
  // native/ holds the generated Capacitor shells (they ship their own READMEs);
  // they're factory output, not part of sudoku's authored doc set.
  skipDirs: ['node_modules', 'dist', 'lib', 'artifacts', 'coverage', 'test-results', 'playwright-report', 'generated', 'native'],
});
