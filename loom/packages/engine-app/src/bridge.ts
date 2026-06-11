import {
  InstanceArgs,
  RequestMsg,
  SetParamArgs,
  type ManifestResult,
  type ScreenshotResult,
  type SessionSnapshot,
  type SetParamResult,
} from "@loom/sidecar/protocol";

/**
 * Engine side of the sidecar protocol. main.ts supplies the hooks; this file
 * owns the socket, reconnection, and request validation. A hook that throws
 * becomes an ok:false response — never an engine crash.
 */
export interface BridgeHooks {
  session(): SessionSnapshot;
  manifest(instance: string): ManifestResult;
  setParam(args: SetParamArgs): SetParamResult;
  /** Resolved by the render loop on the next presented frame. */
  screenshot(instance: string): Promise<ScreenshotResult>;
}

const RECONNECT_MS = 2000;

export function startBridge(url: string, hooks: BridgeHooks): void {
  let ws: WebSocket | null = null;

  function connect(): void {
    ws = new WebSocket(url);
    ws.onopen = () => console.info(`[loom] sidecar connected (${url})`);
    ws.onmessage = (ev) => {
      void respond(String(ev.data)).then((res) => {
        if (res !== null && ws?.readyState === WebSocket.OPEN) ws.send(res);
      });
    };
    ws.onclose = () => {
      ws = null;
      setTimeout(connect, RECONNECT_MS);
    };
    ws.onerror = () => ws?.close();
  }

  async function respond(raw: string): Promise<string | null> {
    let req: RequestMsg;
    try {
      req = RequestMsg.parse(JSON.parse(raw));
    } catch {
      return null; // not a request we can even correlate — drop it
    }
    try {
      const result = await dispatch(req);
      return JSON.stringify({ id: req.id, kind: "res", ok: true, result });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ id: req.id, kind: "res", ok: false, error });
    }
  }

  function dispatch(req: RequestMsg): unknown {
    switch (req.type) {
      case "get_session":
        return hooks.session();
      case "get_manifest":
        return hooks.manifest(InstanceArgs.parse(req.args).instance);
      case "set_param":
        return hooks.setParam(SetParamArgs.parse(req.args));
      case "screenshot":
        return hooks.screenshot(InstanceArgs.parse(req.args).instance);
    }
  }

  connect();
}
