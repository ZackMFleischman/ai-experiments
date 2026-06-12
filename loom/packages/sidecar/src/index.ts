// LOOM sidecar: MCP server over stdio (Claude Code side) bridged to the
// engine over WebSocket. stdout belongs to MCP — log to stderr only.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer, type WebSocket } from "ws";
import { Broker } from "./broker";
import {
  ClearModulationArgs,
  CommitArgs,
  CreateInstanceArgs,
  DEFAULT_WS_PORT,
  InstanceArgs,
  LoadProjectArgs,
  ModulateParamArgs,
  RecordFixtureArgs,
  SaveChainArgs,
  SaveProjectArgs,
  ScreenshotArgs,
  ScreenshotFramesResult,
  ScreenshotResult,
  SetChainArgs,
  SetParamArgs,
} from "./protocol";

const log = (...args: unknown[]) => console.error("[loom-sidecar]", ...args);

// ---- engine WS bridge ----

const port = Number(process.env.LOOM_WS_PORT) || DEFAULT_WS_PORT;
const broker = new Broker();
let engineSocket: WebSocket | null = null;

const wss = new WebSocketServer({ port });
wss.on("connection", (ws) => {
  if (engineSocket) {
    log("new engine connection replaces the old one");
    engineSocket.close();
  }
  engineSocket = ws;
  broker.attach({ send: (data) => ws.send(data) });
  log("engine connected");
  ws.on("message", (data) => broker.handleMessage(data.toString()));
  ws.on("close", () => {
    if (engineSocket === ws) {
      engineSocket = null;
      broker.attach(null);
      log("engine disconnected");
    }
  });
  ws.on("error", (err) => log("engine socket error:", err.message));
});
wss.on("error", (err) => {
  log(`WebSocket server failed on port ${port}:`, err.message);
  process.exit(1);
});
wss.on("listening", () => log(`listening for the engine on ws://localhost:${port}`));

// ---- MCP server ----

const INSTANCE_PROP = {
  instance: {
    type: "string",
    description:
      'Instance id from get_session. The default "live" is an alias that resolves to ' +
      "whatever instance is currently routed to the live output.",
  },
} as const;

