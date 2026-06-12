import { BuildCtx, defineModule, texNode, type Pass, type SignalLike, type TexNode } from "@loom/runtime";
import { abs, floor, fract, mix, step, texture, uv, vec2, vec4 } from "three/tsl";
import { HalfFloatType, MeshBasicNodeMaterial, NoBlending, QuadMesh, RenderTarget, Vector2, type WebGPURenderer } from "three/webgpu";

export interface TileOpts {
  input: TexNode;
  /** Tiles across. */
  countX?: SignalLike;
  /** Tiles down. */
  countY?: SignalLike;
  /** >0.5 mirrors alternating tiles (seamless walls). */
  mirrorTiles?: SignalLike;
}

/**
 * Tile/repeat (the TD Tile TOP): the frame repeats countX×countY times, with
 * optional alternating mirror so edges meet seamlessly — video walls from any
 * source. Buffers the input once, resamples per tile.
 */
export const tile = defineModule(
  {
    name: "tile",
    kind: "effect",
    description: "Repeats the frame into an X×Y wall, optionally mirror-alternating for seamless edges.",
    tags: ["tile", "repeat", "grid", "wall", "stateful"],
    example: 'tile(ctx, { input: src, countX: 3, countY: 3, mirrorTiles: 1 })',
    chainParams: [
      { name: "countX", type: "int", default: 2, min: 1, max: 12, description: "tiles across" },
      { name: "countY", type: "int", default: 2, min: 1, max: 12, description: "tiles down" },
      { name: "mirrorTiles", type: "bool", default: true, description: "mirror alternating tiles" },
    ],
  },
  (ctx: BuildCtx, opts: TileOpts): TexNode => {
    const countX = ctx.uniformOf(opts.countX ?? 2);
    const countY = ctx.uniformOf(opts.countY ?? 2);
    const mirrorTiles = ctx.uniformOf(opts.mirrorTiles == null ? 1 : opts.mirrorTiles);
    const rt = new RenderTarget(1, 1, { type: HalfFloatType });
    const destSize = new Vector2();

    const srcMaterial = new MeshBasicNodeMaterial();
    srcMaterial.colorNode = opts.input.color;
    srcMaterial.transparent = true;
    srcMaterial.blending = NoBlending;
    const srcQuad = new QuadMesh(srcMaterial);

    const counts = vec2(countX.max(1), countY.max(1));
    const cells = uv().mul(counts);
    const id = floor(cells);
    const inTile = fract(cells);
    // Mirror odd tiles per axis when enabled.
    const oddX = fract(id.x.mul(0.5)).mul(2);
    const oddY = fract(id.y.mul(0.5)).mul(2);
    const useMirror = step(0.5, mirrorTiles);
    const tx = mix(inTile.x, mix(inTile.x, abs(inTile.x.oneMinus()), oddX), useMirror);
    const ty = mix(inTile.y, mix(inTile.y, abs(inTile.y.oneMinus()), oddY), useMirror);
    const sam = texture(rt.texture, vec2(tx, ty));

    const pass: Pass = {
      render(renderer: WebGPURenderer) {
        const prev = renderer.getRenderTarget();
        if (prev) destSize.set(prev.width, prev.height);
        else renderer.getDrawingBufferSize(destSize);
        if (rt.width !== destSize.x || rt.height !== destSize.y) rt.setSize(destSize.x, destSize.y);
        renderer.setRenderTarget(rt);
        srcQuad.render(renderer);
        renderer.setRenderTarget(prev);
      },
      dispose() {
        rt.dispose();
        srcMaterial.dispose();
      },
    };

    return texNode(vec4(sam.rgb, sam.a), [...opts.input.passes, pass]);
  },
);
