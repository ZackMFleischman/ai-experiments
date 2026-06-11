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
  /** Active modulator config, or null when the param is hand-driven (FR-8). */
  modulator?: Record<string, unknown> | null;
};

// One row per modulator type drives the popover (NFR-3: a new type is one
// zod variant in the runtime + one entry here).
type ModField =
  | { key: string; label: string; kind: "number"; step: number; min?: number; max?: number }
  | { key: string; label: string; kind: "select"; options: string[] }
  | { key: string; label: string; kind: "values" };

const MOD_TYPES: Array<{ type: string; bool: boolean; clocked: boolean; fields: ModField[] }> = [
  { type: "sine", bool: false, clocked: true, fields: [] },
  { type: "triangle", bool: false, clocked: true, fields: [] },
  {
    type: "ramp", bool: false, clocked: true,
    fields: [{ key: "direction", label: "direction", kind: "select", options: ["up", "down"] }],
  },
  {
    type: "square", bool: true, clocked: true,
    fields: [{ key: "duty", label: "duty", kind: "number", step: 0.05, min: 0, max: 1 }],
  },
  { type: "random", bool: true, clocked: true, fields: [] },
  {
    type: "drift", bool: false, clocked: true,
    fields: [{ key: "smooth", label: "smooth s", kind: "number", step: 0.1, min: 0 }],
  },
  {
    type: "cycle", bool: true, clocked: true,
    fields: [
      { key: "order", label: "order", kind: "select", options: ["forward", "reverse", "pingpong", "random"] },
      { key: "values", label: "values", kind: "values" },
    ],
  },
  {
    type: "audio", bool: false, clocked: false,
    fields: [
      { key: "band", label: "band", kind: "select", options: ["rms", "bass", "mid", "treble"] },
      { key: "smooth", label: "smooth s", kind: "number", step: 0.01, min: 0 },
    ],
  },
];
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

// Chrome gates WebMIDI behind a per-origin permission prompt, and the engine
// (Output window) is a bare projector page nobody clicks. Requesting access
// from HERE pops the prompt in the window the human is actually using; the
// grant is origin-wide, and the engine re-attaches the moment it lands.
function primeMidiPermission(): void {
  const nav = navigator as Navigator & { requestMIDIAccess?: () => Promise<unknown> };
  void nav.requestMIDIAccess?.().catch(() => {});
}
midiStat.addEventListener("click", primeMidiPermission);

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

  if (s.midi.status !== "ready") {
    midiStat.textContent = "MIDI: connect";
    midiStat.title = "click to grant MIDI access (Chrome prompts once per site)";
  } else if (s.midi.devices.length === 0) {
    midiStat.textContent = "MIDI: no devices";
    midiStat.title = "access granted — plug in a controller, it hot-plugs";
  } else {
    midiStat.textContent = `MIDI ${s.midi.devices.join(" · ")}`;
    midiStat.title = "connected MIDI inputs";
  }
  midiStat.classList.toggle("dimlabel", s.midi.devices.length === 0);
  midiStat.classList.toggle("midioff", s.midi.status !== "ready");

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
    widgetsEl.replaceChildren(...buildPanelWidgets(selected, manifest));
  }
  refreshWidgets(widgetsEl, selected, manifest);
}

/**
 * Dotted param paths form collapsible groups: "logo.tiltX" lands in a
 * "logo" <details> section labeled "tiltX"; dotless params stay flat on
 * top. Open state persists per group name so the cockpit layout sticks.
 */
function buildPanelWidgets(instance: string, manifest: Record<string, ParamDesc>): HTMLElement[] {
  const flat: HTMLElement[] = [];
  const groups = new Map<string, HTMLElement[]>();
  for (const [path, p] of Object.entries(manifest)) {
    const dot = path.indexOf(".");
    if (dot < 0) {
      flat.push(makeWidget(instance, path, p));
      continue;
    }
    const group = path.slice(0, dot);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(makeWidget(instance, path, p, path.slice(dot + 1)));
  }
  for (const [group, widgets] of groups) {
    const details = document.createElement("details");
    details.className = "pgroup";
    details.open = groupOpen(group);
    details.addEventListener("toggle", () => setGroupOpen(group, details.open));
    const summary = document.createElement("summary");
    summary.textContent = group;
    details.append(summary, ...widgets);
    flat.push(details);
  }
  return flat;
}

