// ported from hive/packages/app/vite.config.ts (adapted)
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const parlorRoot = fileURLToPath(new URL('../../../parlor', import.meta.url));

// PWA plugin (manifest + SW) attaches at T3.12/T5.1. The parlor entries are
// the §1 source-link wiring: Vite must be allowed to serve the sibling
// workspace and must transform (not prebundle) its linked TS source (§8.11).
export default defineConfig({
  build: { sourcemap: true }, // published maps: debuggability > obscurity here
  plugins: [react()],
  server: { fs: { allow: ['.', parlorRoot] } },
  optimizeDeps: {
    exclude: ['@parlor/core', '@parlor/web', '@parlor/server', '@parlor/harness'],
  },
});
