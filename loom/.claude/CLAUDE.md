# LOOM agent guide

You are working inside LOOM, a live-visuals instrument. A human is watching the Output window while you work — **everything you save renders live**. Start sessions from `loom/` so the `loom` MCP server (.mcp.json) loads.

## Your eyes and hands (MCP tools)

- `get_session` — what's running: all instances with status, LIVE/STAGED pointers, available scenes, audio mode, BPM, fps, frame.
- `get_manifest` — every tweakable param of an instance: type, range, default, current value.
- Instance ids: the boot instance (bound to `live.scene.ts`) is `"boot"`; created ones are `"<scene>-<n>"`. The id `"live"` is an **alias** that always resolves to whatever instance is currently routed to output — it's the default everywhere, so "tweak the live thing" needs no lookup.
- The pseudo-instance `"globals"` serves the **input rack** *and* the **global color palettes**: `get_manifest {instance:"globals"}` lists every channel tuning (`inputs.kick.threshold`, `inputs.bass.gain`, …) plus the two palettes' stops (`palette.primary.0`…`palette.secondary.4`, `color` params holding `"#rrggbb"`); `set_param` retunes either live for every consumer at once. `get_session` carries the live channel values in `inputs` (your meters). Tunings persist across sessions (`content/state/`).
- `set_param` — change a param live (<100 ms, no recompile). Values clamp to range. Errors if the param is currently modulated — `clear_modulation` first.
- `modulate_param` — attach an LFO/stepper/audio-follower to a param: `{ type: sine|triangle|ramp|square|random|drift|cycle|audio, periodSeconds|periodBeats, lo?, hi?, ... }`. The engine animates it every frame inside the param's range. Same trust tier as `set_param` (no arming, live allowed); attaching replaces any existing modulator on that param. Use it to audition motion non-destructively before baking an `lfo` module into scene code. (Instance params only — not `"globals"`.)
- `clear_modulation` — detach a param's modulator (no-op success if none); the param holds its last value.
- `screenshot` — see an instance's actual pixels (live = the Output canvas, others = their preview target). Use it after every meaningful edit; never guess what's on screen.
- `create_instance` — build a scene (by name from `availableScenes`) into a sandbox tile. This is how you build candidates without touching the audience.
- `destroy_instance` — free a sandbox tile (the LIVE instance is protected).
- `stage` — mark your candidate for the live output. Staging is always safe — it changes nothing on screen.
- `unstage` — clear the staged candidate (nothing is marked for commit). Also safe — changes nothing on screen.
- `commit` — crossfade staged → LIVE. **Human-gated by default**: unless the human armed agent commit in the Console, this errors — that's by design. Stage, then *tell the human it's ready to audition and commit*.

The engine must be running (`pnpm dev`) for tools to work. `?audio=test` on the URL gives synthetic kick/hats when no mic is around. The human's cockpit is `/console.html` — they see every instance as a tile, can spawn library scenes themselves (scene picker), drag your params, PANIC, and COMMIT there.

## Rules

1. **Params before rewrites.** To change feel (speed, intensity, color balance), first check `get_manifest` and use `set_param`. Only edit code when the structure itself is wrong. When code must change, expose the new knob as a param.
2. **Never touch `packages/runtime/`** (or `packages/engine-app/`, `packages/sidecar/`) during a session. Your territory is `content/` — scenes and modules. Engine changes are human-reviewed work, not session work.
3. **Signatures first.** When building multiple modules (especially in parallel), write each module's exported interface + metadata stub first, make `pnpm typecheck` pass, then fill in implementations. Types are the coordination protocol.
4. **Trust the safety net, verify with eyes.** A bad save never blanks the output (compile errors are withheld; build throws keep the previous scene; render throws freeze the instance). After a save, `get_session` tells you if your instance errored, and `screenshot` shows what's actually rendering.
5. **Build in sandboxes, hand over for the audience.** New work goes through `create_instance` → iterate (screenshot/set_param/edit) → `stage` → ask the human to COMMIT. Editing `live.scene.ts` directly hot-swaps whatever is bound to the boot instance — fine in a solo dev session, rude mid-performance.
6. **One file is the boot scene**: `content/scenes/live.scene.ts` re-exports the scene the engine boots with. Don't delete it.
7. **Audio reactivity consumes named rack channels**: `ctx.input("kick")` etc., defined in `content/inputs.ts` (yours to grow — hot-reloads like a scene). A channel's detection meaning is owned globally; consumers get a per-instance `input.<name>.amount` trim. A differently-tuned kick is a **new named channel** (`kickTight`), never a local re-detection. MIDI binding/learn is human-only (Console).

