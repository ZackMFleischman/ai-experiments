// ported from hive/packages/app/vitest.integration.config.ts (adapted)
// T4.6 gate: real firebase SDK + GameController against the emulator suite.
// Run inside `firebase emulators:exec` (root validate:m4).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    dedupe: ['firebase', '@tanstack/react-query'],
  },
  test: {
    include: ['test-integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Serial: the suites share one emulator + one auth state.
    fileParallelism: false,
  },
});
