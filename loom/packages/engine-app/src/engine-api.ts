import type {
  AudioBusLike,
  BindingStore,
  FrameCtx,
  InputRegistry,
  Manifest,
  PaletteRegistry,
  SceneDef,
  Stage,
  TimeBus,
} from "@loom/runtime";
import {
  ArmAgentCommitArgs,
  ClearModulationArgs,
  CommitArgs,
  CreateInstanceArgs,
  InstanceArgs,
  MidiTargetArgs,
  ModulateParamArgs,
  PreviewEffectArgs,
  RenameInstanceArgs,
  SaveChainArgs,
  SetAudioArgs,
  SetChainArgs,
  SetParamArgs,
  TransportArgs,
  type AudioDevice,
  type EffectInfo,
  type RequestMsg,
  type ScreenshotResult,
  type SessionSnapshot,
} from "@loom/sidecar/protocol";
import type { WebGPURenderer } from "three/webgpu";
import { entryStatus, PREVIEW_H, PREVIEW_W, type Entry, type SessionStore } from "./session";

/** Who issued a command: the MCP bridge ("agent") or the Console ("human"). */
export type Source = "agent" | "human";

// set_audio is human-only: an agent must not silently swap the audio source
// mid-set (it isn't an MCP tool either — this is the belt to that braces).
// MIDI-learn is a physical-controller gesture, so it's human-only too.
const HUMAN_ONLY: ReadonlySet<string> = new Set([
  "panic",
  "resume",
  "set_audio",
  "arm_agent_commit",
  "rename_instance",
  "midi_learn",
  "midi_unbind",
]);

/** Pseudo-instance id serving the global manifest (input rack tunings). */
const GLOBALS = "globals";

export interface EngineDeps {
  renderer: WebGPURenderer;
  canvas: HTMLCanvasElement;
  session: SessionStore;
  stage: Stage;
  audio: AudioBusLike & {
    mode: string;
    startMic(deviceId?: string): Promise<void>;
    startTest(bpm?: number): void;
  };
  time: TimeBus;
  /** The input rack: globals manifest + live channel values (R6). */
  inputs: InputRegistry;
  /** Global color palettes (R7): second globals-side manifest, path prefix "palette.". */
  palettes: PaletteRegistry;
  /** MIDI bindings + learn state; CC routing itself lives in main.ts. */
  bindings: BindingStore;
  midiStatus(): "off" | "ready";
  midiDevices(): string[];
  /** Tuned-state persistence triggers (debounced engine-side). */
  persist: {
    globals(): void;
    palettes(): void;
    scene(scene: string): void;
    bindings(): void;
  };
  /** Cached audio input devices (snapshot is sync; main.ts owns the refresh). */
  audioDevices(): AudioDevice[];
  refreshAudioDevices(): void;
  getScenes(): Map<string, SceneDef>;
  /** The chainable-effect library for the "+ effect" picker (M6). */
  availableEffects(): EffectInfo[];
  /** Write the instance's current chain as a composite effect file; returns its repo path. */
  saveEffectChain(name: string, data: unknown): Promise<{ path: string }>;
  /** Render a candidate effect over an instance's current output → JPEG data URL (picker grid). */
  previewEffect(instanceId: string, effect: string): Promise<string>;
  latestFrame(): FrameCtx;
  /** Same-task canvas capture, resolved by the render loop (live output only). */
  captureCanvas(): Promise<ScreenshotResult>;
  fps(): number;
  rms(): number;
  onsetCount(): number;
  /** Current crossfade mix from the last directive, or null. */
  currentMix(): number | null;
  /** Id bookkeeping outside the session (main.ts tracks the boot instance). */
  onInstanceRenamed?(from: string, to: string): void;
}

/**
 * One dispatch for every engine command, shared by the WS bridge (agent)
 * and the Console BroadcastChannel (human). Throws become ok:false
 * responses at the transport layer — never engine crashes.
 */
export class EngineApi {
  agentCommitArmed: boolean;

