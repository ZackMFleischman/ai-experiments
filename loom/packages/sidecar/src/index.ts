// LOOM sidecar: MCP server over stdio (Claude Code side) bridged to the
// engine over WebSocket. stdout belongs to MCP — log to stderr only.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer, type WebSocket } from "ws";
import { Broker } from "./broker";
import {
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
    description: 'Instance id. M2 has a single live instance: "live" (the default).',
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
      "Capture the engine's Output canvas as a PNG — your eyes on what is actually rendering. " +
      "Returns the image plus width/height/frame metadata.",
    inputSchema: { type: "object", properties: { ...INSTANCE_PROP } },
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
