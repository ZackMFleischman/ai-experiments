import type { SessionSnapshot } from "@loom/sidecar/protocol";

/**
 * /staged.html — a focused second-tab/-display view of the currently staged
 * instance (R9.3): big preview, COMMIT, unstage. Same BroadcastChannel
 * envelopes and hello-presence pattern as the Console; the staged instance
 * already renders to its preview target every frame, so the engine's thumbs
 * broadcast feeds the preview with no extra render work.
 */

type StateMsg = { kind: "state"; session: SessionSnapshot };

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`staged.html is missing ${sel}`);
  return el;
};

const nameEl = $("#stagedname");
const fadeInfo = $("#fadeinfo");
const commitBtn = $<HTMLButtonElement>("#commit");
const unstageBtn = $<HTMLButtonElement>("#unstage");
const preview = $<HTMLImageElement>("#preview");

const ch = new BroadcastChannel("loom");

// Request ids carry a per-tab prefix: the Console (and other staged tabs)
// share this channel and would otherwise resolve each other's responses.
const TAB = Math.random().toString(36).slice(2, 8);
let seq = 0;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function req(type: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const id = `s${TAB}-${++seq}`;
  ch.postMessage({ id, kind: "req", type, args });
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${type} timed out — engine not responding`));
    }, 5000);
  });
}

let session: SessionSnapshot | null = null;
let lastStateAt = -Infinity;

ch.onmessage = (ev) => {
  const data = ev.data as { kind?: string } & Record<string, unknown>;
  if (data.kind === "res") {
    const p = pending.get(data.id as string);
    if (p) {
      pending.delete(data.id as string);
      if (data.ok) p.resolve(data.result);
      else p.reject(new Error(String(data.error)));
    }
    return;
  }
  if (data.kind === "state") {
    session = (data as unknown as StateMsg).session;
    lastStateAt = performance.now();
    render();
    return;
  }
  if (data.kind === "thumbs" && session?.staged != null) {
    const url = (data.thumbs as Record<string, string>)[session.staged];
    if (url) preview.src = url;
  }
};

setInterval(() => ch.postMessage({ kind: "hello" }), 2000);
ch.postMessage({ kind: "hello" });
setInterval(() => {
  document.body.classList.toggle("disconnected", performance.now() - lastStateAt > 1500);
}, 500);

const fail = (err: unknown) => console.error("[staged]", err);
commitBtn.addEventListener("click", () => void req("commit", {}).catch(fail));
unstageBtn.addEventListener("click", () => void req("unstage").catch(fail));

function render(): void {
  if (!session) return;
  const s = session;
  const scene = s.staged != null ? s.instances.find((i) => i.id === s.staged)?.scene : undefined;
  nameEl.textContent =
    s.staged == null ? "—" : scene && scene !== s.staged ? `${s.staged} · ${scene}` : s.staged;
  fadeInfo.textContent = s.mix != null ? `crossfading ${(s.mix * 100).toFixed(0)}%` : "";
  commitBtn.disabled = s.staged == null || s.panicked;
  unstageBtn.disabled = s.staged == null;
  document.body.classList.toggle("hasstaged", s.staged != null);
  if (s.staged == null) preview.removeAttribute("src");
}