  // The live output's thumbnail source. The WebGL canvas is only readable in
  // the task that rendered it, so the render loop mirrors it in here (a 2D
  // canvas keeps its bitmap) and thumbnails() reads the mirror at leisure.
  private readonly liveMirror = document.createElement("canvas");
  private readonly liveMirrorCtx: CanvasRenderingContext2D;
  private liveMirrorAt = -Infinity;
  private consoleSeenAt = -Infinity;

  constructor(
    private readonly deps: EngineDeps,
    opts: { agentCommitArmed?: boolean } = {},
  ) {
    this.agentCommitArmed = opts.agentCommitArmed ?? false;
    this.liveMirror.width = 640;
    this.liveMirror.height = 360;
    this.liveMirrorCtx = this.liveMirror.getContext("2d")!;
  }

  markConsolePresent(): void {
    this.consoleSeenAt = performance.now();
  }

  /**
   * Call from the render loop right after compositing — same task as the
   * render, the only place the canvas is readable. Throttled to thumbnail
   * rate and skipped entirely when no Console is listening.
   */
  captureLiveMirror(mode: "single" | "crossfade" | "hold"): void {
    if (mode === "hold" || this.deps.stage.live == null) return;
    const now = performance.now();
    if (now - this.consoleSeenAt > 5000 || now - this.liveMirrorAt < 140) return;
    this.liveMirrorAt = now;
    this.liveMirrorCtx.drawImage(this.deps.canvas, 0, 0, this.liveMirror.width, this.liveMirror.height);
  }

  /**
   * "live" is an alias, not an id: it resolves to whatever instance is
   * currently LIVE (the boot instance is id "boot"). Commands default to
   * it so "tweak the live thing" needs no id lookup.
   */
  private resolveId(id: string): string {
    return id === "live" ? (this.deps.stage.live ?? id) : id;
  }

  /**
   * Humans may edit the LIVE chain directly; an agent needs the same arming
   * gate as commit to touch it. Non-live (sandbox) chain edits are ungated —
   * they change nothing the audience sees.
   */
  private guardLiveChain(source: Source, id: string): void {
    if (source === "agent" && this.deps.stage.live === id && !this.agentCommitArmed) {
      throw new Error(
        "agent edits to the LIVE chain need arming — edit a staged candidate instead, " +
          "or ask the human to arm agent commit (engines started with ?agentCommit=1 arm it)",
      );
    }
  }

