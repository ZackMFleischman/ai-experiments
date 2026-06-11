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
import { Overlay } from "./overlay";
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
      instances: Array<{ id: string; scene: string; status: InstanceStatus }>;
    };
  }
}

const qs = new URLSearchParams(location.search);

const canvas = document.querySelector<HTMLCanvasElement>("#out");
const fpsEl = document.querySelector<HTMLElement>("#fps");
const statusEl = document.querySelector<HTMLElement>("#status");
if (!canvas || !fpsEl || !statusEl) {
  throw new Error("index.html is missing #out, #fps or #status");
}

const renderer = new WebGPURenderer({ canvas, antialias: true });
const clock = new Clock();
const timeBus = new TimeBus(Number(qs.get("bpm")) || 120);
const audio = new AudioBus();
const fps = new FpsMeter(fpsEl);
const overlay = new Overlay(statusEl);

const session = new SessionStore({ audio, time: timeBus });
const stage = new Stage();
const compositor = new Compositor(window.innerWidth, window.innerHeight);

// The barrel binding goes stale when ./scenes hot-updates; HMR swaps it below.
let currentScenes = getScenes;

/**
 * NFR-5 for the boot "live" instance: build the new one first; a failed
 * build/rebuild keeps whatever is running — never go black.
 */
function trySwapLive(def: SceneDef): boolean {
  if (session.get("live")) return session.rebuild("live", def);
  try {
    session.create(def, "live");
    if (stage.live === null) stage.adoptLive("live");
    return true;
  } catch (err) {
    console.error(`[loom] scene "${def?.name ?? "?"}" rejected; keeping previous`, err);
    return false;
  }
}

function resize(): void {
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  compositor.resize(
    Math.round(window.innerWidth * window.devicePixelRatio),
    Math.round(window.innerHeight * window.devicePixelRatio),
  );
}
window.addEventListener("resize", resize);

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
resize();
await startAudio();

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
  compositor.render(renderer, f, directive, session);
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
  const error = liveEntry?.instance.error != null;
  overlay.update({
    scene: liveEntry?.sceneName ?? null,
    audioMode: audio.mode,
    bpm: timeBus.bpm,
    rms: audio.rms.get(f),
    error,
  });
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
  }));
});

// Tap tempo on "t"; any click also unblocks a suspended AudioContext.
window.addEventListener("keydown", (e) => {
  if (e.key === "t") timeBus.tap(performance.now() / 1000);
});
window.addEventListener("pointerdown", () => audio.resume());

void audio.listInputDevices().then((devices) => {
  void overlay.populateDevices(devices, audio.mode === "test" ? "test" : "mic:");
  overlay.deviceSelect.addEventListener("change", () => {
    const v = overlay.deviceSelect.value;
    if (v === "test") {
      audio.startTest(timeBus.bpm);
    } else {
      void audio.startMic(v.slice(4) || undefined).catch((err) => {
        console.warn("[loom] mic switch failed; test signal", err);
        audio.startTest(timeBus.bpm);
      });
    }
  });
});

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
        ? `[loom] scene hot-swapped: ${session.get("live")?.sceneName}`
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
      if (entry.id === "live") continue; // owned by the live.scene accept above
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