const GROUP_OPEN_KEY = "loom.pgroups.open";
function groupOpen(group: string): boolean {
  try {
    const open = JSON.parse(localStorage.getItem(GROUP_OPEN_KEY) ?? "{}") as Record<string, boolean>;
    return open[group] ?? false; // collapsed until the human opens it
  } catch {
    return false;
  }
}
function setGroupOpen(group: string, isOpen: boolean): void {
  try {
    const open = JSON.parse(localStorage.getItem(GROUP_OPEN_KEY) ?? "{}") as Record<string, boolean>;
    open[group] = isOpen;
    localStorage.setItem(GROUP_OPEN_KEY, JSON.stringify(open));
  } catch {
    // storage unavailable — groups just default closed each load
  }
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
    // FR-8: visible indicator + live read-only thumb on modulated params.
    const active = p.modulator != null;
    input.closest(".widget")?.classList.toggle("modulated", active);
    input.disabled = active; // engine rejects writes anyway (FR-7); this kills the drag
    input.title = active ? "modulated — detach to take over" : "";
    const modBtn = container.querySelector<HTMLButtonElement>(`[data-modbtn="${cssEscape(path)}"]`);
    if (modBtn) {
      modBtn.classList.toggle("on", active);
      modBtn.title = active
        ? `modulated: ${String((p.modulator as { type?: string }).type)}`
        : "attach a modulator";
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
    // No MIDI access yet? This click IS the gesture — pop the prompt here.
    if (state?.session.midi.status !== "ready") primeMidiPermission();
    // bound → unbind; learning → cancel (engine toggles); unbound → arm
    const action = bindingFor(instance, path) && !isLearning(instance, path) ? "midi_unbind" : "midi_learn";
    void req(action, { instance, path }).catch(fail);
  });
  const value = document.createElement("span");
  value.className = "pvalue";
  value.dataset.value = path;
  value.textContent = formatValue(p);
  // Modulators target instance params only — the globals rack gets no ∿.
  let pop: HTMLElement | null = null;
  if (instance !== "globals") {
    const modBtn = document.createElement("button");
    modBtn.type = "button";
    modBtn.className = "modbtn";
    modBtn.dataset.modbtn = path;
    modBtn.title = "attach a modulator";
    modBtn.textContent = "∿";
    const popEl = makeModPopover(instance, path, p);
    pop = popEl;
    modBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const open = !popEl.classList.contains("open");
      document.querySelectorAll(".modpop.open").forEach((el) => el.classList.remove("open"));
      if (open) {
        fillModPopover(popEl, currentDesc(instance, path) ?? p);
        popEl.classList.add("open");
      }
    });
    labelEl.append(name, modBtn, learn, value);
  } else {
    labelEl.append(name, learn, value);
  }
  div.appendChild(labelEl);

  const input = document.createElement("input");
  input.dataset.path = path;
  if (p.type === "bool") {
    input.type = "checkbox";
    input.checked = p.value === true;
    input.addEventListener("change", () => {
      sendParam(instance, path, input.checked);
      value.textContent = String(input.checked); // live label — refresh skips while interacting
    });
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
    input.addEventListener("input", () => {
      sendParam(instance, path, Number(input.value));
      // Live label: the session refresh skips this widget mid-drag, so the
      // dragged value must be painted here or it freezes until release.
      value.textContent = Number(input.value).toFixed(p.type === "int" ? 0 : 3);
    });
  }
  div.appendChild(input);
  if (p.description) {
    const d = document.createElement("div");
    d.className = "pdesc";
    d.textContent = p.description;
    div.appendChild(d);
  }
  if (pop) div.appendChild(pop);
  return div;
}