  async handleRequest(req: RequestMsg, source: Source): Promise<unknown> {
    if (source === "agent" && HUMAN_ONLY.has(req.type)) {
      throw new Error(`${req.type} is a human-only control (Console)`);
    }
    const { session, stage } = this.deps;
    switch (req.type) {
      case "get_session":
        return this.snapshot();
      case "get_manifest": {
        const { instance } = InstanceArgs.parse(req.args);
        if (instance === GLOBALS) {
          return { instance: GLOBALS, params: this.globalsJson() };
        }
        const e = session.require(this.resolveId(instance));
        return { instance: e.id, params: this.manifestJson(e) };
      }
      case "set_param": {
        const { instance, path, value } = SetParamArgs.parse(req.args);
        if (instance === GLOBALS) {
          const isPalette = path.startsWith("palette.");
          const param = this.requireParam(this.globalsManifest(path), path, GLOBALS);
          param.set(value);
          if (isPalette) this.deps.persist.palettes();
          else this.deps.persist.globals();
          return { instance: GLOBALS, path, value: param.value as number | boolean | string };
        }
        const e = session.require(this.resolveId(instance));
        const param = this.requireParam(e.instance.manifest, path, e.id);
        const mod = e.modulators.get(path);
        if (mod != null && mod.error == null) {
          throw new Error(
            `"${path}" on "${e.id}" is modulated (${mod.spec.type}) — call clear_modulation ` +
              "(or hit ∿ Detach in the Console) to take manual control",
          );
        }
        param.set(value);
        this.deps.persist.scene(e.sceneName);
        return { instance: e.id, path, value: param.value as number | boolean | string };
      }
      case "modulate_param": {
        const { instance, path, modulator } = ModulateParamArgs.parse(req.args);
        const e = session.require(this.resolveId(instance));
        if (!e.instance.manifest.get(path)) {
          const have = e.instance.manifest.paths().join(", ") || "(none)";
          throw new Error(`unknown param "${path}" on "${e.id}" — manifest has: ${have}`);
        }
        const spec = e.modulators.attach(e.instance.manifest, path, modulator);
        return { instance: e.id, path, modulator: spec };
      }
      case "clear_modulation": {
        const { instance, path } = ClearModulationArgs.parse(req.args);
        const e = session.require(this.resolveId(instance));
        return { instance: e.id, path, cleared: e.modulators.clear(path) };
      }
      case "set_chain": {
        const { instance, steps, restoreDefault } = SetChainArgs.parse(req.args);
        const e = session.require(this.resolveId(instance));
        this.guardLiveChain(source, e.id);
        // Throws on an unknown effect or a rejected build (chain unchanged / NFR-5).
        session.setChain(e.id, restoreDefault ? "default" : (steps ?? []));
        this.deps.persist.scene(e.sceneName);
        return { instance: e.id, chain: e.chain.list() };
      }
      case "preview_effect": {
        const { instance, effect } = PreviewEffectArgs.parse(req.args);
        const e = session.require(this.resolveId(instance));
        return { effect, image: await this.deps.previewEffect(e.id, effect) };
      }
      case "save_chain": {
        const { instance, name, description } = SaveChainArgs.parse(req.args);
        const e = session.require(this.resolveId(instance));
        e.chain.captureValues(e.instance.manifest); // saved knobs reflect live tweaks
        const { steps } = e.chain.serialize(); // throws if a composite is present
        if (steps.length === 0) throw new Error("nothing to save — this instance has no chain");
        const payload = { name, ...(description != null ? { description } : {}), steps };
        const { path } = await this.deps.saveEffectChain(name, payload);
        return { saved: name, path, steps: steps.length };
      }
      case "screenshot": {
        const { instance } = InstanceArgs.parse(req.args);
        const e = session.require(this.resolveId(instance));
        if (this.isOnCanvas(e)) return this.deps.captureCanvas();
        return this.targetShot(e);
      }
      case "create_instance": {
        const { scene, id } = CreateInstanceArgs.parse(req.args);
        const def = this.deps.getScenes().get(scene);
        if (!def) {
          const have = [...this.deps.getScenes().keys()].join(", ") || "(none)";
          throw new Error(`unknown scene "${scene}" — available: ${have}`);
        }
        const e = session.create(def, id);
        return { instance: e.id, scene: e.sceneName, paramPaths: e.instance.manifest.paths() };
      }
      case "destroy_instance": {
        const { instance } = InstanceArgs.parse(req.args);
        const e = session.require(this.resolveId(instance));
        if (stage.live === e.id) {
          throw new Error(`"${e.id}" is LIVE — commit something else before destroying it`);
        }
        stage.onInstanceDestroyed(e.id);
        session.destroy(e.id);
        return { destroyed: e.id };
      }
      case "rename_instance": {
        const { instance, to } = RenameInstanceArgs.parse(req.args);
        const e = session.require(this.resolveId(instance));
        const from = e.id;
        if (to === from) return { instance: to, was: from };
        if (to === "live" || to === "globals") {
          throw new Error(`"${to}" is a reserved name`);
        }
        session.rename(from, to);
        stage.onInstanceRenamed(from, to);
        this.deps.onInstanceRenamed?.(from, to);
        return { instance: to, was: from };
      }
      case "stage": {
        const { instance } = InstanceArgs.parse(req.args);
        const e = session.require(this.resolveId(instance));
        stage.stage(e.id);
        return { staged: e.id, live: stage.live };
      }
      case "unstage":
        stage.unstage();
        return { staged: null };
      case "commit": {
        const { durationFrames } = CommitArgs.parse(req.args);
        if (source === "agent" && !this.agentCommitArmed) {
          throw new Error(
            "agent commit is not armed — the human disarmed it (Console checkbox or " +
              "?agentCommit=0); ask them to press COMMIT in the Console or re-arm agent commit",
          );
        }
        const from = stage.live;
        const to = stage.staged;
        stage.commit(this.deps.latestFrame(), durationFrames);
        return { from, to, durationFrames };
      }
      case "panic":
        stage.panic();
        return { panicked: true };
      case "resume":
        stage.resume();
        return { panicked: false };
      case "set_transport": {
        const { bpm, tap } = TransportArgs.parse(req.args);
        if (bpm !== undefined) this.deps.time.setBpm(bpm);
        if (tap) this.deps.time.tap(performance.now() / 1000);
        return { bpm: this.deps.time.bpm };
      }
      case "set_audio": {
        const { mode, deviceId } = SetAudioArgs.parse(req.args);
        if (mode === "test") {
          this.deps.audio.startTest(this.deps.time.bpm);
        } else {
          try {
            await this.deps.audio.startMic(deviceId);
          } catch (err) {
            // Never leave the instrument deaf: fall back like boot does.
            this.deps.audio.startTest(this.deps.time.bpm);
            throw new Error(`mic unavailable (${String(err)}) — fell back to the test signal`);
          }
        }
        this.deps.refreshAudioDevices(); // labels appear once mic permission is granted
        return { audioMode: this.deps.audio.mode };
      }
      case "arm_agent_commit": {
        const { armed } = ArmAgentCommitArgs.parse(req.args);
        this.agentCommitArmed = armed;
        return { agentCommitArmed: armed };
      }
      case "midi_learn": {
        const target = this.resolveMidiTarget(req.args);
        this.deps.bindings.startLearn(target);
        return { learning: this.deps.bindings.learning };
      }
      case "midi_unbind": {
        const target = this.resolveMidiTarget(req.args);
        const removed = this.deps.bindings.unbind(target);
        if (removed) this.deps.persist.bindings();
        return { removed };
      }
    }
  }

