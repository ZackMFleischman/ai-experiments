#!/usr/bin/env node
// create-app — the app factory's stamp (BRAND-IMPLEMENTATION.md Phase 4c;
// strategy §3). Stamps a new sibling workspace from the archetype's LIVING
// EXEMPLAR (rule of three — templates are extracted from shipped apps,
// never invented): duo=tafl, solo=sudoku, arcade=breakout,
// utility=stillness. The clone arrives all-gates-green playing the
// exemplar's game; PLAYBOOK.md then walks the builder through morphing the
// game-specific core (engine/board/config) into the brief's game while
// every other gate stays green. Docs are stamped fresh (budgeted TODO
// skeletons + DONE.md, the quality-gate checklist); workflows land at the
// repo root; identity (names, ids, accent, ports) is rewritten throughout.
//
//   node tools/create-app/index.mjs <name> --kind duo|solo|arcade|utility
//     [--display "Display Name"] [--tagline "..."] [--accent "#0b7285"]
//     [--port 5210] [--force]
//
// Zero dependencies; node 22+.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { docsSkeleton, doneChecklist } from './docs.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const KINDS = {
  duo: {
    exemplar: 'tafl',
    display: 'Tafl',
    accent: '#0b7285',
    packages: ['engine', 'app', 'functions'],
    workflows: ['ci', 'deploy'],
    zeroBackend: false,
    // Game-specific core the PLAYBOOK replaces (left in place as the
    // working placeholder; listed in DONE.md as "morph these").
    core: ['packages/engine/src', 'packages/app/src/board', 'packages/functions/src/config.ts'],
  },
  solo: {
    exemplar: 'sudoku',
    display: 'Sudoku',
    accent: '#3b5bdb',
    packages: ['engine', 'app'],
    workflows: ['ci', 'deploy', 'android'],
    zeroBackend: true,
    core: ['packages/engine/src', 'packages/app/src/board', 'packages/app/src/game'],
  },
  arcade: {
    exemplar: 'breakout',
    display: 'Bricks',
    accent: '#d9480f',
    packages: ['engine', 'app'],
    workflows: ['ci', 'deploy', 'android'],
    zeroBackend: true,
    core: ['packages/engine/src', 'packages/app/src/game'],
  },
  utility: {
    exemplar: 'stillness',
    display: 'Stillness',
    accent: '#5c8a64',
    packages: ['app'],
    workflows: ['ci', 'deploy', 'android'],
    zeroBackend: true,
    core: ['packages/app/src/timer', 'packages/app/src/screens'],
  },
};

// Never cloned: generated, per-app, or replaced-by-stamp artifacts.
const SKIP = new Set([
  'node_modules', 'dist', 'lib', 'coverage', 'artifacts', 'test-results',
  'playwright-report', 'blob-report', '.firebase', 'dev-dist', 'assets',
  'pnpm-lock.yaml', 'native', 'DONE.md',
]);
const SKIP_DOCS = new Set(['README.md', 'CLAUDE.md', 'REQUIREMENTS.md', 'DESIGN.md', 'IMPLEMENTATION.md', 'DECISIONS.md']);
const TEXT_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|jsonc|html|css|md|yaml|yml|rules|txt|env|multiplayer|firebaserc|gitignore)$/;

function parseArgs(argv) {
  const [name, ...rest] = argv;
  const args = { name };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === '--force') args.force = true;
    else if (flag?.startsWith('--')) args[flag.slice(2)] = rest[++i];
  }
  return args;
}

function fail(message) {
  console.error(`create-app: ${message}`);
  process.exit(1);
}

