import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

// content/ sits outside this package's root, so Vite's watcher never learns
// about NEW files created there: import.meta.glob("../../../content/scenes/*")
// then misses additions until something else invalidates the scenes barrel.
// Watching the directory explicitly makes file add/unlink events reach Vite's
// glob-importer invalidation, so a new *.scene.ts is hot-registered on save.
const watchContent: Plugin = {
  name: "loom:watch-content",
  configureServer(server) {
    server.watcher.add(fileURLToPath(new URL("../../content", import.meta.url)));
  },
};

export default defineConfig({
  plugins: [watchContent],
  resolve: {
    alias: {
      // Single source of truth for runtime resolution so content/ scenes
      // (outside any package) resolve it too.
      "@loom/runtime": fileURLToPath(new URL("../runtime/src/index.ts", import.meta.url)),
      // The WS wire contract shared with the sidecar (browser-safe module).
      "@loom/sidecar/protocol": fileURLToPath(new URL("../sidecar/src/protocol.ts", import.meta.url)),
    },
  },
  server: {
    // Never-go-black: a compile error must not paint over the Output window.
    hmr: { overlay: false },
    fs: {
      allow: [fileURLToPath(new URL("../..", import.meta.url))],
    },
  },
});
