---
name: module-authoring
description: Use when writing a new LOOM module (source, effect, or control) in content/modules/ — covers the defineModule contract, TexNode/Signal rules, params, and the golden example.
---

# Module authoring

A module is one typed, composable unit in `content/modules/<kind>/<name>.ts`. Budget: ≤ ~150 lines, fully typed, metadata written for the next agent to find and reuse.

## The contract

```ts
export const myModule = defineModule(
  {
    name: "myModule",            // must match the export
    kind: "source",              // control | source | effect | geo | output
    description: "One line, concrete, says what it looks like / does.",
    tags: ["pattern", "organic"], // searchable vocabulary
    example: 'myModule(ctx, { scale: 3 })',
  },
  (ctx: BuildCtx, opts: MyModuleOpts = {}): TexNode => { ... },
);
```

- Export a named `Opts` interface; every option documented with a one-line comment.
- Options that should react to the world are `SignalLike` (number | Signal). Bridge them with `ctx.uniformOf(opt ?? default)` — that returns a TSL uniform usable in shader code and keeps stateful signals pulled.
- **Sources** return `texNode(vec4(...))` — color is strictly vec4; normalize once.
- **Effects** take `input: TexNode` and must propagate passes: a stateless effect returns `texNode(newColor, input.passes)`; a stateful one (render targets) returns `texNode(color, [...input.passes, ownPass])`. Order is composition order — no scheduler.
- **Controls** return a `Signal<number>` and run on the CPU; they must be cheap (called every frame).
- Modules never reach outside `ctx` — no globals, no direct bus access beyond `ctx.audio`/`ctx.time`.

## Golden example (source)

`content/modules/sources/osc.ts` is the reference: typed opts with doc comments, `ctx.uniformOf` for every reactive option, vec4 normalization, complete metadata. For a stateful effect, `content/modules/effects/feedback.ts` shows render-target ownership and pass ordering.

## Checklist before you're done

1. `pnpm typecheck` passes.
2. Metadata complete (name/kind/description/tags/example) — this is the library's search surface.
3. Exercise it from a scene (wire into `live.scene.ts`), `screenshot`, confirm it does what the description claims.
4. If it has tunable feel, expose params in the *scene* that uses it (params live in scenes; modules take Signals/opts).
