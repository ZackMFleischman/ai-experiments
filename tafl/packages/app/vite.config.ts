// modeled on lex/packages/app/vite.config.ts (no dictionaries — tafl has no
// assets beyond the app itself). Default mode is the firebase-free static
// hot-seat build (scripts/check-bundle.mjs enforces it); `--mode multiplayer`
// loads .env.multiplayer (VITE_TAFL_MODE=full) and wires the firebase stack.
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const parlorRoot = fileURLToPath(new URL('../../../parlor', import.meta.url));

export default defineConfig({
  build: { sourcemap: true },
  plugins: [
    react(),
    // Installable PWA with the custom push-capable SW: src/sw.ts owns
    // precache + SPA fallback + push display + push-sync postMessage.
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: 'Tafl',
        short_name: 'Tafl',
        description: 'Hnefatafl — the Viking siege game, for two.',
        theme_color: '#0b7285',
        background_color: '#f5f3ee',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: { fs: { allow: ['.', fileURLToPath(new URL('../..', import.meta.url)), parlorRoot] } },
  // The parlor sibling workspace has its own node_modules (peer deps mirrored
  // as devDeps for its standalone tests) — dedupe the stateful/singleton
  // libraries so linked @parlor/* source shares the app's copies.
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
  optimizeDeps: {
    exclude: ['@parlor/core', '@parlor/web', '@parlor/brand', '@parlor/harness'],
  },
});
