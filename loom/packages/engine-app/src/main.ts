import {
  AudioBus,
  BindingStore,
  Clock,
  InputRegistry,
  MidiBus,
  PaletteRegistry,
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
import { workerInterval } from "./worker-clock";

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
      /** Which clock drove the last frame: rAF (visible) or the worker fallback (hidden tab). */
      clockSource?: "raf" | "worker";
      live: string | null;
      staged: string | null;
      mix: number | null;
      panicked: boolean;
      agentCommitArmed: boolean;
      instances: Array<{
        id: string;
        scene: string;
        status: InstanceStatus;
        builds: number;
        modulators: Array<{ path: string; type: string; error: string | null }>;
      }>;
      /** Input-rack channel values (rack meters / validation). */
      inputs: Record<string, number>;
      /** Global palette tunings (R7) — palette.<source>.<i> → "#rrggbb". */
      palettes: Record<string, number | boolean | string>;
      /** Mocked-hardware hook: feeds the same path as a real CC message. */
      midiInject: (cc: number, ch: number, value01: number) => void;
      /** Console (parent frame) forwards its click gesture here to unsuspend audio. */
      resumeAudio: () => void;
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

// Chrome ≥124 gates ALL WebMIDI behind a permission prompt — and this page
// is a bare projector surface the human rarely interacts with, so the boot
// request can be dismissed or never seen. Make init retryable: on pointer
// gestures here, and the moment the permission flips to granted (the Console
// primes the prompt in the window the human actually clicks; grants are
// per-origin, so they unlock this page too).
let midiInitInFlight = false;
async function ensureMidi(): Promise<void> {
  if (midi.status === "ready" || midiInitInFlight) return;
  midiInitInFlight = true;
  try {
    const ok = await midi.init();
    if (ok) {
      console.info(`[loom] MIDI ready (${midi.devices.join(", ") || "no devices yet — hot-plug works"})`);
    } else {
      console.warn("[loom] MIDI unavailable (permission not granted yet?) — grant it from the Console header");
    }
  } finally {
    midiInitInFlight = false;
  }
}
void ensureMidi();
void (async () => {
  try {
    const perm = await navigator.permissions.query({ name: "midi" as PermissionName });
    perm.onchange = () => {
      if (perm.state === "granted") void ensureMidi();
    };
    if (perm.state === "granted") void ensureMidi();
  } catch {
    // Permissions API has no "midi" here — gesture retry still covers us.
  }
})();
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

// Global color palettes (R7): a second globals-side manifest, served through
// the same "globals" pseudo-instance and persisted like the rack tunings.
const palettes = new PaletteRegistry();

const bindings = new BindingStore();
// `?state=off` keeps validation runs from reading/writing tuned state.
const state = new StateClient(qs.get("state") !== "off");
const tunedValues = new Map<string, Record<string, number | boolean | string>>();

const persist = {
  globals: () => state.save("inputs", () => inputs.manifest.values()),
  palettes: () => state.save("palettes", () => palettes.manifest.values()),
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
      const isPalette = path.startsWith("palette.");
      (isPalette ? palettes.manifest : inputs.manifest).get(path)?.setNormalized(v01);
      if (isPalette) persist.palettes();
      else persist.globals();
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

const session = new SessionStore({ audio, time: timeBus, inputs, palettes }, (scene) =>
  tunedValues.get(scene),
);
const stage = new Stage();
const compositor = new Compositor(RENDER_W, RENDER_H);

// The barrel binding goes stale when ./scenes hot-updates; HMR swaps it below.
let currentScenes = getScenes;

/**
 * The instance that tracks live.scene.ts. It boots as "boot" but the human
 * can rename it (the engine-api rename hook keeps this pointer current) —
 * "live" is an alias for whatever the Stage routes to output, not an id.
 */
let bootId = "boot";

/**
 * NFR-5 for the boot instance: build the new one first; a failed
 * build/rebuild keeps whatever is running — never go black.
 */
function trySwapLive(def: SceneDef): boolean {
  if (session.get(bootId)) return session.rebuild(bootId, def);
  try {
    session.create(def, bootId);
    if (stage.live === null) stage.adoptLive(bootId);
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
      try {
        inputs.manifest.get(path)?.set(v);
      } catch {
        // corrupt entry — keep the default
      }
    }
  }
  const savedPalettes = await state.load("palettes");
  if (savedPalettes && typeof savedPalettes === "object") {
    for (const [path, v] of Object.entries(savedPalettes as Record<string, unknown>)) {
      try {
        palettes.manifest.get(path)?.set(v as never);
      } catch {
        // corrupt entry — keep the default
      }
    }
  }
  bindings.load(await state.load("bindings"));
  for (const scene of currentScenes().keys()) {
    const vals = await state.load(`values/${scene}`);
    if (vals && typeof vals === "object") {
      tunedValues.set(scene, vals as Record<string, number | boolean | string>);
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
  palettes: {},
  midiInject: (cc, ch, value01) => midi.inject(cc, ch, value01),
  resumeAudio: () => audio.resume(),
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
    palettes,
    bindings,
    midiStatus: () => midi.status,
    midiDevices: () => midi.devices,
    midiRecent: () => midi.recent,
    persist,
    // live.scene.ts hot-swaps must keep landing on the boot instance even
    // after the human renames its tile.
    onInstanceRenamed: (from, to) => {
      if (bootId === from) bootId = to;
    },
  },
  // Agent commit defaults ARMED (the stage→commit ceremony was getting in the
  // way); ?agentCommit=0 restores the human gate, and the Console checkbox
  // disarms live either way.
  { agentCommitArmed: qs.get("agentCommit") !== "0" },
);

// `?ws=` lets validation runs use an isolated sidecar port so they never
// collide with (or silently talk to) a live performance session's sidecar.
const stopBridge = startBridge(`ws://localhost:${Number(qs.get("ws")) || DEFAULT_WS_PORT}`, api);

// ?embedded=1 marks the Console's hidden-iframe engine (solo mode, no Output
// window). It stands down completely if a real Output engine appears.
const embedded = qs.get("embedded") === "1";
let yielded = false;
startConsoleChannel(api, {
  embedded,
  onYield: () => {
    yielded = true;
    renderer.setAnimationLoop(null);
    stopHiddenClock();
    stopBridge();
  },
});

const frameTick = (tMs: number): void => {
  if (yielded) return;
  const f = clock.tick(tMs);
  latestFrame = f;
  timeBus.tick(f);
  audio.update(f);
  inputs.update(f); // every channel advances even with zero consumers (R6.4)
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
  dbg.clockSource = document.hidden ? "worker" : "raf"; // which clock drove this frame
  dbg.live = stage.live;
  dbg.staged = stage.staged;
  dbg.mix = currentMix;
  dbg.panicked = stage.panicked;
  dbg.agentCommitArmed = api.agentCommitArmed;
  dbg.inputs = inputs.values();
  dbg.palettes = palettes.manifest.values();
  dbg.instances = [...session.entries.values()].map((e) => ({
    id: e.id,
    scene: e.sceneName,
    status: entryStatus(e),
    builds: e.builds,
    modulators: e.modulators.list().map((m) => ({ path: m.path, type: m.spec.type, error: m.error })),
  }));
};

let lastRafAt = performance.now();
renderer.setAnimationLoop((tMs) => {
  lastRafAt = performance.now();
  frameTick(tMs);
});

// Browsers freeze rAF in hidden tabs (and starve it for offscreen iframes),
// which used to freeze every Console preview whenever the Output tab wasn't
// showing. A worker clock (exempt from background timer throttling) keeps the
// engine ticking at ~30 fps whenever rAF isn't delivering; the moment rAF
// resumes, the starvation guard backs off so the two never double-step.
const stopHiddenClock = workerInterval(() => {
  if (document.hidden || performance.now() - lastRafAt > 150) frameTick(performance.now());
}, 33);

// Tap tempo on "t"; any click also unblocks a suspended AudioContext.
window.addEventListener("keydown", (e) => {
  if (e.key === "t") timeBus.tap(performance.now() / 1000);
});
window.addEventListener("pointerdown", () => {
  audio.resume();
  void ensureMidi(); // a real gesture can re-pop a dismissed MIDI prompt
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
        ? `[loom] scene hot-swapped: ${session.get(bootId)?.sceneName}`
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
      if (entry.id === bootId) continue; // owned by the live.scene accept above
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
