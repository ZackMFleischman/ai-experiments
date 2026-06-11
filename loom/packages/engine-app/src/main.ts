import {
  AudioBus,
  Clock,
  Stage,
  TimeBus,
  type FrameCtx,
  type SceneDef,
} from "@loom/runtime";
import { DEFAULT_WS_PORT, type InstanceStatus, type ScreenshotResult } from "@loom/sidecar/protocol";
import { WebGPURenderer } from "three/webgpu";
import liveScene from "../../../content/scenes/live.scene";
import { startBridge } from "./bridge";
import { Compositor } from "./compositor";
import { startConsoleChannel } from "./console-channel";
import { EngineApi } from "./engine-api";
import { FpsMeter } from "./fps";
import { getScenes } from "./scenes";
import { entryStatus, SessionStore } from "./session";

declare global {
  interface Window {
    __loom?: {
      sceneName: string | null;
      audioMode: string;
      bpm: number;
      rms: number;
      onsetCount: number;
      instanceError: string | null;
      frame: number;
      fps: number;
      live: string | null;
      staged: string | null;
      mix: number | null;
      panicked: boolean;
      agentCommitArmed: boolean;
      instances: Array<{
        id: string;
        scene: string;
        status: InstanceStatus;
        modulators: Array<{ path: string; type: string; error: string | null }>;
      }>;
    };
  }
}

const qs = new URLSearchParams(location.search);

const canvas = document.querySelector<HTMLCanvasElement>("#out");
const fpsEl = document.querySelector<HTMLElement>("#fps");
if (!canvas || !fpsEl) {
  throw new Error("index.html is missing #out or #fps");
}
// The Output window is a pure projector surface (R9.1): the fps readout is
// kept in the DOM (validators gate readiness on its text) but stays invisible
// unless diagnostics are asked for.
if (qs.get("hud") === "1") fpsEl.classList.add("show");

// R9.2: render at a fixed internal resolution; CSS object-fit: cover scales
// the canvas to any window without warping (crop, never stretch). Render cost
// and screenshot size stop depending on window/display size.
const RES = /^(\d+)x(\d+)$/.exec(qs.get("res") ?? "");
const RENDER_W = RES ? Number(RES[1]) : 1920;
const RENDER_H = RES ? Number(RES[2]) : 1080;

const renderer = new WebGPURenderer({ canvas, antialias: true });
const clock = new Clock();
const timeBus = new TimeBus(Number(qs.get("bpm")) || 120);
const audio = new AudioBus();
const fps = new FpsMeter(fpsEl);

const session = new SessionStore({ audio, time: timeBus });
const stage = new Stage();
const compositor = new Compositor(RENDER_W, RENDER_H);

// The barrel binding goes stale when ./scenes hot-updates; HMR swaps it below.
let currentScenes = getScenes;

/**
 * The instance that tracks live.scene.ts. Its id is "boot" — "live" is an
 * alias for whatever the Stage currently routes to output, not an id.
 */
const BOOT_ID = "boot";

/**
 * NFR-5 for the boot instance: build the new one first; a failed
 * build/rebuild keeps whatever is running — never go black.
 */
function trySwapLive(def: SceneDef): boolean {
  if (session.get(BOOT_ID)) return session.rebuild(BOOT_ID, def);
  try {
    session.create(def, BOOT_ID);
    if (stage.live === null) stage.adoptLive(BOOT_ID);
    return true;
  } catch (err) {
    console.error(`[loom] scene "${def?.name ?? "?"}" rejected; keeping previous`, err);
    return false;
  }
}

async function startAudio(): Promise<void> {
  if (qs.get("audio") === "test") {
    audio.startTest(timeBus.bpm);
    return;
  }
  try {
    await audio.startMic();
  } catch (err) {
    console.warn("[loom] mic unavailable; falling back to test signal", err);
    audio.startTest(timeBus.bpm);
  }
}

await renderer.init();
// updateStyle=false: CSS owns the canvas's on-screen size (object-fit: cover).
renderer.setSize(RENDER_W, RENDER_H, false);
await startAudio();

// Audio input devices, cached for the (synchronous) session snapshot.
let audioDevices: Array<{ id: string; label: string }> = [];
async function refreshAudioDevices(): Promise<void> {
  const devices = await audio.listInputDevices();
  audioDevices = devices.map((d, i) => ({ id: d.deviceId, label: d.label || `input ${i + 1}` }));
}
void refreshAudioDevices();
navigator.mediaDevices?.addEventListener("devicechange", () => void refreshAudioDevices());

const debugOnsets = audio.onset({ band: "bass", threshold: 0.22 });
let onsetCount = 0;
let latestFrame: FrameCtx = { frame: 0, now: 0, dt: 0 };
let currentMix: number | null = null;
let lastDirectiveHold = false;

// Screenshot requests for the canvas resolve inside the render loop: the
// drawing buffer is only readable in the same task that rendered it.
const pendingShots: Array<{
  resolve: (s: ScreenshotResult) => void;
  reject: (e: Error) => void;
}> = [];

window.__loom = {
  sceneName: null,
  audioMode: audio.mode,
  bpm: timeBus.bpm,
  rms: 0,
  onsetCount: 0,
  instanceError: null,
  frame: 0,
  fps: 0,
  live: null,
  staged: null,
  mix: null,
  panicked: false,
  agentCommitArmed: false,
  instances: [],
};

