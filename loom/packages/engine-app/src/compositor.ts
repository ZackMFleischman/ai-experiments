import type { FrameCtx, StageDirective } from "@loom/runtime";
import { mix, texture, uniform, uv } from "three/tsl";
import {
  MeshBasicNodeMaterial,
  QuadMesh,
  RenderTarget,
  type WebGPURenderer,
} from "three/webgpu";
import { entryStatus, type SessionStore } from "./session";

/**
 * Renders the whole session for one frame, exactly once per instance:
 * - single:    live → canvas, everyone else → their preview target
 * - crossfade: live → full-res A, staged → full-res B, blend(mix) → canvas
 * - hold:      render nothing; the canvas keeps presenting the last frame
 */
export class Compositor {
  private readonly fullA: RenderTarget;
  private readonly fullB: RenderTarget;
  private readonly mixU = uniform(0);
  private readonly texA: ReturnType<typeof texture>;
  private readonly texB: ReturnType<typeof texture>;
  private readonly blendQuad: QuadMesh;
  private readonly blendMaterial: MeshBasicNodeMaterial;

  constructor(width: number, height: number) {
    this.fullA = new RenderTarget(width, height);
    this.fullB = new RenderTarget(width, height);
    this.texA = texture(this.fullA.texture, uv());
    this.texB = texture(this.fullB.texture, uv());
    this.blendMaterial = new MeshBasicNodeMaterial();
    this.blendMaterial.colorNode = mix(this.texA, this.texB, this.mixU);
    this.blendQuad = new QuadMesh(this.blendMaterial);
  }

  resize(width: number, height: number): void {
    this.fullA.setSize(width, height);
    this.fullB.setSize(width, height);
  }

  render(
    renderer: WebGPURenderer,
    f: FrameCtx,
    directive: StageDirective,
    session: SessionStore,
  ): void {
    if (directive.mode === "hold") return;

    for (const entry of session.entries.values()) {
      if (entryStatus(entry) === "frozen") continue; // holds its last pixels
      if (directive.mode === "single" && entry.id === directive.live) {
        entry.instance.renderFrame(renderer, f, null);
      } else if (directive.mode === "crossfade" && entry.id === directive.live) {
        entry.instance.renderFrame(renderer, f, this.fullA);
      } else if (directive.mode === "crossfade" && entry.id === directive.staged) {
        entry.instance.renderFrame(renderer, f, this.fullB);
      } else {
        entry.instance.renderFrame(renderer, f, entry.target);
      }
    }

    if (directive.mode === "crossfade") {
      this.texA.value = this.fullA.texture;
      this.texB.value = this.fullB.texture;
      this.mixU.value = directive.mix;
      this.blendQuad.render(renderer);
    }
  }

  dispose(): void {
    this.fullA.dispose();
    this.fullB.dispose();
    this.blendMaterial.dispose();
  }
}
