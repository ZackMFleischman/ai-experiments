import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Content-Security-Policy injected into index.html at BUILD time only. In dev,
// Vite needs inline scripts + an HMR websocket, which a strict CSP would break —
// so we skip it there and rely on the production headers.
//
// Notable allowances (see DESIGN.md "Technical constraints"):
//   • frame-src youtube        — the cams are YouTube live embeds.
//   • img-src i.ytimg.com      — facade poster thumbnails.
//   • script-src wasm-unsafe-eval + blob:, worker-src blob:, connect-src blob: + jsdelivr
//                              — ffmpeg.wasm (single-threaded) loads its core in a blob
//                                worker to stitch the Daily Reel, fetching the core from
//                                jsDelivr (it's >25 MiB so it can't be self-hosted on
//                                Cloudflare Pages). No COOP/COEP: cross-origin isolation
//                                would break the YouTube frames.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://i.ytimg.com https://*.ytimg.com",
  "media-src 'self' blob:",
  "connect-src 'self' blob: https://*.ytimg.com https://cdn.jsdelivr.net",
  'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
  "manifest-src 'self'",
  "base-uri 'self'",
].join('; ');

function cspOnBuild(): Plugin {
  return {
    name: 'katmai-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '</title>',
        `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  build: { sourcemap: true },
  plugins: [
    react(),
    cspOnBuild(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // wasm/mp4 are deliberately absent: the ffmpeg core (~25 MB) and generated
      // clips must not bloat the precache — they load on demand at runtime.
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
      manifest: {
        name: 'Katmai Bearcam Dashboard',
        short_name: 'Bearcams',
        description: 'Every Katmai / Brooks Falls live bear cam in one dashboard.',
        theme_color: '#0b3d2e',
        background_color: '#0b1410',
        display: 'standalone',
        orientation: 'any',
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
