import type { SceneDef } from "@loom/runtime";
import { MeshBasicNodeMaterial, QuadMesh, type WebGPURenderer } from "three/webgpu";

/**
 * Holds the live scene and renders it as a fullscreen pass.
 * A scene that throws during build() is rejected and the previous
 * scene keeps rendering — first brick of never-go-black.
 */
export class SceneHost {
  private readonly material = new MeshBasicNodeMaterial();
  private readonly quad = new QuadMesh(this.material);
  private current: SceneDef | null = null;

  setScene(def: SceneDef): boolean {
    try {
      const out = def.build();
      if (out?.colorNode == null) {
        throw new Error("scene build() returned no colorNode");
      }
      this.material.colorNode = out.colorNode;
      this.material.needsUpdate = true;
      this.current = def;
      return true;
    } catch (err) {
      console.error(`[loom] scene "${def?.name ?? "?"}" rejected; keeping previous`, err);
      return false;
    }
  }

  get liveSceneName(): string | null {
    return this.current?.name ?? null;
  }

  render(renderer: WebGPURenderer): void {
    if (this.current) {
      this.quad.render(renderer);
    }
  }
}