/** Every casing an identifier shows up in across the exemplars. */
function renames(fromName, fromDisplay, toName, toDisplay) {
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  return [
    [fromDisplay, toDisplay],
    [fromDisplay.toUpperCase(), toDisplay.toUpperCase()],
    [cap(fromName), cap(toName)],
    [fromName.toUpperCase(), toName.toUpperCase()],
    [fromName, toName],
  ];
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const args = parseArgs(process.argv.slice(2));
const name = args.name;
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  fail('usage: create-app <name> --kind duo|solo|arcade|utility (name is lowercase, e.g. checkers)');
}
const kind = KINDS[args.kind];
if (!kind) fail(`--kind must be one of: ${Object.keys(KINDS).join(' | ')}`);
const display = args.display ?? name.charAt(0).toUpperCase() + name.slice(1);
const tagline = args.tagline ?? `TODO: one-line tagline for ${display}.`;
const accent = args.accent ?? kind.accent;
if (!/^#[0-9a-fA-F]{6}$/.test(accent)) fail('--accent must be a #rrggbb hex color');
const target = join(repoRoot, name);
if (existsSync(target) && !args.force) fail(`${name}/ already exists (use --force to overwrite files into it)`);

const exemplarRoot = join(repoRoot, kind.exemplar);
if (!existsSync(exemplarRoot)) fail(`exemplar ${kind.exemplar}/ missing — generator templates are the shipped apps`);

// Port assignment: each app's e2e/dev servers get their own ports so
// sibling suites never collide (tafl friction log #5).
const basePort = Number(args.port ?? 5210);

const pairs = renames(kind.exemplar, kind.display, name, display);
const rewrite = (text) => {
  let out = text;
  for (const [from, to] of pairs) out = out.replaceAll(from, to);
  // Exemplar accents → the new app's accent, wherever they appear
  // (theme, manifest, index.html, marks).
  out = out.replaceAll(kind.accent, accent);
  // Port reassignment: exemplar e2e ports are in the 51xx/52xx range.
  out = out.replace(/\b5(1|2)\d\d\b/g, (port) => String(basePort + (Number(port) % 10)));
  return out;
};

// ---- clone the exemplar ------------------------------------------------------
let cloned = 0;
for (const source of walk(exemplarRoot)) {
  const rel = relative(exemplarRoot, source);
  // Docs are stamped fresh below, not cloned (they describe the exemplar).
  if (SKIP_DOCS.has(rel)) continue;
  const dest = join(target, rel);
  mkdirSync(dirname(dest), { recursive: true });
  const base = rel.split('/').pop() ?? '';
  if (TEXT_EXT.test(base) || base.startsWith('.')) {
    writeFileSync(dest, rewrite(readFileSync(source, 'utf8')));
  } else {
    cpSync(source, dest);
  }
  cloned += 1;
}

// ---- stamp the fresh doc set + DONE.md ---------------------------------------
const docs = docsSkeleton({ name, display, tagline, kind: args.kind, exemplar: kind.exemplar, accent });
for (const [file, content] of Object.entries(docs)) {
  writeFileSync(join(target, file), content);
}
writeFileSync(
  join(target, 'DONE.md'),
  doneChecklist({ name, display, kind: args.kind, exemplar: kind.exemplar, zeroBackend: kind.zeroBackend }),
);

// check-docs must know about DONE.md (the stamped checklist is part of the
// closed set; budget mirrors the template length with headroom).
const checkDocsPath = join(target, 'scripts', 'check-docs.mjs');
if (existsSync(checkDocsPath)) {
  const checkDocs = readFileSync(checkDocsPath, 'utf8');
  if (!checkDocs.includes("'DONE.md'")) {
    writeFileSync(
      checkDocsPath,
      checkDocs.replace("['DECISIONS.md', null],", "['DECISIONS.md', null],\n  ['DONE.md', 120],"),
    );
  }
}

// ---- stamp the repo-root workflows -------------------------------------------
const workflowsDir = join(repoRoot, '.github', 'workflows');
for (const suffix of kind.workflows) {
  const source = join(workflowsDir, `${kind.exemplar}-${suffix}.yml`);
  const dest = join(workflowsDir, `${name}-${suffix}.yml`);
  if (!existsSync(source)) fail(`exemplar workflow missing: ${source}`);
  writeFileSync(dest, rewrite(readFileSync(source, 'utf8')));
}

console.log(`stamped ${name}/ (${args.kind}, from ${kind.exemplar}) — ${cloned} files cloned, docs + DONE.md fresh, workflows: ${kind.workflows.map((w) => `${name}-${w}.yml`).join(' ')}.

Next (tools/create-app/PLAYBOOK.md drives the rest):
  cd ${name} && pnpm install && pnpm typecheck && pnpm test   # green before any edit
  git add ${name} .github/workflows/${name}-*.yml && commit the stamp
  then morph the game core per the PLAYBOOK, keeping every gate green.`);
