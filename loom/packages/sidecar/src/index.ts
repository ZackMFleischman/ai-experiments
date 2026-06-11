// LOOM sidecar: MCP server over stdio (Claude Code side) bridged to the
// engine over WebSocket. stdout belongs to MCP — log to stderr only.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer, type WebSocket } from "ws";
import { Broker } from "./broker";
import {
  CommitArgs,
  CreateInstanceArgs,
  DEFAULT_WS_PORT,
  InstanceArgs,
  ScreenshotResult,
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
      "BPM, RMS level, onset count, fps, frame counter, and the param paths of the live instance.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_manifest",
    description:
      "The live instance's param manifest: every tweakable param with type, range, default, " +
      "description, and current value. Read this before set_param.",
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
    name: "screenshot",
    description:
      "Capture an instance's output as a PNG — your eyes on what is actually rendering. " +
      "The live instance captures the Output canvas; others capture their preview target. " +
      "Returns the image plus width/height/frame metadata.",
    inputSchema: { type: "object", properties: { ...INSTANCE_PROP } },
  },
  {
    name: "create_instance",
    description:
      "Build a sandbox instance of a scene (by catalog name) so it renders in a Console tile " +
      "without touching the live output. Returns the new instance id and its param paths.",
    inputSchema: {
      type: "object",
      properties: {
        scene: { type: "string", description: "Scene name from get_session's availableScenes." },
        id: { type: "string", description: "Optional explicit instance id." },
      },
      required: ["scene"],
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
      case "screenshot": {
        const raw = await broker.request("screenshot", { ...InstanceArgs.parse(args) }, 10_000);
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
      case "commit": {
        const result = await broker.request("commit", { ...CommitArgs.parse(args) });
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
