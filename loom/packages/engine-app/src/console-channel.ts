import { respond } from "./bridge";
import type { EngineApi } from "./engine-api";

const STATE_MS = 100; // ~10 fps session state
const THUMBS_MS = 150; // ~6.6 fps tile thumbnails
const PRESENCE_TIMEOUT_MS = 5000;

/**
 * Engine side of the Console link: same request/response envelopes as the
 * sidecar wire, plus periodic state and thumbnail broadcasts — but only
 * while a Console has said hello recently. Works with the sidecar (and the
 * agent) completely absent.
 */
export function startConsoleChannel(api: EngineApi): void {
  const ch = new BroadcastChannel("loom");
  let lastHello = -Infinity;
  const consolePresent = () => performance.now() - lastHello < PRESENCE_TIMEOUT_MS;

  ch.onmessage = (ev) => {
    const data: unknown = ev.data;
    if (typeof data !== "object" || data === null) return;
    const kind = (data as { kind?: string }).kind;
    if (kind === "hello") {
      lastHello = performance.now();
      api.markConsolePresent(); // lets the render loop mirror the live canvas
      return;
    }
    if (kind === "req") {
      void respond(api, JSON.stringify(data), "human").then((res) => {
        if (res !== null) ch.postMessage(JSON.parse(res));
      });
    }
  };

  setInterval(() => {
    if (consolePresent()) ch.postMessage({ kind: "state", ...api.consoleState() });
  }, STATE_MS);

  let thumbsBusy = false;
  setInterval(() => {
    if (!consolePresent() || thumbsBusy) return;
    thumbsBusy = true;
    void api
      .thumbnails()
      .then((thumbs) => ch.postMessage({ kind: "thumbs", thumbs }))
      .catch(() => {})
      .finally(() => {
        thumbsBusy = false;
      });
  }, THUMBS_MS);
}