function currentDesc(instance: string, path: string): ParamDesc | undefined {
  return state?.manifests[instance]?.[path];
}

function makeModPopover(instance: string, path: string, p: ParamDesc): HTMLElement {
  const pop = document.createElement("div");
  pop.className = "modpop";
  const isBool = p.type === "bool";
  const types = MOD_TYPES.filter((d) => !isBool || d.bool);
  pop.innerHTML = `
    <div class="modrow"><span>type</span><select class="modtype">${types
      .map((d) => `<option value="${d.type}">${d.type}</option>`)
      .join("")}</select></div>
    <div class="modrow modrate-row"><span>every</span>
      <input class="modrate" type="number" min="0.05" step="0.25" value="4">
      <select class="modunit"><option value="beats">beats</option><option value="seconds">seconds</option></select>
      <span>phase</span><input class="modphase" type="number" min="0" max="1" step="0.05" value="0">
    </div>
    ${isBool ? "" : `<div class="modrow modrange-row"><span>range</span>
      <div class="dualrange"><input type="range" class="dlo"><input type="range" class="dhi"></div>
      <span class="dvals"></span></div>`}
    <div class="modfields"></div>
    <div class="moderr"></div>
    <div class="modrow modactions">
      <button type="button" class="modattach">attach</button>
      <button type="button" class="modretrig" title="restart the wave at lo">⟲ retrigger</button>
      <button type="button" class="moddetach">detach</button>
    </div>`;

  if (!isBool) {
    const min = p.min ?? 0;
    const max = p.max ?? 1;
    const step = p.type === "int" ? 1 : (max - min) / 200;
    const dlo = pop.querySelector<HTMLInputElement>(".dlo")!;
    const dhi = pop.querySelector<HTMLInputElement>(".dhi")!;
    for (const r of [dlo, dhi]) {
      r.min = String(min);
      r.max = String(max);
      r.step = String(step);
    }
    dlo.value = String(min);
    dhi.value = String(max);
    const sync = () => {
      if (Number(dlo.value) > Number(dhi.value)) {
        // the dragged thumb pushes the other
        if (document.activeElement === dlo) dhi.value = dlo.value;
        else dlo.value = dhi.value;
      }
      pop.querySelector(".dvals")!.textContent =
        `${Number(dlo.value).toFixed(2)}–${Number(dhi.value).toFixed(2)}`;
    };
    dlo.addEventListener("input", sync);
    dhi.addEventListener("input", sync);
    sync();
  }

  const typeSel = pop.querySelector<HTMLSelectElement>(".modtype")!;
  const renderFields = () => {
    const desc = MOD_TYPES.find((d) => d.type === typeSel.value)!;
    pop.querySelector<HTMLElement>(".modrate-row")!.style.display = desc.clocked ? "" : "none";
    pop.querySelector(".modfields")!.replaceChildren(
      ...desc.fields.map((fd) => {
        const row = document.createElement("div");
        row.className = "modrow";
        if (fd.kind === "select") {
          row.innerHTML = `<span>${fd.label}</span><select data-mf="${fd.key}">${fd.options
            .map((o) => `<option>${o}</option>`)
            .join("")}</select>`;
        } else if (fd.kind === "values") {
          row.innerHTML = `<span>${fd.label}</span><input data-mf="${fd.key}" type="text" placeholder="0.2, 0.5, 0.8">`;
        } else {
          row.innerHTML = `<span>${fd.label}</span><input data-mf="${fd.key}" type="number" step="${fd.step}"${
            fd.min !== undefined ? ` min="${fd.min}"` : ""}${fd.max !== undefined ? ` max="${fd.max}"` : ""}>`;
        }
        return row;
      }),
    );
  };
  typeSel.addEventListener("change", renderFields);
  renderFields();

  const send = (spec: Record<string, unknown>) => {
    pop.querySelector(".moderr")!.textContent = "";
    void req("modulate_param", { instance, path, modulator: spec }).catch((err: Error) => {
      pop.querySelector(".moderr")!.textContent = String(err.message ?? err);
    });
  };
  pop.querySelector(".modattach")!.addEventListener("click", () => send(buildModSpec(pop, p)));
  pop.querySelector(".modretrig")!.addEventListener("click", () => {
    const active = currentDesc(instance, path)?.modulator;
    send((active as Record<string, unknown>) ?? buildModSpec(pop, p));
  });
  pop.querySelector(".moddetach")!.addEventListener("click", () => {
    void req("clear_modulation", { instance, path }).catch(fail);
    pop.classList.remove("open");
  });
  return pop;
}

