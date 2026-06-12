# Stdlib burndown — TD-inspired module coverage (M11 §6)

The agreed expansion list (2026-06-11), drawn from TouchDesigner's CHOP/TOP/SOP
families and filtered against what already exists (modulators cover LFO/Noise/
Pattern-CHOP attachment; the input rack IS the audio-analysis CHOP; `paletteMap`
= Lookup, `feedback` = Trail). Work the list top to bottom inside each kind —
the first five effects are dependency-ordered (`blur` → `threshold` → `bloom` →
`mix` → `displace` unlocks the most looks per module).

Every module merges with: `cases.ts` entry (tier-1/2 ride free), `chainParams`
on every effect (FX-picker eligible), `pnpm validate:stdlib` green. Every
showcase scene wraps its grabbables in `ctx.layer(...)` and consumes named rack
channels. Check items off as they merge.

## Effects (TOP filters)

- [ ] **blur** — separable gaussian, `radius` Signal (Blur TOP). Stateful RT ping-pong. → *neon-bloom*
- [ ] **threshold** — luma cutoff + softness (Threshold TOP); mask-maker, bloom ingredient. → *neon-bloom*
- [ ] **bloom** — threshold → blur → add, tuned as one primitive (Bloom TOP). → *neon-bloom*
- [ ] **mix** — blend TWO TexNodes: crossfade/add/multiply/screen/difference, `mix` Signal (Cross/Composite TOP). The A/B deck mixer. → *deck-mixer*
- [ ] **displace** — warp input UVs by a second TexNode's luminance/RG (Displace TOP). RT-resample pattern, `glitch` is the reference. → *warp-room*
- [ ] **hsv** — hue rotate / saturation / value as Signals (HSV Adjust TOP). → *deck-mixer*
- [ ] **mirror** — axis reflect with offset/angle, pure UV (Mirror TOP). → *warp-room*
- [ ] **tile** — UV repeat with per-tile flip (Tile TOP). → *warp-room*, *plasma-wall*
- [ ] **echo** — N-frame ring buffer, `delay` + `mix` Signals (Time Machine/Cache TOP). Replays, where `feedback` accumulates. → *deck-mixer*, *camera-ghost*
- [ ] **key** — chroma + luma keying to alpha, mode opt (Chroma Key TOP); makes any clip an `over` layer. → *camera-ghost*
- [ ] **posterize** — color step count as Signal (Quantize). → *camera-ghost*
- [ ] **invert** — trivial, conspicuous by absence. → *camera-ghost*
- [ ] **rgbSplit** — chromatic aberration solo, angle/amount Signals. → *deck-mixer*
- [ ] **vignette** — finishing-touch chain step. → *plasma-wall*
- [ ] **crt** — scanlines/curvature/aberration bundle. → *plasma-wall*

## Sources (TOP generators)

- [ ] **shape** — parametric circle/ring/rect/polygon, soft edge, premultiplied alpha (Circle/Rectangle TOP). → *neon-bloom*
- [ ] **gradient** — linear/radial/angular ramp through `ctx.palette.ramp` (Ramp TOP); the gradient *scene* exists, this is the composable module. → *neon-bloom*
- [ ] **solid** — flat color/palette stop (Constant TOP). Degenerate but load-bearing. → *type-strobe*
- [ ] **checker** — checker/grid, counts + line width as Signals (Checkerboard/Grid TOP). → *plasma-wall*
- [ ] **voronoi** — animated cellular noise (Voronoi TOP). → *warp-room*
- [ ] **plasma** — classic sin-field interference. → *plasma-wall*
- [ ] **text** — string → canvas-to-texture, font/size/weight opts (Text TOP). Re-render on string change; highest-value non-trivial source. → *type-strobe*
- [ ] **webcam** — `getUserMedia` live camera, device picker opt, image/video placement contract (Video Device In TOP). → *camera-ghost*

## Control (CHOPs)

- [ ] **envelope** — attack/release follower (Envelope/Slope CHOP); promotes the runtime's `envelopeSignal` to the catalog. → *spring-rave*
- [ ] **remap** — in-range → out-range with curve lin/exp/smoothstep (Math/Range CHOP); kills `new Signal((f)=>…)` boilerplate. → *spring-rave*
- [ ] **spring** — second-order bouncy follower, stiffness/damping (Spring CHOP). → *spring-rave*
- [ ] **sampleHold** — sample on a trigger channel, hold (S+H CHOP); "new value per kick". → *type-strobe*
- [ ] **gate** — threshold a signal to 0/1 with hysteresis (Logic CHOP). → *type-strobe*
- [ ] **counter** — count onsets, wrap at N (Count CHOP); beat-stepped scene logic. → *type-strobe*

## Geo (SOP-ish)

- [ ] **plane** — subdivided grid plane; the displacement substrate. → *rutt-etra*
- [ ] **tube** — extruded path/cylinder; beams and tunnels. → *spring-rave*
- [ ] **pointCloud** — render any GeoNode's vertices as instanced points (rides the M8 instancing machinery). → *rutt-etra*
- [ ] **displaceGeo** — vertex displacement by noise on any GeoNode, amount as Signal (Noise SOP); the 3D sibling of `displace`. → *rutt-etra*

## Showcase scenes (each lands WITH the last module it needs)

- [ ] **neon-bloom** — `shape` rings + `gradient` backdrop, kick-driven `threshold` → `blur` → `bloom` glow. *(blur, threshold, bloom, shape, gradient)*
- [ ] **deck-mixer** — two `video` decks through `mix` on a crossfader param, `hsv` hue ride, `rgbSplit` + `echo` on the drop. *(mix, hsv, rgbSplit, echo)*
- [ ] **warp-room** — `voronoi` displacing a video/noise bed via `displace`, folded by `mirror` + `tile`. *(displace, voronoi, mirror, tile)*
- [ ] **camera-ghost** — `webcam` keyed by `key`, ghosted with `echo`, crushed by `posterize`/`invert` on the kick. *(webcam, key, echo, posterize, invert)*
- [ ] **type-strobe** — `text` titles over `solid` flashes; `counter` steps lines per N beats, `sampleHold` re-rolls placement per kick, `gate` strobes. *(text, solid, counter, sampleHold, gate)*
- [ ] **plasma-wall** — `plasma` + `checker` tiled into an arcade wall, finished with `crt` + `vignette`. *(plasma, checker, tile, crt, vignette)*
- [ ] **rutt-etra** — `plane` displaced by `displaceGeo`, drawn as `pointCloud` scanlines under `orbitCam`; hippo-as-points cameo. *(plane, displaceGeo, pointCloud)*
- [ ] **spring-rave** — `tube` beams scaled by `spring`-physics kicks, `envelope` + `remap` shaping every drive signal. *(spring, envelope, remap, tube)*

## Coverage check

Every module above appears in at least one scene; a scene merges only when its
modules render in it live (eyes-on screenshot) with the knobs that matter
surfaced as params.
