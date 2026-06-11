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
const scenePick = $<HTMLSelectElement>("#scenepick");
const createBtn = $<HTMLButtonElement>("#createbtn");
const audioMode = $<HTMLSelectElement>("#audiomode");
const stageStrip = $("#stagestrip");
const rack = $("#rack");
const rackRows = $("#rackrows");
const rackToggle = $<HTMLButtonElement>("#racktoggle");
const midiStat = $("#midistat");

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
/** `${instance}:${path}` of the slider under the user's thumb, if any. */
let draggingKey: string | null = null;

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
createBtn.addEventListener("click", () => {
  if (!scenePick.value) return;
  void req("create_instance", { scene: scenePick.value })
    .then((result) => {
      selected = (result as { instance: string }).instance; // open its params
      render();
    })
    .catch(fail);
});
audioMode.addEventListener("change", () => {
  const v = audioMode.value;
  void req(
    "set_audio",
    v === "test" ? { mode: "test" } : { mode: "mic", deviceId: v.slice(4) || undefined },
  ).catch(fail);
});

// The input rack drawer (R6.4): every channel with a live meter and its
// global tuning widgets. Toggled on "i" (or the header button).
function toggleRack(): void {
  rack.classList.toggle("hidden");
  render();
}
rackToggle.addEventListener("click", toggleRack);
window.addEventListener("keydown", (e) => {
  if (e.key !== "i") return;
  const t = e.target;
  if (
    t instanceof HTMLInputElement ||
    t instanceof HTMLSelectElement ||
    t instanceof HTMLTextAreaElement
  ) {
    return; // typing, not a hotkey
  }
  toggleRack();
});

// Drag a tile onto the stage strip to stage it (R9.3).
stageStrip.addEventListener("dragover", (e) => {
  if (!e.dataTransfer?.types.includes("text/loom-instance")) return;
  e.preventDefault();
  stageStrip.classList.add("dragover");
});
stageStrip.addEventListener("dragleave", () => stageStrip.classList.remove("dragover"));
stageStrip.addEventListener("drop", (e) => {
  e.preventDefault();
  stageStrip.classList.remove("dragover");
  const id = e.dataTransfer?.getData("text/loom-instance");
  if (id) void req("stage", { instance: id }).catch(fail);
});

