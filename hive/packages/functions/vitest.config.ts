import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 15000,
    // Test files share one emulator instance, and the rules suite clears
    // Firestore between tests — parallel files would wipe each other's data.
    fileParallelism: false,
  },
  // The source-linked @parlor/server carries its own firebase-admin copy (peer
  // dep mirrored as a devDep for its standalone tests). Dedupe the admin SDK so
  // parlor's callables and the test's `db` share ONE Firestore/@google-cloud
  // instance — otherwise a FieldValue sentinel from parlor's copy (e.g.
  // arrayRemove in sendPush's token pruning) isn't recognized by the test's db.
  resolve: {
    dedupe: ['firebase-admin', '@google-cloud/firestore', 'firebase-functions'],
  },
});