  /**
   * MIDI targets address a SCENE (durable across instance churn), so an
   * instance arg resolves to its scene name; "globals" passes through. The
   * path must exist on the target manifest right now — fail loud at learn
   * time, not silently on the first knob twist.
   */
  private resolveMidiTarget(args: unknown): { scene: string; path: string } {
    const { instance, path } = MidiTargetArgs.parse(args);
    if (instance === GLOBALS) {
      this.requireParam(this.globalsManifest(path), path, GLOBALS);
      return { scene: GLOBALS, path };
    }
    const e = this.deps.session.require(this.resolveId(instance));
    this.requireParam(e.instance.manifest, path, e.id);
    return { scene: e.sceneName, path };
  }

  /** "globals" = the input rack + the palettes, merged; routed by path prefix. */
  private globalsManifest(path: string): Manifest {
    return path.startsWith("palette.") ? this.deps.palettes.manifest : this.deps.inputs.manifest;
  }

  private globalsJson(): Record<string, unknown> {
    return { ...this.deps.inputs.manifest.toJSON(), ...this.deps.palettes.manifest.toJSON() };
  }

  private requireParam(manifest: Manifest, path: string, owner: string) {
    const param = manifest.get(path);
    if (!param) {
      const have = manifest.paths().join(", ") || "(none)";
      throw new Error(`unknown param "${path}" on "${owner}" — manifest has: ${have}`);
    }
    return param;
  }

  snapshot(): SessionSnapshot {
    const { session, stage } = this.deps;
    const liveEntry = stage.live != null ? session.get(stage.live) : undefined;
    return {
      scene: liveEntry?.sceneName ?? null,
      instance: liveEntry?.id ?? null,
      instanceError: liveEntry?.instance.error != null ? String(liveEntry.instance.error) : null,
      paramPaths: liveEntry?.instance.manifest.paths() ?? [],
      instances: [...session.entries.values()].map((e) => ({
        id: e.id,
        scene: e.sceneName,
        status: entryStatus(e),
        error: e.instance.error != null ? String(e.instance.error) : null,
        paramPaths: e.instance.manifest.paths(),
        modulators: e.modulators.list().map((m) => ({ path: m.path, type: m.spec.type, error: m.error })),
        chain: e.chain.list(),
        builds: e.builds,
      })),
      live: stage.live,
      staged: stage.staged,
      mix: this.deps.currentMix(),
      panicked: stage.panicked,
      agentCommitArmed: this.agentCommitArmed,
      availableScenes: [...this.deps.getScenes().keys()],
      availableEffects: this.deps.availableEffects(),
      audioMode: this.deps.audio.mode,
      audioDevices: this.deps.audioDevices(),
      inputs: this.deps.inputs.values(),
      midi: {
        status: this.deps.midiStatus(),
        devices: this.deps.midiDevices(),
        learning: this.deps.bindings.learning,
      },
      bindings: this.deps.bindings.toJSON(),
      bpm: this.deps.time.bpm,
      rms: this.deps.rms(),
      onsetCount: this.deps.onsetCount(),
      fps: this.deps.fps(),
      frame: this.deps.latestFrame().frame,
    };
  }