// ---- rendering ----
function render(): void {
  if (!state) return;
  const s = state.session;

  $("#bpm").textContent = s.bpm.toFixed(0);
  $("#fps").textContent = `${s.fps.toFixed(0)} fps · f${s.frame}`;
  $("#rmsfill").style.width = `${Math.min(100, s.rms * 220)}%`;

  // Audio source picker: rebuild options only when the device list changes;
  // reflect the engine's mode unless the user is mid-interaction.
  const devKey = s.audioDevices.map((d) => d.id).join(",");
  if (audioMode.dataset.devices !== devKey) {
    audioMode.dataset.devices = devKey;
    audioMode.replaceChildren(
      new Option("test signal", "test"),
      ...s.audioDevices.map((d) => new Option(d.label, `mic:${d.id}`)),
    );
  }
  if (document.activeElement !== audioMode) {
    if (s.audioMode === "test") audioMode.value = "test";
    else if (s.audioMode === "mic" && !audioMode.value.startsWith("mic:")) {
      const firstMic = audioMode.querySelector<HTMLOptionElement>('option[value^="mic:"]');
      if (firstMic) audioMode.value = firstMic.value;
    }
  }
  panicBtn.classList.toggle("engaged", s.panicked);
  panicBtn.textContent = s.panicked ? "RESUME" : "PANIC";
  const withScene = (id: string | null) => {
    if (id == null) return "—";
    const scene = s.instances.find((i) => i.id === id)?.scene;
    return scene && scene !== id ? `${id} · ${scene}` : id;
  };
  $("#livename").textContent = withScene(s.live);
  $("#stagedname").textContent = withScene(s.staged);
  commitBtn.disabled = s.staged == null || s.panicked;
  unstageBtn.disabled = s.staged == null;
  $("#fadeinfo").textContent = s.mix != null ? `crossfading ${(s.mix * 100).toFixed(0)}%` : "";
  if (document.activeElement !== armAgent) armAgent.checked = s.agentCommitArmed;

  // Scene picker: refresh options only when the library changes, keep the
  // user's selection otherwise.
  const sceneKey = s.availableScenes.join(",");
  if (scenePick.dataset.scenes !== sceneKey) {
    scenePick.dataset.scenes = sceneKey;
    const prev = scenePick.value;
    scenePick.replaceChildren(
      ...s.availableScenes.map((name) => {
        const o = document.createElement("option");
        o.value = name;
        o.textContent = name;
        return o;
      }),
    );
    if (s.availableScenes.includes(prev)) scenePick.value = prev;
  }

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
    stageBtn.textContent = inst.id === s.staged ? "unstage" : "stage";
    stageBtn.disabled = inst.id === s.live;
    const destroyBtn = tile.querySelector<HTMLButtonElement>(".destroybtn")!;
    destroyBtn.disabled = inst.id === s.live;
    tile.classList.toggle("selected", inst.id === selected);
    tile.classList.toggle("solo", inst.id === solo);
  }
  for (const tile of [...grid.querySelectorAll<HTMLElement>(".tile")]) {
    if (!seen.has(tile.dataset.id!)) tile.remove();
  }

  midiStat.textContent = s.midi.devices.length ? `MIDI ${s.midi.devices.join(" · ")}` : "MIDI —";
  midiStat.classList.toggle("dimlabel", s.midi.devices.length === 0);

  renderPanel();
  renderRack();
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
  tile.draggable = true;
  tile.addEventListener("dragstart", (e) => {
    e.dataTransfer?.setData("text/loom-instance", id);
  });
  tile.querySelector(".stagebtn")!.addEventListener("click", (e) => {
    e.stopPropagation();
    const isStaged = state?.session.staged === id;
    void req(isStaged ? "unstage" : "stage", isStaged ? {} : { instance: id }).catch(fail);
  });
  tile.querySelector(".destroybtn")!.addEventListener("click", (e) => {
    e.stopPropagation();
    void req("destroy_instance", { instance: id }).catch(fail);
  });
  return tile;
}

// ---- MIDI-learn helpers ----
// Bindings are keyed by scene engine-side; the Console resolves an instance
// to its scene to display bound/learning state on the right widgets.
function sceneFor(instance: string): string | null {
  if (instance === "globals") return "globals";
  return state?.session.instances.find((i) => i.id === instance)?.scene ?? null;
}

function bindingFor(instance: string, path: string) {
  const scene = sceneFor(instance);
  if (!scene) return null;
  return state?.session.bindings.find((b) => b.scene === scene && b.path === path) ?? null;
}

function isLearning(instance: string, path: string): boolean {
  const l = state?.session.midi.learning;
  const scene = sceneFor(instance);
  return l != null && scene != null && l.scene === scene && l.path === path;
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
    widgetsEl.replaceChildren(
      ...Object.entries(manifest).map(([path, p]) => makeWidget(selected!, path, p)),
    );
  }
  refreshWidgets(widgetsEl, selected, manifest);
}

/** Refresh values + learn-button states inside a widget container. */
function refreshWidgets(
  container: HTMLElement,
  instance: string,
  manifest: Record<string, ParamDesc>,
): void {
  for (const [path, p] of Object.entries(manifest)) {
    const input = container.querySelector<HTMLInputElement>(`[data-path="${cssEscape(path)}"]`);
    if (!input) continue;
    if (`${instance}:${path}` !== draggingKey) {
      if (p.type === "bool") input.checked = p.value === true;
      else input.value = String(p.value);
      const valueEl = container.querySelector<HTMLElement>(`[data-value="${cssEscape(path)}"]`);
      if (valueEl) valueEl.textContent = formatValue(p);
    }
    const learn = container.querySelector<HTMLButtonElement>(`[data-learn="${cssEscape(path)}"]`);
    if (learn) {
      const bound = bindingFor(instance, path);
      const learning = isLearning(instance, path);
      learn.classList.toggle("bound", bound != null && !learning);
      learn.classList.toggle("learning", learning);
      learn.textContent = learning ? "···" : bound ? `cc${bound.cc}` : "M";
      learn.title = learning
        ? "move a controller… (click to cancel)"
        : bound
          ? `bound to cc${bound.cc} — click to unbind`
          : "MIDI-learn: click, then move a knob";
    }
  }
}

