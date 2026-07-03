import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 15000,
    // Test files share one emulator instance, and the rules suite clears
    // Firestore between tests — parallel files would wipe each other's data.
    fileParallelism: false,
  },
});
