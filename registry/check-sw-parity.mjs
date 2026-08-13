// Duo service-worker parity lint (PORTFOLIO-HARDENING M5) — run by
// registry-ci. `parlor/templates/sw.ts` is the canonical duo SW; every duo
// game keeps a physical copy at packages/app/src/sw.ts (the SW must live
// inside the app for its build — same constraint as firestore.rules). This
// fails when a copy's CODE drifts from the template. Comment lines and blanks
// are ignored, so per-game doc headers are fine; a behavioral edit belongs in
// the template first, then re-copied to every game. Zero deps; node 22+.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { apps } = JSON.parse(readFileSync(join(root, 'registry', 'apps.json'), 'utf8'));

// Significant lines only: drop `//` comment lines (incl. the `///` lib
// reference — typecheck guards that separately) + blanks, trim, collapse
// internal whitespace. Same normalization as the games' check-rules-parity.
function normalize(text) {
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !l.startsWith('//'))
    .join('\n');
}

const template = normalize(readFileSync(join(root, 'parlor', 'templates', 'sw.ts'), 'utf8'));
const errors = [];

for (const app of apps.filter((a) => a.kind === 'duo')) {
  const rel = `${app.dir}/packages/app/src/sw.ts`;
  let copy;
  try {
    copy = readFileSync(join(root, rel), 'utf8');
  } catch {
    errors.push(`${rel}: missing — every duo game carries the SW copy`);
    continue;
  }
  if (normalize(copy) !== template) {
    errors.push(
      `${rel}: code drifted from parlor/templates/sw.ts — edit the template first, then re-copy (comments may differ; code may not)`,
    );
  }
}

if (errors.length > 0) {
  console.error('sw parity violations:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`sw parity: ${apps.filter((a) => a.kind === 'duo').length} duo copies match the parlor template`);
