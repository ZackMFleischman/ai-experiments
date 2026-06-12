import { execFile } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
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

// content/CATALOG.md is the library's search surface, but a live session edits
// modules/scenes via HMR and never runs `pnpm typecheck` — so the dev server
// regenerates the catalog itself. Failures are logged and swallowed: a
// half-written module must never break the dev server (never-go-black's cousin).
const catalogScript = fileURLToPath(new URL("../../scripts/build-catalog.mjs", import.meta.url));
const buildCatalog: Plugin = {
  name: "loom:catalog",
  configureServer(server) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const isCatalogSource = (file: string) => {
      const n = normalize(file);
      return (
        (n.includes(`${sep}content${sep}modules${sep}`) ||
          n.includes(`${sep}content${sep}scenes${sep}`)) &&
        n.endsWith(".ts")
      );
    };
    const schedule = (file: string) => {
      if (!isCatalogSource(file)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        execFile(process.execPath, [catalogScript], (err) => {
          if (err) server.config.logger.warn(`loom:catalog regen failed: ${err.message}`);
          else server.config.logger.info("loom:catalog → content/CATALOG.md regenerated");
        });
      }, 300);
    };
    server.watcher.on("add", schedule);
    server.watcher.on("change", schedule);
    server.watcher.on("unlink", schedule);
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

// State directory listing (Projects): GET /loom/state-list/<dir> returns the
// JSON basenames under content/state/<dir>/ — the project switcher's source of
// truth, so a project file dropped in via git shows up too.
const stateListApi: Plugin = {
  name: "loom:state-list",
  configureServer(server) {
    const stateDir = fileURLToPath(new URL("../../content/state", import.meta.url));
    server.middlewares.use("/loom/state-list/", (req, res) => {
      if (req.method !== "GET") {
        res.statusCode = 405;
        res.end();
        return;
      }
      const dir = decodeURIComponent((req.url ?? "").replace(/^\//, "").split("?")[0]!);
      if (!/^[a-zA-Z0-9_-]+$/.test(dir)) {
        res.statusCode = 400;
        res.end("bad dir name");
        return;
      }
      const full = normalize(join(stateDir, dir));
      if (!full.startsWith(normalize(stateDir))) {
        res.statusCode = 400;
        res.end("bad dir name");
        return;
      }
      let names: string[] = [];
      try {
        names = readdirSync(full)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(/\.json$/, ""))
          .sort();
      } catch {
        // no such dir yet — an empty list, not an error
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(names));
    });
  },
};

// Saved chains (M6 "save chain as effect"): POST /loom/effects/<name> writes a
// data-only content/modules/effects/chains/<name>.chain.json that the effects
// barrel then offers as a composite. Same belt-and-braces as loom:state: JSON
// only, name validated, writes confined to the chains directory.
const effectsApi: Plugin = {
  name: "loom:effects",
  configureServer(server) {
    const chainsDir = fileURLToPath(
      new URL("../../content/modules/effects/chains", import.meta.url),
    );
    server.middlewares.use("/loom/effects/", (req, res) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end();
        return;
      }
      const name = decodeURIComponent((req.url ?? "").replace(/^\//, "").split("?")[0]!);
      if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) {
        res.statusCode = 400;
        res.end("bad effect name");
        return;
      }
      const file = normalize(join(chainsDir, `${name}.chain.json`));
      if (!file.startsWith(normalize(chainsDir))) {
        res.statusCode = 400;
        res.end("bad effect name");
        return;
      }
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        try {
          JSON.parse(raw); // store JSON only — a corrupt write must never land
          mkdirSync(chainsDir, { recursive: true });
          writeFileSync(file, raw);
          res.statusCode = 204;
          res.end();
        } catch {
          res.statusCode = 400;
          res.end("body must be JSON");
        }
      });
    });
  },
};

export default defineConfig({
  plugins: [watchContent, buildCatalog, stateApi, stateListApi, effectsApi],
  // Multi-page production build for the static preview deploy (Cloudflare Pages):
  // the Output window (/), the Console cockpit (/console.html), and the staged
  // preview (/staged.html) all ship so the preview is "view + tweak", not just a
  // projector. The dev server is unaffected — it already serves every root HTML.
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        console: fileURLToPath(new URL("./console.html", import.meta.url)),
        staged: fileURLToPath(new URL("./staged.html", import.meta.url)),
      },
    },
  },
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
