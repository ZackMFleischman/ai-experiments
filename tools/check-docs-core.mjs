// Shared docs-policy core — every workspace's scripts/check-docs.mjs is a thin
// wrapper passing its own closed doc set (M6: eight drifted copies consolidated
// here; the wrapper owns WHAT is checked, this file owns HOW).
// Checks: (a) any .md outside the closed set, (b) line budgets (null = no cap),
// (c) append-minded "Update (" / "UPDATE:" markers in DESIGN.md /
// IMPLEMENTATION.md, (d) DECISIONS.md supersession-annotation format — a dead
// entry carries "⊘ superseded YYYY-MM-DD — <pointer>"; a new entry may say
// "supersedes …" but ad-hoc SUPERSEDED spellings fail (they hide dead advice).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const UPDATE_MARKER_FILES = new Set(['DESIGN.md', 'IMPLEMENTATION.md']);
// The literal YYYY-MM-DD placeholder is allowed so preambles can quote the format.
const SUPERSEDED_ANNOTATION = /⊘ superseded (\d{4}-\d{2}-\d{2}|YYYY-MM-DD) — /u;

export function checkDocs({ root, budgets, skipDirs, policyRef, newDocHint }) {
  const skip = new Set(skipDirs);
  const errors = [];

  function* mdFiles(dir) {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry) || entry.startsWith('.')) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) yield* mdFiles(path);
      else if (entry.endsWith('.md')) yield relative(root, path);
    }
  }

  for (const file of mdFiles(root)) {
    if (!budgets.has(file)) {
      errors.push(`${file}: not in the closed doc set (${policyRef}) — ${newDocHint}`);
    }
  }

  for (const [file, budget] of budgets) {
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue; // not created yet
    }
    const lines = text.split('\n').length;
    if (budget !== null && lines > budget) {
      errors.push(`${file}: ${lines} lines exceeds its ${policyRef} budget of ${budget} — cut or consolidate (raising a budget is a DECISIONS.md decision)`);
    }
    if (UPDATE_MARKER_FILES.has(file)) {
      // Line-anchored: the policy text quotes the markers mid-sentence.
      if (/^(#+\s*)?(\*\*)?(Update \(|UPDATE:)/m.test(text)) {
        errors.push(`${file}: contains an "Update (" / "UPDATE:" marker — amend the owning section in place (${policyRef})`);
      }
    }
    if (file.endsWith('DECISIONS.md')) {
      for (const line of text.split('\n')) {
        if (/supersed/i.test(line) && !SUPERSEDED_ANNOTATION.test(line) && !/supersedes/.test(line)) {
          errors.push(`${file}: non-canonical supersession marker ("${line.trim().slice(0, 60)}…") — append "⊘ superseded YYYY-MM-DD — <pointer>" to the dead entry`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error('docs policy violations:\n' + errors.map((e) => `  - ${e}`).join('\n'));
    process.exit(1);
  }
  console.log('docs policy: OK');
}