const TOOLS = [
  {
    name: "get_session",
    description:
      "Snapshot of the running LOOM engine: active scene, instance error state, audio mode, " +
      "BPM, RMS level, onset count, fps, frame counter, and the param paths of the live instance. " +
      "Also reports PANIC state (panicMode armed, panicActive, panicScene health) — if panicActive " +
      "is non-null the human hit the emergency hatch, so stop touching the live path and wait.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_manifest",
    description:
      "The live instance's param manifest: every tweakable param with type, range, default, " +
      "description, and current value. Read this before set_param. Also lists the instance's " +
      "layer nodes ({id, parent, chain}) — named grabbables wrapped with ctx.layer() whose rig " +
      "params live at <id>.layer.x/y/scale/rotate/opacity and chain knobs at <id>.fx.<step>.<param>.",
    inputSchema: { type: "object", properties: { ...INSTANCE_PROP } },
  },
  {
    name: "set_param",
    description:
      "Set a param on the live instance by manifest path. Values clamp to the param's range; " +
      "the clamped value is returned. Takes effect next frame — no recompile. Prefer tuning " +
      "params over rewriting scene code.",
    inputSchema: {
      type: "object",
      properties: {
        ...INSTANCE_PROP,
        path: { type: "string", description: "Param path as listed in the manifest, e.g. \"trail\"." },
        value: {
          type: ["number", "boolean"],
          description: "New value. Numbers clamp to [min, max]; ints round.",
        },
      },
      required: ["path", "value"],
    },
  },
  {
    name: "modulate_param",
    description:
      "Attach (or replace) a modulator on a param: the engine animates it every frame between " +
      "lo..hi (defaults to the param's declared range; can never escape it). Same trust tier as " +
      "set_param — no arming needed, allowed on live. While modulated, set_param on that path " +
      "errors; clear_modulation takes back manual control. Clocked types need exactly one of " +
      "periodSeconds | periodBeats (beats track BPM live; phase 0..1 staggers).",
    inputSchema: {
      type: "object",
      properties: {
        ...INSTANCE_PROP,
        path: { type: "string", description: "Param path as listed in the manifest." },
        modulator: {
          type: "object",
          description:
            "sine|triangle: smooth lo↔hi bounce. ramp: saw (direction up|down). square: lo/hi " +
            "alternation (duty 0..1; works on bools). random: new value per interval (bools: coin " +
            "flip). drift: smoothed random walk (smooth seconds). cycle: step through values per " +
            "interval (order forward|reverse|pingpong|random; floats need values[]; ints default " +
            "to lo..hi steps; bools toggle). audio: follow a band (band bass|mid|treble|rms, " +
            "smooth seconds; takes no period).",
          properties: {
            type: {
              type: "string",
              enum: ["sine", "triangle", "ramp", "square", "random", "drift", "cycle", "audio"],
            },
            periodSeconds: { type: "number", description: "Cycle/interval length in seconds." },
            periodBeats: { type: "number", description: "Cycle/interval length in beats (tracks BPM)." },
            phase: { type: "number", description: "0..1 start offset." },
            lo: { type: "number", description: "Range low; defaults to the param's min." },
            hi: { type: "number", description: "Range high; defaults to the param's max." },
            direction: { type: "string", enum: ["up", "down"], description: "ramp only." },
            duty: { type: "number", description: "square only: fraction of the period at hi." },
            smooth: { type: "number", description: "drift/audio smoothing, seconds." },
            order: {
              type: "string",
              enum: ["forward", "reverse", "pingpong", "random"],
              description: "cycle only.",
            },
            values: { type: "array", items: { type: "number" }, description: "cycle: explicit step list." },
            band: { type: "string", enum: ["bass", "mid", "treble", "rms"], description: "audio only." },
          },
          required: ["type"],
        },
      },
      required: ["path", "modulator"],
    },
  },
  {
    name: "clear_modulation",
    description:
      "Detach the modulator from a param (no-op success if none). The param holds its last value.",
    inputSchema: {
      type: "object",
      properties: {
        ...INSTANCE_PROP,
        path: { type: "string", description: "Param path to release." },
      },
      required: ["path"],
    },
  },
  {
    name: "set_chain",
    description:
      "CRUD an instance's post-effect chain in one idempotent call: pass the FULL desired " +
      "list of steps (so add/remove/reorder/insert are all expressed by what you send). Each " +
      "step is { effect, id?, params?, mix? }: keep a surviving step's id to preserve its " +
      "knobs across a reorder; omit id for a new step. `effect` is a name from get_session's " +
      "availableEffects (code primitives + saved chains). After the rebuild, tune step knobs " +
      "with set_param on fx.<id>.<param>; fx.<id>.mix is the wet/dry (0 bypassed · 1 full), " +
      "ride it without a rebuild. restoreDefault:true resets to the scene's declared chain. " +
      "A throwing step is rejected and the previous chain + pixels keep running (NFR-5). " +
      "Pass node:<id> (a layer node from get_manifest's nodes) to chain FX onto just that " +
      "node — its knobs then live at <node>.fx.<step>.<param>. " +
      "Editing the LIVE chain needs agent-commit armed (sandbox instances are ungated).",
    inputSchema: {
      type: "object",
      properties: {
        ...INSTANCE_PROP,
        node: {
          type: "string",
          description: "Target a named layer node's chain (from get_manifest nodes); omit for the root chain.",
        },
        steps: {
          type: "array",
          description: "The full desired step list, in source→output order.",
          items: {
            type: "object",
            properties: {
              effect: { type: "string", description: "Effect name from availableEffects." },
              id: { type: "string", description: "Keep a surviving step's id; omit for a new one." },
              params: {
                type: "object",
                description: "Initial knob values keyed by sub-path (e.g. amount, mix); omit to carry/ default.",
              },
              mix: { type: "number", description: "Wet/dry 0..1 (default 1)." },
            },
            required: ["effect"],
          },
        },
        restoreDefault: {
          type: "boolean",
          description: "Reset to the scene's declared default chain (ignores steps).",
        },
      },
    },
  },
  {
    name: "save_chain",
    description:
      "Save the instance's current chain as a reusable composite effect — a data-only file " +
      "under content/modules/effects/chains/ that then appears in availableEffects and can be " +
      "dropped into any chain like a primitive. The chain must contain only primitive effects " +
      "(saved chains are one level deep). Live knob values are captured into the saved data.",
    inputSchema: {
      type: "object",
      properties: {
        ...INSTANCE_PROP,
        name: { type: "string", description: "lowerCamelCase name for the new effect." },
        description: { type: "string", description: "Optional one-line description." },
      },
      required: ["name"],
    },
  },
  {
    name: "screenshot",
    description:
      "Capture an instance's output as a PNG — your eyes on what is actually rendering. " +
      "The live instance captures the Output canvas; others capture their preview target. " +
      "Returns the image plus width/height/frame metadata. Pass frames:[…] on a FIXTURE " +
      "instance (created with inputs:\"fixture:<name>\") for a deterministic offline pass: " +
      "the scene is re-stepped from frame 0 on a virtual clock against the trace, so the " +
      "same fixture + frame list returns bit-identical images every call.",
    inputSchema: {
      type: "object",
      properties: {
        ...INSTANCE_PROP,
        frames: {
          type: "array",
          items: { type: "integer" },
          description: "Deterministic capture frames (fixture instances only, max 16).",
        },
      },
    },
  },
  {
    name: "create_instance",
    description:
      "Build a sandbox instance of a scene (by catalog name) so it renders in a Console tile " +
      "without touching the live output. Returns the new instance id and its param paths. " +
      "Pass inputs:\"fixture:<name>\" to replay a recorded input trace instead of the live " +
      "rack — deterministic audio-reactivity for development and validation.",
    inputSchema: {
      type: "object",
      properties: {
        scene: { type: "string", description: "Scene name from get_session's availableScenes." },
        id: { type: "string", description: "Optional explicit instance id." },
        inputs: { type: "string", description: 'Optional "fixture:<name>" input-trace replay.' },
      },
      required: ["scene"],
    },
  },
  {
    name: "record_fixture",
    description:
      "Record the live input rack (every channel's value, every frame) for N frames into " +
      "content/state/fixtures/<name>.json — a deterministic trace that create_instance " +
      "can replay via inputs:\"fixture:<name>\". Records whatever is playing (mic or the " +
      "synthetic test signal). Returns when the trace is written.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Trace name (letters, digits, - and _)." },
        frames: { type: "integer", description: "How many frames to record (1..3600, ~60/s)." },
      },
      required: ["name", "frames"],
    },
  },
  {
    name: "destroy_instance",
    description: "Dispose a non-live instance and free its tile. The LIVE instance is protected.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Instance id to destroy." },
      },
      required: ["instance"],
    },
  },
  {
    name: "stage",
    description:
      "Mark an instance as the staged candidate for the live output. Staging never changes " +
      "what the audience sees — the human auditions it in the Console and presses COMMIT.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Instance id to stage." },
      },
      required: ["instance"],
    },
  },
  {
    name: "unstage",
    description:
      "Clear the staged candidate (no instance is marked for commit). Like staging, this " +
      "never changes what the audience sees — it only drops the pending candidate.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "commit",
    description:
      "Crossfade the staged instance to the live output. Normally HUMAN-GATED: unless the " +
      "human has armed agent commit (Console toggle or ?agentCommit=1), this returns an " +
      "error telling you to ask them — stage your candidate and hand over.",
    inputSchema: {
      type: "object",
      properties: {
        durationFrames: {
          type: "integer",
          description: "Crossfade length in frames (0 = hard cut, default 60 ≈ 1 s).",
        },
      },
    },
  },
  {
    name: "list_projects",
    description:
      "List saved projects (set lists): named instance sets in content/state/projects/. " +
      "Load one with load_project; the current set saves with save_project.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "save_project",
    description:
      "Save the current instance set as a named project: every non-pinned instance's scene, " +
      "tuned values, modulators, root + per-node FX chains, in tile order, plus which one is " +
      "live. Writes content/state/projects/<name>.json (plain JSON in git). Gated like " +
      "commit: needs agent commit armed.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name (letters, digits, - and _), e.g. \"01-opener\"." },
      },
      required: ["name"],
    },
  },
  {
    name: "load_project",
    description:
      "Load a saved project AUDIENCE-SAFELY: every project instance builds into a sandbox " +
      "tile with its values, modulators and chains restored — LIVE keeps playing untouched. " +
      "The pre-load instances stick around until a commit from the loaded set lands, then " +
      "cull automatically. Stage one of the created instances and commit (or ask the human) " +
      "to walk into the set.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name from list_projects." },
      },
      required: ["name"],
    },
  },
] as const;