function buildModSpec(pop: HTMLElement, p: ParamDesc): Record<string, unknown> {
  const type = pop.querySelector<HTMLSelectElement>(".modtype")!.value;
  const desc = MOD_TYPES.find((d) => d.type === type)!;
  const spec: Record<string, unknown> = { type };
  if (desc.clocked) {
    const rate = Number(pop.querySelector<HTMLInputElement>(".modrate")!.value) || 4;
    spec[
      pop.querySelector<HTMLSelectElement>(".modunit")!.value === "beats" ? "periodBeats" : "periodSeconds"
    ] = rate;
    const phase = Number(pop.querySelector<HTMLInputElement>(".modphase")!.value);
    if (phase > 0) spec.phase = Math.min(phase, 1);
  }
  if (p.type !== "bool") {
    spec.lo = Number(pop.querySelector<HTMLInputElement>(".dlo")!.value);
    spec.hi = Number(pop.querySelector<HTMLInputElement>(".dhi")!.value);
  }
  for (const fd of desc.fields) {
    const el = pop.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-mf="${fd.key}"]`);
    if (!el || el.value === "") continue;
    if (fd.kind === "values") {
      const nums = el.value.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
      if (nums.length > 0) spec[fd.key] = nums;
    } else if (fd.kind === "number") spec[fd.key] = Number(el.value);
    else spec[fd.key] = el.value;
  }
  return spec;
}

function fillModPopover(pop: HTMLElement, p: ParamDesc): void {
  const mod = (p.modulator ?? null) as Record<string, unknown> | null;
  pop.querySelector(".moderr")!.textContent = "";
  pop.querySelector<HTMLButtonElement>(".modretrig")!.style.display = mod ? "" : "none";
  pop.querySelector<HTMLButtonElement>(".moddetach")!.style.display = mod ? "" : "none";
  pop.querySelector<HTMLButtonElement>(".modattach")!.textContent = mod ? "update" : "attach";
  if (!mod) return;
  const typeSel = pop.querySelector<HTMLSelectElement>(".modtype")!;
  typeSel.value = String(mod.type);
  typeSel.dispatchEvent(new Event("change"));
  if (mod.periodBeats != null || mod.periodSeconds != null) {
    pop.querySelector<HTMLInputElement>(".modrate")!.value = String(mod.periodBeats ?? mod.periodSeconds);
    pop.querySelector<HTMLSelectElement>(".modunit")!.value = mod.periodBeats != null ? "beats" : "seconds";
  }
  if (typeof mod.phase === "number") {
    pop.querySelector<HTMLInputElement>(".modphase")!.value = String(mod.phase);
  }
  const dlo = pop.querySelector<HTMLInputElement>(".dlo");
  const dhi = pop.querySelector<HTMLInputElement>(".dhi");
  if (dlo && mod.lo != null) {
    dlo.value = String(mod.lo);
    dlo.dispatchEvent(new Event("input"));
  }
  if (dhi && mod.hi != null) {
    dhi.value = String(mod.hi);
    dhi.dispatchEvent(new Event("input"));
  }
  for (const el of pop.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-mf]")) {
    const v = mod[el.dataset.mf!];
    if (v == null) continue;
    el.value = Array.isArray(v) ? v.join(", ") : String(v);
  }
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
