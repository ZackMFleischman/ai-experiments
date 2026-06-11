# LOOM agent guide

You are working inside LOOM, a live-visuals instrument. A human is watching the Output window while you work — **everything you save renders live**. Start sessions from `loom/` so the `loom` MCP server (.mcp.json) loads.

## Your eyes and hands (MCP tools)

- `get_session` — what's running: all instances with status, LIVE/STAGED pointers, available scenes, audio mode, BPM, fps, frame.
- `get_manifest` — every tweakable param of an instance: type, range, default, current value.
- Instance ids: the boot instance (bound to `live.scene.ts`) is `"boot"`; created ones are `"<scene>-<n>"`. The id `"live"` is an **alias** that always resolves to whatever instance is currently routed to output — it's the default everywhere, so "tweak the live thing" needs no lookup.
- `set_param` — change a param live (<100 ms, no recompile). Values clamp to range.
- `screenshot` — see an instance's actual pixels (live = the Output canvas, others = their preview target). Use it after every meaningful edit; never guess what's on screen.
- `create_instance` — build a scene (by name from `availableScenes`) into a sandbox tile. This is how you build candidates without touching the audience.
- `destroy_instance` — free a sandbox tile (the LIVE instance is protected).
- `stage` — mark your candidate for the live output. Staging is always safe — it changes nothing on screen.
- `commit` — crossfade staged → LIVE. **Human-gated by default**: unless the human armed agent commit in the Console, this errors — that's by design. Stage, then *tell the human it's ready to audition and commit*.

The engine must be running (`pnpm dev`) for tools to work. `?audio=test` on the URL gives synthetic kick/hats when no mic is around. The human's cockpit is `/console.html` — they see every instance as a tile, can spawn library scenes themselves (scene picker), drag your params, PANIC, and COMMIT there.

## Rules

1. **Params before rewrites.** To change feel (speed, intensity, color balance), first check `get_manifest` and use `set_param`. Only edit code when the structure itself is wrong. When code must change, expose the new knob as a param.
2. **Never touch `packages/runtime/`** (or `packages/engine-app/`, `packages/sidecar/`) during a session. Your territory is `content/` — scenes and modules. Engine changes are human-reviewed work, not session work.
3. **Signatures first.** When building multiple modules (especially in parallel), write each module's exported interface + metadata stub first, make `pnpm typecheck` pass, then fill in implementations. Types are the coordination protocol.
4. **Trust the safety net, verify with eyes.** A bad save never blanks the output (compile errors are withheld; build throws keep the previous scene; render throws freeze the instance). After a save, `get_session` tells you if your instance errored, and `screenshot` shows what's actually rendering.
5. **Build in sandboxes, hand over for the audience.** New work goes through `create_instance` → iterate (screenshot/set_param/edit) → `stage` → ask the human to COMMIT. Editing `live.scene.ts` directly hot-swaps whatever is bound to the boot instance — fine in a solo dev session, rude mid-performance.
6. **One file is the boot scene**: `content/scenes/live.scene.ts` re-exports the scene the engine boots with. Don't delete it.

## Architecture map

```
packages/runtime/    kernel: Signal/Events (pull-based, frame-memoized), Param/Manifest,
                     defineModule/defineScene, TexNode, BuildCtx, Instance, Time/Audio buses
packages/engine-app/ Output window: render loop, HMR, sidecar bridge   } not yours
packages/sidecar/    MCP <-> WebSocket bridge                          } to edit
content/modules/     {control,sources,effects}/  — composable typed modules   <- yours
content/scenes/      *.scene.ts + live.scene.ts re-export                     <- yours
content/CATALOG.md   generated index of every module + scene — read this first
```

`CATALOG.md` regenerates automatically on `pnpm typecheck` (or `pnpm catalog`); never edit it by hand.

Key kernel facts:
- Signals are pulled per frame and memoized on `f.frame`. CPU signals reach the GPU only through `ctx.uniformOf(signal)` — that registration is also what keeps stateful signals (lag, envelope) ticking.
- `TexNode.color` is strictly a TSL `vec4` node. Sources normalize to vec4 once.
- Stateful effects own pass ordering: return `[...input.passes, ownPass]`.
- Params: `ctx.float("name", { default, min, max, description })` → `param.signal()` → `ctx.uniformOf(...)`. Declare ranges honestly; the manifest is the human's mixing board.

## Workflow for "make me a visual"

1. `get_session` + `screenshot` — know the starting state.
2. Write/edit the scene in `content/scenes/`, point `live.scene.ts` at it, save.
3. `get_session` — check `instanceError` is null. `screenshot` — compare against intent.
4. Iterate on code until the structure is right, then converge on feel with `set_param`.
5. Report the manifest knobs you exposed so the human knows what they can ride.

See skills: **module-authoring** (writing a new module), **scene-composition** (writing/wiring scenes).
