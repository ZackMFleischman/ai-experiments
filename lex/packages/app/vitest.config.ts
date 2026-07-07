// ported from hive/packages/app/vitest.config.ts (adapted)
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // The parlor sibling workspace has its own node_modules (it mirrors peer
  // deps as devDeps for its standalone tests) — dedupe the stateful/singleton
  // libraries so linked @parlor/* source shares lex's copies (§8.11).
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      '@mui/material',
      '@mui/icons-material',
      '@emotion/react',
      '@emotion/styled',
      'firebase',
    ],
  },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
  },
});
