import type { SessionSnapshot } from "@loom/sidecar/protocol";

/**
 * The Console: a cockpit page that talks to the engine (Output window) over
 * BroadcastChannel("loom") using the same request/response envelopes as the
 * sidecar wire. Fully functional with the agent and sidecar absent (R4.5).
 */

type ParamDesc = {
  type: "float" | "int" | "bool";
  value: number | boolean;
  default: number | boolean;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
};
type StateMsg = { kind: "state"; session: SessionSnapshot; manifests: Record<string, Record<string, ParamDesc>> };

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`console.html is missing ${sel}`);
  return el;
};

const grid = $("#grid");
const widgetsEl = $("#widgets");
const panelTitle = $("#paneltitle");
const commitBtn = $<HTMLButtonElement>("#commit");
const unstageBtn = $<HTMLButtonElement>("#unstage");
const panicBtn = $<HTMLButtonElement>("#panic");
const armAgent = $<HTMLInputElement>("#armagent");

const ch = new BroadcastChannel("loom");

// ---- request/response over the channel ----
let seq = 0;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function req(type: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const id = `c${++seq}`;
  ch.postMessage({ id, kind: "req", type, args });
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${type} timed out — engine not responding`));
    }, 5000);
  });
}

// ---- live state ----
let state: StateMsg | null = null;
let lastStateAt = -Infinity;
let selected: string | null = null;
let solo: string | null = null;
let draggingPath: string | null = null;

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
    state = data as unknown as StateMsg;
    lastStateAt = performance.now();
    render();
    return;
  }
  if (data.kind === "thumbs") {
    for (const [id, url] of Object.entries(data.thumbs as Record<string, string>)) {
      const img = grid.querySelector<HTMLImageElement>(`.tile[data-id="${cssEscape(id)}"] img`);
      if (img) img.src = url;
    }
  }
};

setInterval(() => ch.postMessage({ kind: "hello" }), 2000);
ch.postMessage({ kind: "hello" });
setInterval(() => {
  document.body.classList.toggle("disconnected", performance.now() - lastStateAt > 1500);
}, 500);

const cssEscape = (s: string) => CSS.escape(s);
const fail = (err: unknown) => console.error("[console]", err);

// ---- static controls ----
$("#tap").addEventListener("click", () => void req("set_transport", { tap: true }).catch(fail));
panicBtn.addEventListener("click", () => {
  const panicked = state?.session.panicked === true;
  void req(panicked ? "resume" : "panic").catch(fail);
});
commitBtn.addEventListener("click", () => void req("commit", {}).catch(fail));
unstageBtn.addEventListener("click", () => void req("unstage").catch(fail));
armAgent.addEventListener("change", () =>
  void req("arm_agent_commit", { armed: armAgent.checked }).catch(fail),
);

// ---- rendering ----
function render(): void {
  if (!state) return;
  const s = state.session;

  $("#bpm").textContent = s.bpm.toFixed(0);
  $("#fps").textContent = `${s.fps.toFixed(0)} fps · f${s.frame}`;
  $("#audiomode").textContent = `audio: ${s.audioMode}`;
  $("#rmsfill").style.width = `${Math.min(100, s.rms * 220)}%`;
  panicBtn.classList.toggle("engaged", s.panicked);
  panicBtn.textContent = s.panicked ? "RESUME" : "PANIC";
  $("#livename").textContent = s.live ?? "—";
  $("#stagedname").textContent = s.staged ?? "—";
  commitBtn.disabled = s.staged == null || s.panicked;
  unstageBtn.disabled = s.staged == null;
  $("#fadeinfo").textContent = s.mix != null ? `crossfading ${(s.mix * 100).toFixed(0)}%` : "";
  if (document.activeElement !== armAgent) armAgent.checked = s.agentCommitArmed;

  // tiles
  const seen = new Set<string>();
  for (const inst of s.instances) {
    seen.add(inst.id);
    let tile = grid.querySelector<HTMLElement>(`.tile[data-id="${cssEscape(inst.id)}"]`);
    if (!tile) {
      tile = makeTile(inst.id);
      grid.appendChild(tile);
    }
    tile.querySelector(".name")!.textContent = `${inst.id} · ${inst.scene}`;
    const chip = tile.querySelector(".chip")!;
    chip.textContent = inst.status === "ok" ? "✓" : "✗";
    chip.className = `chip ${inst.status}`;
    (chip as HTMLElement).title = inst.error ?? inst.status;
    tile.querySelector(".live-badge")!.classList.toggle("show", inst.id === s.live);
    tile.querySelector(".staged-badge")!.classList.toggle("show", inst.id === s.staged);
    const stageBtn = tile.querySelector<HTMLButtonElement>(".stagebtn")!;
    stageBtn.disabled = inst.id === s.live || inst.id === s.staged;
    const destroyBtn = tile.querySelector<HTMLButtonElement>(".destroybtn")!;
    destroyBtn.disabled = inst.id === s.live;
    tile.classList.toggle("selected", inst.id === selected);
    tile.classList.toggle("solo", inst.id === solo);
  }
  for (const tile of [...grid.querySelectorAll<HTMLElement>(".tile")]) {
    if (!seen.has(tile.dataset.id!)) tile.remove();
  }

  renderPanel();
}

function makeTile(id: string): HTMLElement {
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.dataset.id = id;
  tile.innerHTML = `
    <img alt="" />
    <div class="bar">
      <span class="chip ok">✓</span>
      <span class="name"></span>
      <span class="badge live-badge">LIVE</span>
      <span class="badge staged-badge">STAGED</span>
      <span style="flex:1"></span>
      <button class="stagebtn">stage</button>
      <button class="destroybtn" title="destroy">×</button>
    </div>`;
  tile.addEventListener("click", () => {
    selected = id;
    render();
  });
  tile.addEventListener("dblclick", () => {
    solo = solo === id ? null : id;
    render();
  });
  tile.querySelector(".stagebtn")!.addEventListener("click", (e) => {
    e.stopPropagation();
    void req("stage", { instance: id }).catch(fail);
  });
  tile.querySelector(".destroybtn")!.addEventListener("click", (e) => {
    e.stopPropagation();
    void req("destroy_instance", { instance: id }).catch(fail);
  });
  return tile;
}

// Param panel: rebuild widgets only when the selected manifest's shape
// changes; otherwise just refresh values (and never under the user's thumb).
let panelKey = "";

function renderPanel(): void {
  if (!state) return;
  const manifest = selected != null ? state.manifests[selected] : undefined;
  if (!selected || !manifest) {
    panelTitle.textContent = "no instance selected";
    widgetsEl.replaceChildren();
    panelKey = "";
    return;
  }
  panelTitle.textContent = selected;
  const key = `${selected}:${Object.keys(manifest).join(",")}`;
  if (key !== panelKey) {
    panelKey = key;
    widgetsEl.replaceChildren(...Object.entries(manifest).map(([path, p]) => makeWidget(path, p)));
  }
  for (const [path, p] of Object.entries(manifest)) {
    if (path === draggingPath) continue;
    const input = widgetsEl.querySelector<HTMLInputElement>(`[data-path="${cssEscape(path)}"]`);
    const valueEl = widgetsEl.querySelector<HTMLElement>(`[data-value="${cssEscape(path)}"]`);
    if (!input) continue;
    if (p.type === "bool") input.checked = p.value === true;
    else input.value = String(p.value);
    if (valueEl) valueEl.textContent = formatValue(p);
  }
}

function makeWidget(path: string, p: ParamDesc): HTMLElement {
  const div = document.createElement("div");
  div.className = "widget";
  const label = document.createElement("label");
  label.innerHTML = `<span>${path}</span><span class="pvalue" data-value="${path}">${formatValue(p)}</span>`;
  div.appendChild(label);

  const input = document.createElement("input");
  input.dataset.path = path;
  if (p.type === "bool") {
    input.type = "checkbox";
    input.checked = p.value === true;
    input.addEventListener("change", () => sendParam(path, input.checked));
  } else {
    const min = p.min ?? 0;
    const max = p.max ?? 1;
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = p.type === "int" ? "1" : String(p.step ?? (max - min) / 200);
    input.value = String(p.value);
    input.addEventListener("pointerdown", () => (draggingPath = path));
    input.addEventListener("pointerup", () => (draggingPath = null));
    input.addEventListener("input", () => sendParam(path, Number(input.value)));
  }
  div.appendChild(input);
  if (p.description) {
    const d = document.createElement("div");
    d.className = "pdesc";
    d.textContent = p.description;
    div.appendChild(d);
  }
  return div;
}

const formatValue = (p: ParamDesc) =>
  p.type === "bool" ? String(p.value) : Number(p.value).toFixed(p.type === "int" ? 0 : 3);

// rAF-throttle param writes so drags feel instant without flooding the channel.
const queued = new Map<string, number | boolean>();
let flushScheduled = false;
function sendParam(path: string, value: number | boolean): void {
  if (!selected) return;
  queued.set(path, value);
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(() => {
    flushScheduled = false;
    for (const [p, v] of queued) {
      void req("set_param", { instance: selected, path: p, value: v }).catch(fail);
    }
    queued.clear();
  });
}
