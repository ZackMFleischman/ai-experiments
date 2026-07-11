// The stamped doc set: fresh, budgeted skeletons (the exemplar's docs
// describe the exemplar's game — cloning them would be lies). Budgets match
// every shipped app's check-docs.mjs: README 25 · CLAUDE 55 · REQUIREMENTS
// 250 · DESIGN 500 · IMPLEMENTATION 400 · DECISIONS uncapped · DONE 120.

const KIND_BLURB = {
  duo: (x) =>
    `a two-player PWA on the \`@parlor/*\` platform (free hot-seat + online multiplayer), stamped from ${x.exemplar}/`,
  solo: (x) =>
    `a zero-backend solo PWA over \`@parlor/solo\` + \`@parlor/brand\`, stamped from ${x.exemplar}/`,
  arcade: (x) =>
    `a zero-backend arcade PWA over \`@parlor/arcade\` + \`@parlor/brand\`, stamped from ${x.exemplar}/`,
  utility: (x) =>
    `a zero-backend utility over \`@parlor/brand\` + \`@parlor/native\`, stamped from ${x.exemplar}/`,
};

export function docsSkeleton(x) {
  const blurb = KIND_BLURB[x.kind](x);
  return {
    'README.md': `# ${x.display} (${x.name}/)

${x.tagline}

${x.display} is ${blurb}. TODO: one paragraph on the game/app itself.

Status: stamped by tools/create-app — still playing the exemplar's game.
Morph it per \`tools/create-app/PLAYBOOK.md\`; gates in \`DONE.md\`.

Start with \`CLAUDE.md\` (rules + commands); design in \`DESIGN.md\`.
`,
    'CLAUDE.md': `# CLAUDE.md — ${x.name}/

${x.display}: ${blurb} (strategy: repo-root
\`MINIMALIST-APPS-STRATEGY.md\`). Read \`DESIGN.md\` before structural
changes; decisions go to \`DECISIONS.md\`. Until \`DONE.md\` is all
checked, \`tools/create-app/PLAYBOOK.md\` is the build runbook.

## Hard rules

- The stamped gates are the exemplar's, and they are law here too: never
  weaken a test, a lint, or a budget to pass one.
- UI follows repo-root \`DESIGN-PRINCIPLES.md\` — the \`@parlor/brand\`
  shell/HUD/theme components ARE the rules; deviations need a
  \`DECISIONS.md\` entry.
${
  x.kind === 'duo'
    ? `- The UI never computes rules — it renders engine verdicts only.
- The engine stays zero-dependency, pure, deterministic.
- Firebase imports only under \`app/src/sync/\` + \`packages/functions/\`;
  the default build is the firebase-free hot-seat PWA (bundle check);
  rules/indexes track parlor's canonical copies (parity lint).`
    : `- **No firebase, ever** — not a dep, not an import, not a string in
  the bundle (\`scripts/check-bundle.mjs\`; CI fails on violation).
- **No accounts, no analytics, no network calls.** State lives in the
  player's localStorage via injected \`KeyValueStorage\`.
- Anything with rules stays a zero-dependency, pure, deterministic
  engine — no \`Math.random\`, no clock reads inside the fold.`
}
- Parlor packages are consumed as source-linked siblings (\`link:\` +
  tsconfig paths + vite dedupe). Install \`parlor/\` before \`${x.name}/\`.
- Docs are a closed, line-budgeted set (\`scripts/check-docs.mjs\`, wired
  into typecheck), including \`DONE.md\`.

## Commands

From \`${x.name}/\`: \`pnpm install\`, \`pnpm dev\`, \`pnpm typecheck\`,
\`pnpm test\`, \`pnpm build\`, and the \`validate:*\` gates listed in
package.json (visual captures land in \`artifacts/screens/\` — read them,
don't just pass the gate).
CI: \`.github/workflows/${x.name}-*.yml\`.
`,
    'REQUIREMENTS.md': `# REQUIREMENTS — ${x.display}

TODO (from the 1-page brief): one-line scope.

## Functional

- FR-1: TODO — the game/app's own rules and surfaces, numbered.

## Non-functional

- NFR-1: The exemplar's invariants carry over (determinism, ${
      x.zeroBackend ? 'zero backend, offline PWA' : 'server-authoritative play, log as source of truth'
    }).

## Out of scope (v1)

TODO.
`,
    'DESIGN.md': `# DESIGN — ${x.display}

How the pieces fit. Stamped from \`${x.exemplar}/\` — its DESIGN.md is the
reference for every inherited section; this file documents where
${x.display} diverges.

## §1 Shape

The exemplar's workspace shape, verbatim (see \`${x.exemplar}/DESIGN.md\` §1).

## §2 Engine

TODO: the game's own rules kernel (this is the core the PLAYBOOK morphs).

## §3 App

TODO: screens and their state.

## §4 Testing

The exemplar's four layers carry over; document the game-specific gates
(property tests, golden traces, machine checks) here as they land.
`,
    'IMPLEMENTATION.md': `# IMPLEMENTATION — ${x.display}

Status ledger. Design rationale in \`DESIGN.md\`; the factory runbook is
\`tools/create-app/PLAYBOOK.md\`; the acceptance checklist is \`DONE.md\`.

## §0 Build protocol

Tests first where behavior is specifiable; \`pnpm typecheck && pnpm test\`
always-on; docs amended in the same PR; never weaken a gate.

## §2 Milestones

### M0 — morph the stamp into ${x.display} — IN PROGRESS

The stamp arrives green, playing the exemplar's game. Morph the core
(engine → screens → docs) per the PLAYBOOK, keeping every gate green;
check off \`DONE.md\` as each lands.

## §7 Docs policy

Closed, line-budgeted doc set enforced by \`scripts/check-docs.mjs\`
(wired into \`pnpm typecheck\`): README 25 · CLAUDE 55 · REQUIREMENTS 250
· DESIGN 500 · IMPLEMENTATION 400 · DONE 120 · DECISIONS uncapped
(append-only). Amend in place — no "Update:" markers.
`,
    'DECISIONS.md': `# DECISIONS — ${x.display}

> Append-only. New entries at the bottom: date, decision, one-line why.
> ≤8 lines each. Milestone SHIPPED entries follow the same format (date,
> gates run, deviations, stumbles). Post-v1 ideas go here as one-liners
> tagged \`post-v1\`.

---

- **STAMPED — tools/create-app** (\`--kind ${x.kind}\`, exemplar
  \`${x.exemplar}/\`, accent \`${x.accent}\`). The clone arrived
  all-gates-green playing the exemplar's game; everything below is
  ${x.display}'s own history.
`,
  };
}

