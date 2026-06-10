import { z } from "zod";
import type { BuildCtx } from "./buildctx";
import type { TexNode } from "./texnode";

const SceneMetaSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export interface SceneDef {
  name: string;
  description?: string;
  tags: string[];
  build(ctx: BuildCtx): TexNode;
}

export interface SceneInput {
  name: string;
  description?: string;
  tags?: string[];
  build(ctx: BuildCtx): TexNode;
}

/** A composition of modules; metadata zod-validated at definition time. */
export function defineScene(def: SceneInput): SceneDef {
  if (typeof def?.build !== "function") {
    throw new Error("defineScene: build must be a function (ctx) => TexNode");
  }
  const meta = SceneMetaSchema.parse(def);
  return {
    name: meta.name,
    tags: meta.tags,
    build: def.build,
    ...(meta.description !== undefined ? { description: meta.description } : {}),
  };
}
