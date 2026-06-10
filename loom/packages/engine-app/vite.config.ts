import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      // Single source of truth for runtime resolution so content/ scenes
      // (outside any package) resolve it too.
      "@loom/runtime": fileURLToPath(new URL("../runtime/src/index.ts", import.meta.url)),
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