trySwapLive(liveScene);

const api = new EngineApi(
  {
    renderer,
    canvas,
    session,
    stage,
    audio,
    time: timeBus,
    getScenes: () => currentScenes(),
    latestFrame: () => latestFrame,
    captureCanvas: () =>
      new Promise((resolve, reject) => {
        if (lastDirectiveHold) {
          reject(new Error("output is held (PANIC) — resume before taking a live screenshot"));
          return;
        }
        pendingShots.push({ resolve, reject });
      }),
    fps: () => fps.current,
    rms: () => window.__loom?.rms ?? 0,
    onsetCount: () => onsetCount,
    currentMix: () => currentMix,
    audioDevices: () => audioDevices,
    refreshAudioDevices: () => void refreshAudioDevices(),
  },
  { agentCommitArmed: qs.get("agentCommit") === "1" },
);

// `?ws=` lets validation runs use an isolated sidecar port so they never
// collide with (or silently talk to) a live performance session's sidecar.
startBridge(`ws://localhost:${Number(qs.get("ws")) || DEFAULT_WS_PORT}`, api);
startConsoleChannel(api);

renderer.setAnimationLoop((tMs) => {
  const f = clock.tick(tMs);
  latestFrame = f;
  timeBus.tick(f);
  audio.update(f);
  onsetCount += debugOnsets.poll(f).length;

  const directive = stage.tick(f);
  currentMix = directive.mode === "crossfade" ? directive.mix : null;
  lastDirectiveHold = directive.mode === "hold";
  // Modulators write CPU-side before any leg renders; PANIC holds them too (FR-10).
  if (directive.mode !== "hold") session.tickModulators(f);
  compositor.render(renderer, f, directive, session);
  api.captureLiveMirror(directive.mode); // same-task canvas read for the live tile
  fps.tick();

  if (pendingShots.length > 0) {
    const waiting = pendingShots.splice(0);
    if (directive.mode === "hold") {
      const e = new Error("output is held (PANIC)");
      for (const w of waiting) w.reject(e);
    } else {
      try {
        const url = canvas.toDataURL("image/png");
        const shot: ScreenshotResult = {
          mime: "image/png",
          base64: url.slice(url.indexOf(",") + 1),
          width: canvas.width,
          height: canvas.height,
          frame: f.frame,
        };
        for (const w of waiting) w.resolve(shot);
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        for (const w of waiting) w.reject(e);
      }
    }
  }

  const liveEntry = stage.live != null ? session.get(stage.live) : undefined;
  const dbg = window.__loom!;
  dbg.sceneName = liveEntry?.sceneName ?? null;
  dbg.audioMode = audio.mode;
  dbg.bpm = timeBus.bpm;
  dbg.rms = audio.rms.get(f);
  dbg.onsetCount = onsetCount;
  dbg.instanceError = liveEntry?.instance.error != null ? String(liveEntry.instance.error) : null;
  dbg.frame = f.frame;
  dbg.fps = fps.current;
  dbg.live = stage.live;
  dbg.staged = stage.staged;
  dbg.mix = currentMix;
  dbg.panicked = stage.panicked;
  dbg.agentCommitArmed = api.agentCommitArmed;
  dbg.instances = [...session.entries.values()].map((e) => ({
    id: e.id,
    scene: e.sceneName,
    status: entryStatus(e),
    modulators: e.modulators.list().map((m) => ({ path: m.path, type: m.spec.type, error: m.error })),
  }));
});

// Tap tempo on "t"; any click also unblocks a suspended AudioContext.
window.addEventListener("keydown", (e) => {
  if (e.key === "t") timeBus.tap(performance.now() / 1000);
});
window.addEventListener("pointerdown", () => audio.resume());

if (import.meta.hot) {
  // Compile errors never reach these callbacks (Vite withholds the update);
  // build()-time throws are caught per instance; render-time throws freeze
  // the instance (NFR-2). All three keep the previous pixels alive.
  import.meta.hot.accept("../../../content/scenes/live.scene", (mod) => {
    if (!mod?.default) {
      console.warn("[loom] hot update carried no scene default export; keeping previous");
      return;
    }
    const ok = trySwapLive(mod.default as SceneDef);
    console.info(
      ok
        ? `[loom] scene hot-swapped: ${session.get(BOOT_ID)?.sceneName}`
        : "[loom] scene rejected; previous still live",
    );
  });

  // Any scene file edit bubbles through the barrel: rebuild only instances
  // whose def identity actually changed (NFR-5), destroy ones whose scene
  // file vanished.
  import.meta.hot.accept("./scenes", (mod) => {
    if (!mod?.getScenes) return;
    currentScenes = mod.getScenes as typeof getScenes;
    const map = currentScenes();
    for (const entry of [...session.entries.values()]) {
      if (entry.id === BOOT_ID) continue; // owned by the live.scene accept above
      const def = map.get(entry.sceneName);
      if (!def) {
        console.warn(`[loom] scene "${entry.sceneName}" removed; destroying instance "${entry.id}"`);
        stage.onInstanceDestroyed(entry.id);
        session.destroy(entry.id);
      } else if (def !== entry.def) {
        const ok = session.rebuild(entry.id, def);
        console.info(
          ok
            ? `[loom] instance "${entry.id}" rebuilt (${def.name})`
            : `[loom] instance "${entry.id}" rejected the update; previous still running`,
        );
      }
    }
  });
}
