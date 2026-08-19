// Docs policy lint — wired into `pnpm typecheck` and CI. Parlor's doc set
// (CLAUDE.md): CLAUDE + README (≤55 each), DESIGN (the platform canon, M6),
// DECISIONS (append-only, uncapped). Thin wrapper over the shared core
// (../../tools/check-docs-core.mjs); this file owns only the set + budgets.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDocs } from '../../tools/check-docs-core.mjs';

checkDocs({
  root: join(dirname(fileURLToPath(import.meta.url)), '..'),
  policyRef: 'CLAUDE.md',
  newDocHint: 'new docs need a DECISIONS.md entry here',
  budgets: new Map([
    ['README.md', 55],
    ['CLAUDE.md', 55],
    ['DESIGN.md', 120],
    ['DECISIONS.md', null],
  ]),
  skipDirs: ['node_modules', 'dist', 'lib', 'coverage', 'test-results'],
});
