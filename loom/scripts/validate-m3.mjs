// M3 acceptance check: Stage & Console. An MCP client creates and stages a
// candidate; the Console (driven by Playwright like a human) auditions it,
// drags a slider, COMMITs (crossfade never goes black), and PANICs. The
// agent cannot touch LIVE unless commit is armed (?agentCommit=1 proves the
// override).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ARTIFACTS = join(ROOT, "artifacts");
const SCENE = join(ROOT, "content", "scenes", "live.scene.ts");
const PORT = 5200;
const WS_PORT = 7343;
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

const loomState = (page) => page.evaluate(() => ({ ...window.__loom, instances: window.__loom.instances }));

async function waitFor(fn, timeoutMs = 10_000, label = "condition") {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v) return v;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}`);
}

/** Average RGB of a center crop of a page screenshot. */
async function centerStats(page, savePath) {
  const buf = await page.screenshot(savePath ? { path: savePath } : {});
  const png = PNG.sync.read(buf);
  const cw = 200, chh = 200;
  const x0 = (png.width - cw) >> 1, y0 = (png.height - chh) >> 1;
  let r = 0, g = 0, b = 0;
  for (let y = y0; y < y0 + chh; y++) {
    for (let x = x0; x < x0 + cw; x++) {
      const i = (y * png.width + x) * 4;
      r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2];
    }
  }
  const n = cw * chh;
  return { r: r / n, g: g / n, b: b / n, lum: (r + g + b) / (3 * n) };
}

mkdirSync(ARTIFACTS, { recursive: true });
const PULSE_PIN = `export { default } from "./pulse.scene";\n`;
const originalScene = readFileSync(SCENE, "utf8");
writeFileSync(SCENE, PULSE_PIN);

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

  client = new Client({ name: "validate-m3", version: "0.0.0" });
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
    ],
  });
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const output = await context.newPage();
  await output.goto(OUTPUT_URL);
  await output.waitForFunction(
    () => /\d+ fps/.test(document.querySelector("#fps")?.textContent ?? ""),
    null,
    { timeout: 20_000 },
  );
  const consolePage = await context.newPage();
  await consolePage.goto(CONSOLE_URL);

  // 1. Tools + session shape.
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  check(
    "MCP exposes the 8 M3 tools",
    JSON.stringify(tools) ===
      JSON.stringify([
        "commit", "create_instance", "destroy_instance", "get_manifest",
        "get_session", "screenshot", "set_param", "stage",
      ]),
    tools.join(", "),
  );
  const session0 = await waitFor(async () => {
    const res = await client.callTool({ name: "get_session", arguments: {} });
    return res.isError ? null : toolJson(res);
  }, 15_000, "engine to connect to sidecar");
  check("session: boot instance is live", session0.live === "live" && session0.scene === "pulse",
    `live=${session0.live} scene=${session0.scene}`);
  check(
    "session: catalog scenes available",
    ["hello", "lava", "pulse"].every((s) => session0.availableScenes.includes(s)),
    session0.availableScenes.join(", "),
  );

  // 2. Console sees the engine: boot tile present.
  await consolePage.waitForSelector('.tile[data-id="live"]', { timeout: 10_000 });
  check("console shows the live tile", true);
  const liveBadge = await consolePage.$eval('.tile[data-id="live"] .live-badge', (el) => el.className);
  check("LIVE badge on the boot tile", liveBadge.includes("show"));

  // Decode a tile's thumbnail in-browser and return its average luminance.
  const tileThumbLum = (id) =>
    consolePage.evaluate(async (tileId) => {
      const img = document.querySelector(`.tile[data-id="${CSS.escape(tileId)}"] img`);
      if (!img?.src?.startsWith("data:image")) return null;
      const bmp = await createImageBitmap(await (await fetch(img.src)).blob());
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let l = 0;
      for (let i = 0; i < d.length; i += 4) l += (d[i] + d[i + 1] + d[i + 2]) / 3;
      return l / (c.width * c.height);
    }, id);

  // The LIVE tile's preview must show real pixels (regression: the canvas is
  // only readable in the render task — a stale-task read shows black).
  const liveLum = await waitFor(async () => {
    const l = await tileThumbLum("live");
    return l != null && l > 2 ? l : null;
  }, 10_000, "live tile thumbnail to be non-black");
  check("LIVE tile thumbnail shows real pixels", true, `lum ${liveLum.toFixed(1)}`);

  // 3. Agent creates a sandbox candidate.
  const created = toolJson(await callOk(client, "create_instance", { scene: "lava" }));
  check(
    "create_instance returns id + params",
    created.scene === "lava" && created.paramPaths.includes("size"),
    JSON.stringify(created),
  );
  const cid = created.instance;
  await consolePage.waitForSelector(`.tile[data-id="${cid}"]`, { timeout: 10_000 });
  check("candidate tile appears in the console", true);
  const thumb = await waitFor(
    () => consolePage.$eval(`.tile[data-id="${cid}"] img`, (img) => img.src || null).catch(() => null),
    10_000,
    "candidate thumbnail",
  );
  check("candidate thumbnail streams", thumb.startsWith("data:image/"), thumb.slice(0, 30));

  // 4. Agent eyes on the candidate (offscreen target, not the live canvas).
  const shotRes = await callOk(client, "screenshot", { instance: cid });
  const img = shotRes.content.find((c) => c.type === "image");
  const shotPng = PNG.sync.read(Buffer.from(img.data, "base64"));
  let lum = 0;
  for (let i = 0; i < shotPng.data.length; i += 4) {
    lum += (shotPng.data[i] + shotPng.data[i + 1] + shotPng.data[i + 2]) / 3;
  }
  lum /= shotPng.width * shotPng.height;
  writeFileSync(join(ARTIFACTS, "m3-1-candidate.png"), PNG.sync.write(shotPng));
  check("candidate screenshot renders (non-black)", lum > 1, `lum ${lum.toFixed(2)} @ ${shotPng.width}x${shotPng.height}`);

  // 5. Param panel drives the candidate.
  await consolePage.click(`.tile[data-id="${cid}"]`);
  await consolePage.waitForSelector('[data-path="size"]', { timeout: 5_000 });
  await consolePage.$eval('[data-path="size"]', (el) => {
    el.value = "0.25";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  // Range inputs snap to their step grid, so compare with tolerance.
  const sizeVal = await waitFor(async () => {
    const m = toolJson(await callOk(client, "get_manifest", { instance: cid }));
    return Math.abs(m.params.size.value - 0.25) < 0.01 ? m.params.size.value : null;
  }, 5_000, "slider write to land");
  check("console slider writes through to the manifest", sizeVal !== null, `size=${sizeVal}`);

  // 6. Stage via MCP; commit stays human-gated.
  const staged = toolJson(await callOk(client, "stage", { instance: cid }));
  check("agent staged the candidate", staged.staged === cid && staged.live === "live");
  await waitFor(
    () => consolePage.$(`.tile[data-id="${cid}"] .staged-badge.show`).then((h) => (h ? true : null)),
    5_000,
    "STAGED badge",
  );
  check("STAGED badge in the console", true);
  const blockedCommit = await client.callTool({ name: "commit", arguments: {} });
  check(
    "agent commit is blocked by default",
    blockedCommit.isError === true && /armed/i.test(blockedCommit.content[0].text),
    blockedCommit.content?.[0]?.text,
  );
  let st = await loomState(output);
  check("LIVE untouched by blocked commit", st.live === "live" && st.staged === cid);

  // 7. Human COMMIT: crossfade, never black, live pointer swaps.
  await consolePage.screenshot({ path: join(ARTIFACTS, "m3-2-console.png") });
  await consolePage.click("#commit");
  const midFade = await waitFor(async () => {
    const s = await loomState(output);
    return s.mix != null && s.mix > 0 ? s.mix : null;
  }, 5_000, "crossfade to start");
  const midStats = await centerStats(output, join(ARTIFACTS, "m3-3-midfade.png"));
  check("mid-fade frame is alive (not black)", midStats.lum > 1, `mix=${midFade.toFixed(2)} lum=${midStats.lum.toFixed(1)}`);
  await waitFor(async () => {
    const s = await loomState(output);
    return s.live === cid && s.staged === null && s.mix === null ? true : null;
  }, 10_000, "fade to finish and promote");
  check("COMMIT promoted the candidate to LIVE", true);
  st = await loomState(output);
  check("live scene is now lava", st.sceneName === "lava", `scene=${st.sceneName}`);
  const newLiveLum = await waitFor(async () => {
    const l = await tileThumbLum(cid);
    return l != null && l > 1 ? l : null;
  }, 10_000, "promoted tile thumbnail to be non-black");
  check("promoted LIVE tile thumbnail stays real", true, `lum ${newLiveLum.toFixed(1)}`);

  // 8. PANIC: pixels freeze, engine keeps ticking, RESUME recovers.
  await consolePage.click("#panic");
  await waitFor(async () => ((await loomState(output)).panicked ? true : null), 5_000, "panic");
  await sleep(300); // let the held frame settle
  const frameA = (await loomState(output)).frame;
  const holdA = await centerStats(output, join(ARTIFACTS, "m3-4-panic.png"));
  await sleep(500);
  const holdB = await centerStats(output);
  const frameB = (await loomState(output)).frame;
  const drift = Math.abs(holdA.r - holdB.r) + Math.abs(holdA.g - holdB.g) + Math.abs(holdA.b - holdB.b);
  check("PANIC holds the output pixels", drift < 1.5, `rgb drift ${drift.toFixed(2)} over 500 ms`);
  check("engine loop keeps ticking under PANIC", frameB > frameA + 10, `frames ${frameA}→${frameB}`);
  await consolePage.click("#panic"); // now reads RESUME
  await waitFor(async () => (!(await loomState(output)).panicked ? true : null), 5_000, "resume");
  check("RESUME releases the hold", true);

  // 9. Old live instance is destroyable now (and the LIVE one is protected).
  const protectedRes = await client.callTool({ name: "destroy_instance", arguments: { instance: cid } });
  check(
    "destroying the LIVE instance is refused",
    protectedRes.isError === true && /LIVE/i.test(protectedRes.content[0].text),
    protectedRes.content?.[0]?.text,
  );
  await callOk(client, "destroy_instance", { instance: "live" });
  await waitFor(
    () => consolePage.$('.tile[data-id="live"]').then((h) => (h ? null : true)),
    5_000,
    "old tile to disappear",
  );
  check("destroyed instance's tile disappears", true);

  // 10. ?agentCommit=1 arms the agent path (boot override).
  await output.goto(`${OUTPUT_URL}&agentCommit=1`);
  await output.waitForFunction(
    () => /\d+ fps/.test(document.querySelector("#fps")?.textContent ?? ""),
    null,
    { timeout: 20_000 },
  );
  const session1 = await waitFor(async () => {
    const res = await client.callTool({ name: "get_session", arguments: {} });
    if (res.isError) return null;
    const s = toolJson(res);
    return s.agentCommitArmed ? s : null;
  }, 15_000, "armed engine to reconnect");
  check("?agentCommit=1 arms agent commit", session1.agentCommitArmed === true);
  const c2 = toolJson(await callOk(client, "create_instance", { scene: "lava" }));
  await callOk(client, "stage", { instance: c2.instance });
  await callOk(client, "commit", { durationFrames: 10 });
  await waitFor(async () => {
    const s = await loomState(output);
    return s.live === c2.instance ? true : null;
  }, 10_000, "armed agent commit to land");
  check("armed agent commit crossfades to LIVE", true);
} catch (err) {
  check("validation run completed", false, String(err));
} finally {
  writeFileSync(SCENE, originalScene);
  if (client) await client.close().catch(() => {});
  if (browser) await browser.close();
  if (process.platform === "win32") {
    try { execSync(`taskkill /pid ${vite.pid} /T /F`, { stdio: "ignore" }); } catch {}
  } else {
    vite.kill("SIGTERM");
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
