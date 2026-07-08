// T4.6 integration suite: FirestoreTransport + GameController against the
// live emulator suite. Run via `pnpm validate:m4` (wrapped in emulators:exec).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Share hive's singleton copies with the linked @parlor/web source.
  resolve: { dedupe: ['firebase', '@tanstack/react-query'] },
  test: {
    include: ['test-integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    fileParallelism: false,
  },
});