## Architecture map (summary — full detail in `docs/architecture.md`)

```
packages/runtime/    kernel: Signal/Events (pull-based, frame-memoized), Param/Manifest,
                     defineModule/defineScene, TexNode, BuildCtx, Instance, Time/Audio buses
packages/engine-app/ Output window: render loop, HMR, sidecar bridge   } not yours
packages/sidecar/    MCP <-> WebSocket bridge                          } to edit
content/modules/     {control,sources,effects}/  — composable typed modules   <- yours
content/scenes/      *.scene.ts + live.scene.ts re-export                     <- yours
content/inputs.ts    the input rack: named channels (defineInputs)            <- yours
content/state/       tuned state (inputs/bindings/values) — engine-written JSON
content/CATALOG.md   generated index of every module + scene — read this first
```

`CATALOG.md` regenerates automatically — the dev server rebuilds it on every module/scene save, and `pnpm typecheck` rebuilds it as the offline gate. Never edit it by hand; it is always current in a live session.

**A new module ships with its test case**: add a minimal-opts entry to `content/test/cases.ts` — `pnpm test:content` sweeps every module on disk (tier-1 contract: shape, pass ordering, honest ranges; tier-2: param-extremes NaN sweep) and its completeness test fails if your module has no case. Scenes and modules must consume `ctx.input(<channel>)`, never `ctx.audio.onset(...)` — a source scan enforces it. `pnpm validate:stdlib` smoke-renders every module for eyes-on proof (full doc: "Testing & validation" in `docs/architecture.md`).

Key kernel facts:
- Signals are pulled per frame and memoized on `f.frame`. CPU signals reach the GPU only through `ctx.uniformOf(signal)` — that registration is also what keeps stateful signals (lag, envelope) ticking.
- `TexNode.color` is strictly a TSL `vec4` node. Sources normalize to vec4 once.
- Stateful effects own pass ordering: return `[...input.passes, ownPass]`.
- Params: `ctx.float("name", { default, min, max, description })` → `param.signal()` → `ctx.uniformOf(...)`. Declare ranges honestly; the manifest is the human's mixing board.
- Palettes (R7): scenes consume the global palettes via `ctx.palette.color(i)` (stop `i` as a vec3), `ctx.palette.ramp(t)` (gradient across the 5 stops, `t` in 0..1 → vec4), and `ctx.palette.own([...5 "#rrggbb"])` (scene-default stops). Using any of them auto-declares a `palette.source` int param (0 primary · 1 secondary · 2 own) — flip it with a plain `set_param`, **never a rebuild**; default is `own` when the scene called `own()`, else `primary`. Stop roles (0 bg · 1 edge · 2/3 core · 4 accent) are convention, not enforced. Color params can't be modulated.

## Workflow for "make me a visual"

1. `get_session` + `screenshot` — know the starting state.
2. Write/edit the scene in `content/scenes/`, point `live.scene.ts` at it, save.
3. `get_session` — check `instanceError` is null. `screenshot` — compare against intent.
4. Iterate on code until the structure is right, then converge on feel with `set_param`.
5. Report the manifest knobs you exposed so the human knows what they can ride.

See skills: **module-authoring** (writing a new module), **scene-composition** (writing/wiring scenes).
