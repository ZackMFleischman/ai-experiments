import type { NodeMaterial } from "three/webgpu";

/** Whatever a NodeMaterial accepts as its colorNode (typed float/vec/color node). */
export type ColorNode = NonNullable<NodeMaterial["colorNode"]>;

/**
 * M0 scene contract: a scene builds a TSL color node for a fullscreen pass.
 * Grows into the full Signal/Param/Module kernel in M1.
 */
export interface SceneOutput {
  colorNode: ColorNode;
}

export interface SceneDef {
  name: string;
  build(): SceneOutput;
}

export function defineScene(def: SceneDef): SceneDef {
  if (typeof def?.name !== "string" || typeof def?.build !== "function") {
    throw new Error("defineScene: expected { name: string, build(): { colorNode } }");
  }
  return def;
}