function makeWidget(instance: string, path: string, p: ParamDesc, label?: string): HTMLElement {
  const div = document.createElement("div");
  div.className = "widget";
  const labelEl = document.createElement("label");
  const name = document.createElement("span");
  name.className = "pname";
  name.textContent = label ?? path;
  name.title = path;
  const learn = document.createElement("button");
  learn.className = "learnbtn";
  learn.dataset.learn = path;
  learn.textContent = "M";
  learn.addEventListener("click", (e) => {
    e.stopPropagation();
    // bound → unbind; learning → cancel (engine toggles); unbound → arm
    const action = bindingFor(instance, path) && !isLearning(instance, path) ? "midi_unbind" : "midi_learn";
    void req(action, { instance, path }).catch(fail);
  });
  const value = document.createElement("span");
  value.className = "pvalue";
  value.dataset.value = path;
  value.textContent = formatValue(p);
  labelEl.append(name, learn, value);
  div.appendChild(labelEl);

  const input = document.createElement("input");
  input.dataset.path = path;
  if (p.type === "bool") {
    input.type = "checkbox";
    input.checked = p.value === true;
    input.addEventListener("change", () => sendParam(instance, path, input.checked));
  } else {
    const min = p.min ?? 0;
    const max = p.max ?? 1;
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = p.type === "int" ? "1" : String(p.step ?? (max - min) / 200);
    input.value = String(p.value);
    input.addEventListener("pointerdown", () => (draggingKey = `${instance}:${path}`));
    input.addEventListener("pointerup", () => (draggingKey = null));
    input.addEventListener("input", () => sendParam(instance, path, Number(input.value)));
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
const queued = new Map<string, { instance: string; path: string; value: number | boolean }>();
let flushScheduled = false;
function sendParam(instance: string, path: string, value: number | boolean): void {
  queued.set(`${instance}:${path}`, { instance, path, value });
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(() => {
    flushScheduled = false;
    for (const w of queued.values()) {
      void req("set_param", { instance: w.instance, path: w.path, value: w.value }).catch(fail);
    }
    queued.clear();
  });
}

// ---- the input rack drawer ----
let rackKey = "";

function renderRack(): void {
  if (!state || rack.classList.contains("hidden")) return;
  const s = state.session;
  const globals = state.manifests.globals ?? {};
  const names = Object.keys(s.inputs).sort();
  const key = `${names.join(",")}|${Object.keys(globals).join(",")}`;
  if (key !== rackKey) {
    rackKey = key;
    rackRows.replaceChildren(...names.map((name) => makeRackRow(name, globals)));
  }
  for (const name of names) {
    const row = rackRows.querySelector<HTMLElement>(`.rackrow[data-name="${cssEscape(name)}"]`);
    if (!row) continue;
    const fill = row.querySelector<HTMLElement>(".rackfill")!;
    fill.style.width = `${Math.min(100, (s.inputs[name] ?? 0) * 100)}%`;
    row.classList.toggle("enabled", globals[`inputs.${name}.enabled`]?.value === true);
    refreshWidgets(row, "globals", channelParams(globals, name));
  }
}

/** The globals params belonging to one channel (enabled included). */
function channelParams(
  globals: Record<string, ParamDesc>,
  name: string,
): Record<string, ParamDesc> {
  const out: Record<string, ParamDesc> = {};
  for (const [path, p] of Object.entries(globals)) {
    if (path.startsWith(`inputs.${name}.`)) out[path] = p;
  }
  return out;
}

function makeRackRow(name: string, globals: Record<string, ParamDesc>): HTMLElement {
  const row = document.createElement("div");
  row.className = "rackrow";
  row.dataset.name = name;

  const meter = document.createElement("div");
  meter.className = "rackmeter";
  meter.innerHTML = `<div class="rackfill"></div>`;
  const label = document.createElement("b");
  label.className = "rackname";
  label.textContent = name;
  row.append(meter, label);

  const knobs = document.createElement("div");
  knobs.className = "rackknobs";
  for (const [path, p] of Object.entries(channelParams(globals, name))) {
    const knob = path.slice(`inputs.${name}.`.length);
    knobs.appendChild(makeWidget("globals", path, p, knob));
  }
  row.appendChild(knobs);
  return row;
}
