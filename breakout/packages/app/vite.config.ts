// modeled on sudoku/packages/app/vite.config.ts (no engine assets, no
// firebase, no custom SW — breakout is fully static and offline by
// construction; the canvas game never touches a server)
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const parlorRoot = fileURLToPath(new URL('../../../parlor', import.meta.url));

export default defineConfig({
  build: { sourcemap: true },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // SPA fallback so a cold offline start on /play still boots.
        navigateFallback: '/index.html',
      },
      manifest: {
        name: 'Bricks',
        short_name: 'Bricks',
        description: 'Minimalist brick-breaking, done well.',
        theme_color: '#d9480f',
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
  // The parlor sibling workspace has its own node_modules (peer deps mirrored
  // as devDeps for its standalone tests) — dedupe the stateful/singleton
  // libraries so linked @parlor/* source shares the app's copies.
  server: { fs: { allow: ['.', fileURLToPath(new URL('../..', import.meta.url)), parlorRoot] } },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom', '@mui/material', '@emotion/react', '@emotion/styled'],
  },
  optimizeDeps: {
    exclude: ['@parlor/arcade', '@parlor/solo', '@parlor/brand', '@parlor/harness', '@parlor/native'],
  },
});
