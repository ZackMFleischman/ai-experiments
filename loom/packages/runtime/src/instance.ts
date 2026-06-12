import {
  MeshBasicNodeMaterial,
  QuadMesh,
  type RenderTarget,
  type WebGPURenderer,
} from "three/webgpu";
import { BuildCtx } from "./buildctx";
import type { FrameCtx } from "./frame";
import type { AudioBusLike } from "./inputbus/audio";
import type { TimeBus } from "./inputbus/time";
import type { InputRegistry } from "./inputs";
import type { PaletteRegistry } from "./palette";
import type { Manifest } from "./param";
import type { SceneDef } from "./scene";
import type { ColorNode, Pass, TexNode } from "./texnode";

/**
 * A running scene graph. NFR-2: any exception inside render freezes this
 * instance (holds the last presented frame) — it never propagates to the
 * engine loop. NFR-5: code changes rebuild the instance from scratch.
 */
export class Instance {
  error: unknown = null;

  private readonly material = new MeshBasicNodeMaterial();
  private readonly quad: QuadMesh;

  constructor(
    readonly sceneName: string,
    readonly manifest: Manifest,
    private readonly updaters: ReadonlyArray<(f: FrameCtx) => void>,
    private readonly passes: readonly Pass[],
    output: ColorNode,
  ) {
    this.material.colorNode = output;
    this.quad = new QuadMesh(this.material);
  }

  /**
   * Render exactly once per frame (stateful passes advance per call).
   * `target` null presents to the canvas; a RenderTarget renders offscreen
   * (preview tiles, crossfade legs).
   */
  renderFrame(renderer: WebGPURenderer, f: FrameCtx, target: RenderTarget | null = null): void {
    if (this.error != null) return; // frozen: hold the last good frame
    try {
      for (const update of this.updaters) update(f);
      for (const pass of this.passes) pass.render(renderer, f);
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      this.quad.render(renderer);
      renderer.setRenderTarget(prev);
    } catch (err) {
      this.error = err;
      console.error(`[loom] instance "${this.sceneName}" froze (NFR-2 containment):`, err);
    }
  }

  dispose(): void {
    for (const pass of this.passes) {
      try {
        pass.dispose();
      } catch {}
    }
    this.material.dispose();
  }
}

/** Build a scene into a running instance. Throws on a bad build — callers contain. */
export function buildInstance(
  scene: SceneDef,
  buses: { audio: AudioBusLike; time: TimeBus; inputs?: InputRegistry; palettes?: PaletteRegistry },
  /**
   * Optional post-effect fold (M6 chains): wraps the scene's output before the
   * manifest finalizes, so chain params land on the same manifest and a throwing
   * step throws the whole build (NFR-5 keeps the previous pixels).
   */
  fold?: (ctx: BuildCtx, tex: TexNode) => TexNode,
): Instance {
  const ctx = new BuildCtx(buses.audio, buses.time, buses.inputs, buses.palettes);
  let out = scene.build(ctx);
  if (out?.color == null) {
    throw new Error(`scene "${scene.name}": build() must return a TexNode`);
  }
  if (fold) out = fold(ctx, out);
  ctx.finalize();
  return new Instance(scene.name, ctx.manifest, ctx.updaters, out.passes, out.color);
}
