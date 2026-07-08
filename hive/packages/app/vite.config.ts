import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const parlorRoot = fileURLToPath(new URL('../../../parlor', import.meta.url));

// PWA setup (T3.12 + T5.1): manifest, generated icons, precached app shell
// with SPA navigation fallback — the lobby renders cached games read-only
// offline (Firestore persistent cache does the data half; see sync/firebase).
export default defineConfig({
  build: { sourcemap: true }, // published maps: debuggability > obscurity here
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Custom SW (src/sw.ts): precache + SPA fallback + push handlers (T5.2).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
      manifest: {
        name: 'HIVE',
        short_name: 'HIVE',
        description: 'The board game Hive — two players, one hive.',
        theme_color: '#e8a013',
        background_color: '#181614',
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
  // The lazy full-mode chunks consume the source-linked parlor sibling
  // workspace (@parlor/web) — let Vite read outside the app root.
  server: { fs: { allow: ['.', fileURLToPath(new URL('../..', import.meta.url)), parlorRoot] } },
  // parlor has its own node_modules (peer deps mirrored as devDeps for its
  // standalone tests) — dedupe the stateful/singleton libraries so linked
  // @parlor/* source shares hive's copies (incl. @mui/icons-material, or the
  // icon components pull a second React).
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
  optimizeDeps: { exclude: ['@parlor/web'] },
});
