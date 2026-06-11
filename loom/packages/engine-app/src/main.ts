import {
  AudioBus,
  BindingStore,
  Clock,
  InputRegistry,
  MidiBus,
  Stage,
  TimeBus,
  type FrameCtx,
  type InputsDef,
  type SceneDef,
} from "@loom/runtime";
import { DEFAULT_WS_PORT, type InstanceStatus, type ScreenshotResult } from "@loom/sidecar/protocol";
import { WebGPURenderer } from "three/webgpu";
import inputsDef from "../../../content/inputs";
import liveScene from "../../../content/scenes/live.scene";
import { startBridge } from "./bridge";
import { Compositor } from "./compositor";
import { startConsoleChannel } from "./console-channel";
import { EngineApi } from "./engine-api";
import { FpsMeter } from "./fps";
import { getScenes } from "./scenes";
import { entryStatus, SessionStore } from "./session";
import { StateClient } from "./state";

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
      /** Input-rack channel values (rack meters / validation). */
      inputs: Record<string, number>;
      /** Mocked-hardware hook: feeds the same path as a real CC message. */
      midiInject: (cc: number, ch: number, value01: number) => void;
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

// The input rack (R6): named channels over the audio/MIDI buses, tuned via
// the globals manifest. defineInputs failures keep the previous rack —
// never-go-black covers the rack too.
const midi = new MidiBus();
void midi.init();
const inputs = new InputRegistry({ audio, midi });
function tryDefineInputs(def: InputsDef): boolean {
  try {
    inputs.define(def);
    return true;
  } catch (err) {
    console.error("[loom] content/inputs.ts rejected; keeping previous rack", err);
    return false;
  }
}
tryDefineInputs(inputsDef);

const bindings = new BindingStore();
// `?state=off` keeps validation runs from reading/writing tuned state.
const state = new StateClient(qs.get("state") !== "off");
const tunedValues = new Map<string, Record<string, number | boolean>>();

const persist = {
  globals: () => state.save("inputs", () => inputs.manifest.values()),
  scene: (sceneName: string) => {
    const entry = [...session.entries.values()].find((e) => e.sceneName === sceneName);
    if (entry) tunedValues.set(sceneName, entry.instance.manifest.values());
    state.save(`values/${sceneName}`, () => tunedValues.get(sceneName) ?? {});
  },
  bindings: () => state.save("bindings", () => bindings.toJSON()),
};

// MIDI routing: a CC completes a pending learn, then drives its bindings
// through the same Manifest write path as set_param and the Console.
midi.onCc((e) => {
  const { learned } = bindings.handleCc(e, (scene, path, v01) => {
    if (scene === "globals") {
      inputs.manifest.get(path)?.setNormalized(v01);
      persist.globals();
      return;
    }
    let touched = false;
    for (const entry of session.entries.values()) {
      if (entry.sceneName !== scene) continue;
      entry.instance.manifest.get(path)?.setNormalized(v01);
      touched = true;
    }
    if (touched) persist.scene(scene);
  });
  if (learned) persist.bindings();
});

const session = new SessionStore({ audio, time: timeBus, inputs }, (scene) =>
  tunedValues.get(scene),
);
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

// Tuned state (R6.2): globals tunings, MIDI bindings, and per-scene values
// load before the boot instance builds so it comes up already tuned.
if (state.enabled) {
  const savedGlobals = await state.load("inputs");
  if (savedGlobals && typeof savedGlobals === "object") {
    for (const [path, v] of Object.entries(savedGlobals as Record<string, number | boolean>)) {
      inputs.manifest.get(path)?.set(v);
    }
  }
  bindings.load(await state.load("bindings"));
  for (const scene of currentScenes().keys()) {
    const vals = await state.load(`values/${scene}`);
    if (vals && typeof vals === "object") {
      tunedValues.set(scene, vals as Record<string, number | boolean>);
    }
  }
}

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
  inputs: {},
  midiInject: (cc, ch, value01) => midi.inject(cc, ch, value01),
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
    inputs,
    bindings,
    midiDevices: () => midi.devices,
    persist,
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
  inputs.update(f); // every channel advances even with zero consumers (R6.4)
  onsetCount += debugOnsets.poll(f).length;

  const directive = stage.tick(f);
  currentMix = directive.mode === "crossfade" ? directive.mix : null;
  lastDirectiveHold = directive.mode === "hold";
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
  dbg.inputs = inputs.values();
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

  // The input rack hot-reloads like scenes: a bad inputs.ts is rejected and
  // the previous rack (with its tunings and detector state) keeps running.
  import.meta.hot.accept("../../../content/inputs", (mod) => {
    if (!mod?.default) {
      console.warn("[loom] inputs hot update carried no default export; keeping previous rack");
      return;
    }
    const ok = tryDefineInputs(mod.default as InputsDef);
    console.info(ok ? "[loom] input rack redefined" : "[loom] inputs.ts rejected; previous rack still active");
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
