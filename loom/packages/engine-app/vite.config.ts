import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
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

// Tuned-state persistence (R6.2): GET/POST /loom/state/<name> reads/writes
// content/state/<name>.json. Vite is LOOM's standing server, so the sidecar
// stays optional (R4.5) and state files are plain text in git (NFR-4).
const stateApi: Plugin = {
  name: "loom:state",
  configureServer(server) {
    const stateDir = fileURLToPath(new URL("../../content/state", import.meta.url));
    server.middlewares.use("/loom/state/", (req, res) => {
      const name = decodeURIComponent((req.url ?? "").replace(/^\//, "").split("?")[0]!);
      if (!/^[a-zA-Z0-9_\-/]+$/.test(name) || name.includes("..")) {
        res.statusCode = 400;
        res.end("bad state name");
        return;
      }
      const file = normalize(join(stateDir, `${name}.json`));
      if (!file.startsWith(normalize(stateDir))) {
        res.statusCode = 400;
        res.end("bad state name");
        return;
      }
      if (req.method === "GET") {
        try {
          const body = readFileSync(file, "utf8");
          res.setHeader("content-type", "application/json");
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.end("{}");
        }
        return;
      }
      if (req.method === "POST") {
        let raw = "";
        req.on("data", (chunk) => (raw += chunk));
        req.on("end", () => {
          try {
            JSON.parse(raw); // store JSON only — a corrupt write must never land
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, raw);
            res.statusCode = 204;
            res.end();
          } catch {
            res.statusCode = 400;
            res.end("body must be JSON");
          }
        });
        return;
      }
      res.statusCode = 405;
      res.end();
    });
  },
};

export default defineConfig({
  plugins: [watchContent, stateApi],
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
