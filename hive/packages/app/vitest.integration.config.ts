// T4.6 integration suite: FirestoreTransport + GameController against the
// live emulator suite. Run via `pnpm validate:m4` (wrapped in emulators:exec).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test-integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    fileParallelism: false,
  },
});
