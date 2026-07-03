import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Minimal PWA setup (T3.12, subset of T5.1): manifest + generated icons +
// default precache so the shell is installable; the full offline story,
// coach marks and push land in M5.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
});
