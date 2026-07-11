// ported from hive/packages/functions/vitest.config.ts (adapted)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The parlor sibling workspace has its own node_modules (peer deps mirrored
  // as devDeps for standalone tests) — dedupe firebase-admin so linked
  // @parlor/server source shares lex's copy (sentinels like
  // FieldValue.arrayRemove are instance-checked; §8.11). The deployed bundle
  // is unaffected: esbuild externalizes firebase-admin to the one packed copy.
  resolve: {
    dedupe: ['firebase-admin', 'firebase-functions'],
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 15000,
    // Test files share one emulator instance; parallel files would race on
    // shared Firestore state (hive lesson — the rules suite clears between
    // tests from T4.3 on).
    fileParallelism: false,
  },
});