const server = new Server({ name: "loom", version: "0.2.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...TOOLS] }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    switch (name) {
      case "get_session": {
        const result = await broker.request("get_session", {});
        return textResult(result);
      }
      case "get_manifest": {
        const result = await broker.request("get_manifest", { ...InstanceArgs.parse(args) });
        return textResult(result);
      }
      case "set_param": {
        const result = await broker.request("set_param", { ...SetParamArgs.parse(args) });
        return textResult(result);
      }
      case "modulate_param": {
        const result = await broker.request("modulate_param", { ...ModulateParamArgs.parse(args) });
        return textResult(result);
      }
      case "clear_modulation": {
        const result = await broker.request("clear_modulation", { ...ClearModulationArgs.parse(args) });
        return textResult(result);
      }
      case "set_chain": {
        const result = await broker.request(
          "set_chain",
          { ...SetChainArgs.parse(args) },
          10_000, // a chain rebuild can outlast the default timeout
        );
        return textResult(result);
      }
      case "save_chain": {
        const result = await broker.request("save_chain", { ...SaveChainArgs.parse(args) });
        return textResult(result);
      }
      case "screenshot": {
        const parsed = ScreenshotArgs.parse(args);
        if (parsed.frames != null) {
          // Deterministic fixture pass — stepping hundreds of frames offline.
          const raw = await broker.request("screenshot", { ...parsed }, 30_000);
          const result = ScreenshotFramesResult.parse(raw);
          return {
            content: [
              ...result.frames.map((s) => ({ type: "image" as const, data: s.base64, mimeType: s.mime })),
              {
                type: "text" as const,
                text: JSON.stringify({
                  fixture: result.fixture,
                  frames: result.frames.map((s) => ({ frame: s.frame, width: s.width, height: s.height })),
                }),
              },
            ],
          };
        }
        const raw = await broker.request("screenshot", { ...parsed }, 10_000);
        const shot = ScreenshotResult.parse(raw);
        return {
          content: [
            { type: "image" as const, data: shot.base64, mimeType: shot.mime },
            {
              type: "text" as const,
              text: JSON.stringify({ width: shot.width, height: shot.height, frame: shot.frame }),
            },
          ],
        };
      }
      case "create_instance": {
        const result = await broker.request(
          "create_instance",
          { ...CreateInstanceArgs.parse(args) },
          10_000, // first build of a heavy scene can outlast the default timeout
        );
        return textResult(result);
      }
      case "destroy_instance": {
        const result = await broker.request("destroy_instance", { ...InstanceArgs.parse(args) });
        return textResult(result);
      }
      case "stage": {
        const result = await broker.request("stage", { ...InstanceArgs.parse(args) });
        return textResult(result);
      }
      case "unstage": {
        const result = await broker.request("unstage", {});
        return textResult(result);
      }
      case "commit": {
        const result = await broker.request("commit", { ...CommitArgs.parse(args) });
        return textResult(result);
      }
      case "list_projects": {
        const result = await broker.request("list_projects", {});
        return textResult(result);
      }
      case "save_project": {
        const result = await broker.request("save_project", { ...SaveProjectArgs.parse(args) });
        return textResult(result);
      }
      case "load_project": {
        // Loading builds every project instance — give heavy sets headroom.
        const result = await broker.request("load_project", { ...LoadProjectArgs.parse(args) }, 20_000);
        return textResult(result);
      }
      case "record_fixture": {
        const a = RecordFixtureArgs.parse(args);
        // Recording runs in real time: N frames at ~60 fps plus write headroom.
        const result = await broker.request("record_fixture", { ...a }, Math.ceil((a.frames / 60) * 1000) + 10_000);
        return textResult(result);
      }
      default:
        return errorResult(`unknown tool: ${name}`);
    }
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err));
  }
});

function textResult(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

await server.connect(new StdioServerTransport());
log("MCP server ready on stdio");
