// ported from hive/packages/functions/vitest.config.ts (adapted)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 15000,
    // Test files share one emulator instance; parallel files would race on
    // shared Firestore state (hive lesson — the rules suite clears between
    // tests from T4.3 on).
    fileParallelism: false,
  },
});
