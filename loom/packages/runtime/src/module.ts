import { z } from "zod";

export const ModuleMetaSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-zA-Z0-9]*$/, "module names are lowerCamelCase identifiers"),
  kind: z.enum(["control", "source", "effect", "geo", "output"]),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  example: z.string().optional(),
});

export type ModuleMeta = z.infer<typeof ModuleMetaSchema>;
export type ModuleMetaInput = z.input<typeof ModuleMetaSchema>;

export interface ModuleFactory<Ctx, Opts, Out> {
  (ctx: Ctx, opts: Opts): Out;
  meta: ModuleMeta;
}

/**
 * A typed composable unit. The metadata is zod-validated at definition time
 * and rides into the catalog (M5); the factory body builds into an instance
 * via the BuildCtx it receives.
 */
export function defineModule<Ctx, Opts, Out>(
  meta: ModuleMetaInput,
  create: (ctx: Ctx, opts: Opts) => Out,
): ModuleFactory<Ctx, Opts, Out> {
  const parsed = ModuleMetaSchema.parse(meta);
  const factory = ((ctx: Ctx, opts: Opts) => create(ctx, opts)) as ModuleFactory<Ctx, Opts, Out>;
  factory.meta = parsed;
  return factory;
}
