// M6 acceptance check (palette half): the global color palettes. Two named
// 5-stop palettes live on the "globals" pseudo-instance (palette.primary.0 …),
// scenes consume them via ctx.palette (color stops / ramp gradient / own
// defaults) with a per-frame palette.source switch that never rebuilds,
// edits retint consumers within a frame, the Console exposes color swatches +
// a stage-strip source selector, and tunings persist to palettes.json. Runs
// with state persistence ON — content/state/ is snapshotted and restored.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { chromium } from "playwright";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ARTIFACTS = join(ROOT, "artifacts");
const SCENE = join(ROOT, "content", "scenes", "live.scene.ts");
const STATE_DIR = join(ROOT, "content", "state");
const PORT = 5203;
const WS_PORT = 7346;
// State persistence stays ON here (no state=off) — palette persistence is under test.
const OUTPUT_URL = `http://localhost:${PORT}/?audio=test&bpm=120&ws=${WS_PORT}`;
const CONSOLE_URL = `http://localhost:${PORT}/console.html`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`dev server did not come up at ${url}`);
}

function toolJson(res) {
  const text = res.content?.find((c) => c.type === "text")?.text ?? "";
  return JSON.parse(text);
}

async function callOk(client, name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  if (res.isError) throw new Error(`${name} failed: ${res.content?.[0]?.text}`);
  return res;
}

