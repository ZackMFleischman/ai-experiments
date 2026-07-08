// T4.5: the functions bundle validates words server-side, so the compiled
// DAWGs must sit next to it (lib/dict — loadDictionarySync gets an explicit
// dir; import.meta.url is unavailable in the CJS bundle). Builds @lex/dict
// first when the generated artifacts are missing; artifacts stay uncommitted.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The v1 registry ids (DESIGN §5.4) — plain node can't import the TS
// registry; the dict completeness tests keep this list honest.
const DICTIONARIES = [{ id: 'enable1' }, { id: '2of12inf' }, { id: 'nwl2023' }];

const here = dirname(fileURLToPath(import.meta.url));
const generated = join(here, '..', '..', 'dict', 'generated');
const target = join(here, '..', 'lib', 'dict');

const missing = DICTIONARIES.some((d) => !existsSync(join(generated, `${d.id}.dawg`)));
if (missing) {
  console.log('compiled DAWGs missing — building @lex/dict first…');
  execSync('pnpm --filter @lex/dict build', { stdio: 'inherit', cwd: join(here, '..') });
}

mkdirSync(target, { recursive: true });
for (const d of DICTIONARIES) {
  copyFileSync(join(generated, `${d.id}.dawg`), join(target, `${d.id}.dawg`));
}
console.log(`dawgs: ${DICTIONARIES.map((d) => d.id).join(', ')} → lib/dict`);
