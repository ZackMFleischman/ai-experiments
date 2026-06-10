import {
  AudioBus,
  Clock,
  TimeBus,
  buildInstance,
  type Instance,
  type SceneDef,
} from "@loom/runtime";
import { WebGPURenderer } from "three/webgpu";
import liveScene from "../../../content/scenes/live.scene";
import { FpsMeter } from "./fps";
import { Overlay } from "./overlay";

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

let instance: Instance | null = null;

/**
 * NFR-5 rebuild-on-change: build the new instance first; only when that
 * succeeds is the old one disposed. A failed build keeps the old instance
 * rendering — never go black.
 */
function trySwap(def: SceneDef): boolean {
  try {
    const next = buildInstance(def, { audio, time: timeBus });
    instance?.dispose();
    instance = next;
    return true;
  } catch (err) {
    console.error(`[loom] scene "${def?.name ?? "?"}" rejected; keeping previous`, err);
    return false;
  }
}

function resize(): void {
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
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

// Debug surface for validation scripts and agent eyes (pre-MCP).
const debugOnsets = audio.onset({ band: "bass", threshold: 0.22 });
let onsetCount = 0;
window.__loom = {
  sceneName: null,
  audioMode: audio.mode,
  bpm: timeBus.bpm,
  rms: 0,
  onsetCount: 0,
  instanceError: null,
  frame: 0,
};

trySwap(liveScene);

renderer.setAnimationLoop((tMs) => {
  const f = clock.tick(tMs);
  timeBus.tick(f);
  audio.update(f);
  onsetCount += debugOnsets.poll(f).length;
  instance?.renderFrame(renderer, f);
  fps.tick();

  const error = instance?.error != null;
  overlay.update({
    scene: instance?.sceneName ?? null,
    audioMode: audio.mode,
    bpm: timeBus.bpm,
    rms: audio.rms.get(f),
    error,
  });
  const dbg = window.__loom!;
  dbg.sceneName = instance?.sceneName ?? null;
  dbg.audioMode = audio.mode;
  dbg.bpm = timeBus.bpm;
  dbg.rms = audio.rms.get(f);
  dbg.onsetCount = onsetCount;
  dbg.instanceError = error ? String(instance!.error) : null;
  dbg.frame = f.frame;
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
  // Compile errors never reach this callback (Vite withholds the update);
  // build()-time throws are caught in trySwap; render-time throws freeze
  // the instance (NFR-2). All three keep the previous pixels alive.
  import.meta.hot.accept("../../../content/scenes/live.scene", (mod) => {
    if (!mod?.default) {
      console.warn("[loom] hot update carried no scene default export; keeping previous");
      return;
    }
    const ok = trySwap(mod.default as SceneDef);
    console.info(
      ok ? `[loom] scene hot-swapped: ${instance?.sceneName}` : "[loom] scene rejected; previous still live",
    );
  });
}