  /** Console state payload: snapshot plus full manifests for param panels. */
  consoleState(): { session: SessionSnapshot; manifests: Record<string, unknown> } {
    const manifests: Record<string, unknown> = {};
    for (const e of this.deps.session.entries.values()) {
      manifests[e.id] = this.manifestJson(e);
    }
    manifests[GLOBALS] = this.globalsJson(); // the rack's widgets + palettes
    return { session: this.snapshot(), manifests };
  }

  /** Manifest JSON with each param's active modulator config (or null) — FR-8. */
  private manifestJson(e: Entry): Record<string, unknown> {
    const params = e.instance.manifest.toJSON() as Record<string, Record<string, unknown>>;
    for (const path of Object.keys(params)) {
      const m = e.modulators.get(path);
      params[path]!.modulator = m != null && m.error == null ? m.spec : null;
    }
    return params;
  }

  /** Small JPEG thumbnails per instance for the Console tiles. */
  async thumbnails(width = 640, height = 360): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const e of this.deps.session.entries.values()) {
      try {
        // The live entry shows what the audience sees (loop-mirrored canvas);
        // everyone else reads back their offscreen preview target at its full
        // 640×360 res — enough for the 2x tiles AND /staged.html full-screen
        // (the old staged-only 2x special case is now just the default).
        out[e.id] =
          e.id === this.deps.stage.live
            ? this.liveMirror.toDataURL("image/jpeg", 0.7)
            : await this.readTarget(e, width, height, "image/jpeg");
      } catch {
        // skip a tile this round rather than break the loop
      }
    }
    return out;
  }

  /** Live output renders straight to the canvas outside a crossfade. */
  private isOnCanvas(e: Entry): boolean {
    return this.deps.stage.live === e.id && !this.deps.stage.fading && !this.deps.stage.panicked;
  }

  private async targetShot(e: Entry): Promise<ScreenshotResult> {
    const dataUrl = await this.readTarget(e, PREVIEW_W, PREVIEW_H, "image/png");
    return {
      mime: "image/png",
      base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
      width: PREVIEW_W,
      height: PREVIEW_H,
      frame: this.deps.latestFrame().frame,
    };
  }

  private async readTarget(
    e: Entry,
    outW: number,
    outH: number,
    mime: string,
  ): Promise<string> {
    const { renderer } = this.deps;
    const buf = (await renderer.readRenderTargetPixelsAsync(
      e.target,
      0,
      0,
      PREVIEW_W,
      PREVIEW_H,
    )) as Uint8Array | Uint8ClampedArray;
    const pixels = new Uint8ClampedArray(buf.buffer, buf.byteOffset, PREVIEW_W * PREVIEW_H * 4);
    const img = new ImageData(pixels.slice(), PREVIEW_W, PREVIEW_H);
    const full = document.createElement("canvas");
    full.width = PREVIEW_W;
    full.height = PREVIEW_H;
    full.getContext("2d")!.putImageData(img, 0, 0);
    // WebGL framebuffers read bottom-up; WebGPU reads top-down.
    const flip = (this.deps.renderer.backend as { isWebGLBackend?: boolean }).isWebGLBackend === true;
    return scaleToJpeg(full, outW, outH, flip, mime);
  }
}

function scaleToJpeg(
  source: HTMLCanvasElement,
  width: number,
  height: number,
  flipY: boolean,
  mime = "image/jpeg",
): string {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  if (flipY) {
    ctx.translate(0, height);
    ctx.scale(1, -1);
  }
  ctx.drawImage(source, 0, 0, width, height);
  return c.toDataURL(mime, 0.7);
}
