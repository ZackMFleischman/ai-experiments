// stamped-manifest — the audited list of TRUE GLUE files per archetype:
// per-game copies of an exemplar file that are meant to stay identical
// modulo app identity (name/display/accent/glyph/port — exactly what
// tools/create-app rewrites). Each copy carries a
//   // stamped-from <exemplar-path>@<git-blob-sha> — regenerate, don't hand-sync
// header; registry/check-stamps.mjs fails when the exemplar's current blob
// sha has drifted from a copy's recorded sha (a visible diff queue instead
// of silent hand-propagation), and tools/create-app emits the header on
// stamp so new copies are born tracked.
//
// Scope is deliberately narrow (2026-07-11 audit): files that legitimately
// diverge per game — engine/board core, functions/src/config.ts (in the
// factory's "morph these" list), sync/{firestoreTransport,gameApi,lobby,
// JoinFlow,MultiplayerGame}, vite.config.ts (manifest identity) — must NOT
// be listed: a "regenerate, don't hand-sync" marker on a divergent file is
// a lie. Per-app `exclude` entries record pre-factory forks that converge
// in M4; they are lint-skipped, not lint-green.
//
// Zero deps; node 22+. Consumed by check-stamps.mjs and create-app/index.mjs.
import { createHash } from 'node:crypto';

export const STAMPED = {
  duo: {
    exemplar: 'tafl',
    files: {
      'packages/app/src/sw.ts': {},
      'packages/functions/src/index.ts': {
        exclude: {
          hive: 'pre-parlor forfeit/notify fork (own forfeit.ts) — converges in M4',
          lex: 'submitMove module split + forfeit export shape — converges in M4',
        },
      },
      'packages/app/src/sync/AppSyncProviders.tsx': {
        exclude: { hive: 're-export shape fork — converges in M4' },
      },
      'packages/app/src/sync/OnlineGames.tsx': {
        exclude: { hive: 'lobby onNewGame wiring fork — converges in M4' },
      },
      'packages/app/src/sync/NewGameFlow.tsx': {
        exclude: {
          hive: 'color/timeControl payload reshape fork — converges in M4',
          lex: 'imports from screens/newGameView fork — converges in M4',
        },
      },
    },
  },
  // Zero-backend families have only their exemplar today — no second member
  // to audit glue against (and no custom sw.ts; their SW is generated). Add
  // files here when the first copy exists and the audit confirms them.
  solo: { exemplar: 'sudoku', files: {} },
  arcade: { exemplar: 'breakout', files: {} },
  utility: { exemplar: 'stillness', files: {} },
};

/** git blob sha of raw content (identical to `git hash-object <file>`). */
export function blobSha(buf) {
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

/** The header line a stamped copy carries (first lines of the file). */
export function stampHeader(exemplarPath, sha) {
  return `// stamped-from ${exemplarPath}@${sha} — regenerate, don't hand-sync (lint: registry/check-stamps.mjs)`;
}

const HEADER_RE = /^\/\/ stamped-from (\S+)@([0-9a-f]{40})\b/;

/** Parse a stamped-from header from the first lines of a file; null if none. */
export function parseStamp(text) {
  for (const line of text.split('\n', 5)) {
    const m = HEADER_RE.exec(line);
    if (m) return { exemplarPath: m[1], sha: m[2] };
  }
  return null;
}
