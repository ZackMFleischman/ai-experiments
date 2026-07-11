#!/usr/bin/env node
// Static checks for arcade-site/ (the zero-build brand site — no bundler runs,
// so nothing else would catch a broken tag or a dead internal link before it
// deploys to Cloudflare Pages). Registry parity of the family list is enforced
// separately by `registry/gen-family.mjs --check`; this covers HTML sanity +
// internal links. Zero deps.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'arcade-site');
const errors = [];

for (const file of readdirSync(ROOT).filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(join(ROOT, file), 'utf8');

  // Well-formedness sanity (not a full validator): doctype + a few tags whose
  // open/close counts must balance. Catches the common hand-edit slip.
  if (!/^<!doctype html>/i.test(html.trimStart())) errors.push(`${file}: missing <!doctype html>`);
  for (const tag of ['html', 'head', 'body', 'ul', 'style']) {
    const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) ?? []).length;
    const close = (html.match(new RegExp(`</${tag}>`, 'gi')) ?? []).length;
    if (open !== close) errors.push(`${file}: <${tag}> open/close mismatch (${open} open, ${close} close)`);
  }

  // Internal links (root-relative) must resolve to a file in arcade-site/.
  for (const m of html.matchAll(/href="(\/[^"]*)"/g)) {
    const target = m[1].split('#')[0].split('?')[0];
    if (target === '/') continue;
    if (!existsSync(join(ROOT, target.replace(/^\//, '')))) {
      errors.push(`${file}: internal link ${m[1]} → no such file in arcade-site/`);
    }
  }
}

if (errors.length) {
  console.error('✗ arcade-site:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('✓ arcade-site: HTML sanity + internal links OK');