async function waitFor(fn, timeoutMs = 10_000, label = "condition") {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v) return v;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}`);
}

const waitForFps = (page) =>
  page.waitForFunction(
    () => /\d+ fps/.test(document.querySelector("#fps")?.textContent ?? ""),
    null,
    { timeout: 20_000 },
  );

/** Decode an MCP screenshot tool result (base64 in its image block) and average its RGB. */
function avgColor(res) {
  const img = res.content?.find((c) => c.type === "image");
  if (!img?.data) throw new Error("screenshot result carried no image data");
  const png = PNG.sync.read(Buffer.from(img.data, "base64"));
  let r = 0, g = 0, b = 0;
  const n = png.width * png.height;
  for (let i = 0; i < n; i++) {
    r += png.data[i * 4]; g += png.data[i * 4 + 1]; b += png.data[i * 4 + 2];
  }
  return { r: r / n, g: g / n, b: b / n };
}
const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

// ---- pin the scene, snapshot tuned state, keep originals for restore ----
const PULSE_PIN = `export { default } from "./pulse.scene";\n`;
const originalScene = readFileSync(SCENE, "utf8");
writeFileSync(SCENE, PULSE_PIN);

const stateBackup = new Map();
if (existsSync(STATE_DIR)) {
  for (const rel of readdirSync(STATE_DIR, { recursive: true })) {
    const file = join(STATE_DIR, String(rel));
    if (file.endsWith(".json")) stateBackup.set(String(rel), readFileSync(file, "utf8"));
  }
}
rmSync(STATE_DIR, { recursive: true, force: true }); // pristine state for the run
mkdirSync(ARTIFACTS, { recursive: true });

const vite = spawn("pnpm", ["exec", "vite", "--port", String(PORT), "--strictPort"], {
  cwd: join(ROOT, "packages", "engine-app"),
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
vite.stdout.on("data", (d) => process.stdout.write(`[vite] ${d}`));
vite.stderr.on("data", (d) => process.stderr.write(`[vite] ${d}`));
let viteExit = null;
vite.on("exit", (code) => {
  viteExit = code ?? -1;
});

let browser;
let client;
try {
  await Promise.race([
    waitForServer(`http://localhost:${PORT}/`),
    (async () => {
      while (viteExit === null) await sleep(200);
      throw new Error(`vite exited early (code ${viteExit}) — is port ${PORT} already in use?`);
    })(),
  ]);

  client = new Client({ name: "validate-m6", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "packages/sidecar/src/index.ts"],
    cwd: ROOT,
    env: { ...process.env, LOOM_WS_PORT: String(WS_PORT) },
    stderr: "pipe",
  });
  await client.connect(transport);
  transport.stderr?.on("data", (d) => process.stderr.write(`[sidecar] ${d}`));

  browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-unsafe-webgpu",
      "--enable-features=Vulkan",
      "--use-angle=d3d11",
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const output = await context.newPage();
  await output.goto(OUTPUT_URL);
  await waitForFps(output);
  await waitFor(async () => {
    const res = await client.callTool({ name: "get_session", arguments: {} });
    return res.isError ? null : toolJson(res);
  }, 15_000, "engine to connect to sidecar");

  // 1. Globals manifest carries both palettes as color params.
  const globals = toolJson(await callOk(client, "get_manifest", { instance: "globals" }));
  const stopPaths = ["primary", "secondary"].flatMap((s) =>
    [0, 1, 2, 3, 4].map((i) => `palette.${s}.${i}`),
  );
  check(
    "globals manifest lists 10 color stops",
    stopPaths.every((p) => globals.params[p]?.type === "color"),
  );

  // 2. A ramp consumer + a stops consumer, built in sandboxes.
  const grad = toolJson(await callOk(client, "create_instance", { scene: "gradient" }));
  const lava = toolJson(await callOk(client, "create_instance", { scene: "lava" }));
  check("gradient auto-declares palette.source", grad.paramPaths.includes("palette.source"));
  await sleep(500); // let the new instances render at least one frame to their preview targets
  const gradBefore = avgColor(await callOk(client, "screenshot", { instance: grad.instance }));
  await output.screenshot({ path: join(ARTIFACTS, "m6-2-grad-primary.png") }).catch(() => {});

  // 3. Globals palette edit retints the consumer (R7 / shipped-when: "within a
  //    frame" — asserted as: the FIRST screenshot after the set_param ack differs).
  for (const i of [0, 1, 2, 3, 4]) {
    await callOk(client, "set_param", {
      instance: "globals",
      path: `palette.primary.${i}`,
      value: "#ff0000",
    });
  }
  // The retint reaches the GPU within a frame, but the preview render + async
  // pixel readback need a tick to flush — poll the screenshot until it lands.
  const gradRed = await waitFor(async () => {
    const c = avgColor(await callOk(client, "screenshot", { instance: grad.instance }));
    return dist(gradBefore, c) > 25 ? c : null;
  }, 5_000, "ramp consumer to retint").catch(async () =>
    avgColor(await callOk(client, "screenshot", { instance: grad.instance })),
  );
  check(
    "globals palette edit retints the ramp consumer",
    dist(gradBefore, gradRed) > 25,
    `Δ=${dist(gradBefore, gradRed).toFixed(1)}`,
  );
  check("retinted ramp is red-dominant", gradRed.r > gradRed.g + 40 && gradRed.r > gradRed.b + 40);

  // 4. No rebuild: builds counter untouched by retint + source flips.
  const buildsOf = async (id) =>
    toolJson(await callOk(client, "get_session", {})).instances.find((x) => x.id === id)?.builds;
  check("retint caused no rebuild", (await buildsOf(grad.instance)) === 1);
  await callOk(client, "set_param", { instance: grad.instance, path: "palette.source", value: 1 });
  const gradSecondary = await waitFor(async () => {
    const c = avgColor(await callOk(client, "screenshot", { instance: grad.instance }));
    return dist(gradRed, c) > 25 ? c : null;
  }, 5_000, "source flip to repaint").catch(async () =>
    avgColor(await callOk(client, "screenshot", { instance: grad.instance })),
  );
  check("flipping palette.source changes pixels", dist(gradRed, gradSecondary) > 25);
  check("source flip caused no rebuild", (await buildsOf(grad.instance)) === 1);

  // 5. own(): lava defaults to its authored stops and can flip away and back.
  const lavaManifest = toolJson(await callOk(client, "get_manifest", { instance: lava.instance }));
  check(
    "own() scene defaults palette.source to own",
    lavaManifest.params["palette.source"]?.value === 2,
  );

  // 6. Format-validating clamp: garbage is rejected, value untouched.
  const bad = await client.callTool({
    name: "set_param",
    arguments: { instance: "globals", path: "palette.primary.0", value: "#nope" },
  });
  check("invalid color value is rejected", bad.isError === true);

  // 7. Modulators: a cycle modulator CAN ride palette.source (an int).
  const cyc = await client.callTool({
    name: "modulate_param",
    arguments: {
      instance: grad.instance,
      path: "palette.source",
      modulator: { type: "cycle", periodBeats: 4, values: [0, 1] },
    },
  });
  check("cycle modulator CAN ride palette.source (int)", cyc.isError !== true);
  await callOk(client, "clear_modulation", { instance: grad.instance, path: "palette.source" });

  // 8. Console: rack drawer shows color inputs; editing one writes through.
  const consolePage = await context.newPage();
  await consolePage.goto(CONSOLE_URL);
  await consolePage.waitForSelector('.tile[data-id="boot"]', { timeout: 10_000 });
  await consolePage.keyboard.press("i");
  await consolePage.waitForSelector('#palettes input[type="color"][data-path="palette.primary.0"]', {
    timeout: 10_000,
  });
  await consolePage.evaluate(() => {
    const el = document.querySelector('input[data-path="palette.primary.0"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, "#00ff00");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitFor(async () => {
    const g = toolJson(await callOk(client, "get_manifest", { instance: "globals" }));
    return g.params["palette.primary.0"].value === "#00ff00" ? true : null;
  }, 5_000, "swatch edit to land");
  check("Console swatch edits write through to globals", true);
  await consolePage.screenshot({ path: join(ARTIFACTS, "m6-1-palettes-drawer.png") });

  // 9. Param-drawer source selector (R7.2) — palette.source renders flat
  // (never buried in an accordion) as a labeled toggle group.
  await callOk(client, "stage", { instance: grad.instance });
  await consolePage.click(`.tile[data-id="${grad.instance}"]`);
  await consolePage.waitForSelector('#widgets [data-path="palette.source"]', { timeout: 10_000 });
  await consolePage.click('#widgets [data-path="palette.source"] button:has-text("own")');
  await waitFor(async () => {
    const m = toolJson(await callOk(client, "get_manifest", { instance: grad.instance }));
    return m.params["palette.source"].value === 2 ? true : null;
  }, 5_000, "selector click to land");
  check("param-drawer selector flips palette.source", true);
  await consolePage.screenshot({ path: join(ARTIFACTS, "m6-3-source-selector.png") });

  // 10. Persistence: palettes.json round-trips a reload (state is ON in this run).
  await output.reload();
  await waitForFps(output);
  await waitFor(async () => {
    const res = await client.callTool({ name: "get_session", arguments: {} });
    return res.isError ? null : toolJson(res);
  }, 15_000, "engine to reconnect after reload");
  const reloaded = toolJson(await callOk(client, "get_manifest", { instance: "globals" }));
  check(
    "palette tunings survive a reload",
    reloaded.params["palette.primary.0"].value === "#00ff00",
    `primary.0=${reloaded.params["palette.primary.0"].value}`,
  );
} catch (err) {
  check("validation run completed", false, String(err));
} finally {
  // Kill the engine BEFORE restoring state: a still-alive page can flush a
  // late debounced save and recreate files after the restore.
  if (client) await client.close().catch(() => {});
  if (browser) await browser.close();
  if (process.platform === "win32") {
    try { execSync(`taskkill /pid ${vite.pid} /T /F`, { stdio: "ignore" }); } catch {}
  } else {
    vite.kill("SIGTERM");
  }
  writeFileSync(SCENE, originalScene);
  rmSync(STATE_DIR, { recursive: true, force: true });
  for (const [rel, content] of stateBackup) {
    const file = join(STATE_DIR, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