export function doneChecklist(x) {
  return `# DONE — ${x.display}

The factory's definition of done (strategy §3). Check items off in the
PRs that land them; the app ships when everything is checked. The stamp
starts green — keep it green at every step.

## Morph (the PLAYBOOK's core loop)

- [ ] Engine replaced with ${x.display}'s rules (pure, deterministic,
      property-tested; golden trace where the archetype has one)
- [ ] Screens/board render the new game; gallery fixtures updated
- [ ] ${x.kind === 'duo' ? 'Server config (options/seats/advance) + emulator tests updated' : 'Session/store wiring updated for the new game'}
- [ ] Docs describe ${x.display} (no exemplar leftovers); DECISIONS.md
      records the judgment calls

## Gates (all green in CI)

- [ ] typecheck (docs + boundary + ${x.zeroBackend ? 'bundle' : 'rules-parity'} lints included)
- [ ] unit suites (engine property sweep widened in validate)
- [ ] Playwright visual gallery — captures actually reviewed
${x.kind === 'duo' ? '- [ ] emulator suite (callables + security rules negative paths)\n- [ ] hot-seat e2e smoke' : '- [ ] offline cold-start + Lighthouse PWA pass'}
- [ ] no-firebase bundle assert ${x.kind === 'duo' ? '(hot-seat build)' : '(every build)'}

## Ship

- [ ] Deploy workflow green (Cloudflare preview link works)
- [ ] Brand theme + MoreFromUs present; accent/mark/icons are
      ${x.display}'s own (packages/app/scripts/mark.mjs)
${
  x.zeroBackend
    ? `- [ ] Store listing validated (store/listing.ts test); privacy =
      data-not-collected
- [ ] ⚑ native shells generated + committed (cap add; native:assets);
      4.2 defenses verified on device; store ops per GAME-SETUP.md §12`
    : `- [ ] ⚑ prod Firebase project + secrets (GAME-SETUP.md §11); budget
      alerts; real-device push check`
}
- [ ] ⚑ human playtest on the PR preview URL — the button only a person
      can press
`;
}
