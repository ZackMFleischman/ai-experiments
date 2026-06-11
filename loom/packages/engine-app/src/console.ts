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
    // FR-8: visible indicator + live read-only thumb on modulated params.
    const active = p.modulator != null;
    input.closest(".widget")?.classList.toggle("modulated", active);
    input.disabled = active; // engine rejects writes anyway (FR-7); this kills the drag
    input.title = active ? "modulated — detach to take over" : "";
    const modBtn = widgetsEl.querySelector<HTMLButtonElement>(`[data-modbtn="${cssEscape(path)}"]`);
    if (modBtn) {
      modBtn.classList.toggle("on", active);
      modBtn.title = active
        ? `modulated: ${String((p.modulator as { type?: string }).type)}`
        : "attach a modulator";
    }
  }
}

function makeWidget(path: string, p: ParamDesc): HTMLElement {
  const div = document.createElement("div");
  div.className = "widget";
  const label = document.createElement("label");
  label.innerHTML =
    `<span>${path}</span>` +
    `<button type="button" class="modbtn" data-modbtn="${path}" title="attach a modulator">∿</button>` +
    `<span class="pvalue" data-value="${path}">${formatValue(p)}</span>`;
  div.appendChild(label);
  const pop = makeModPopover(path, p);
  label.querySelector(".modbtn")!.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const open = !pop.classList.contains("open");
    widgetsEl.querySelectorAll(".modpop.open").forEach((el) => el.classList.remove("open"));
    if (open) {
      fillModPopover(pop, currentDesc(path) ?? p);
      pop.classList.add("open");
    }
  });

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
  div.appendChild(pop);
  return div;
}

function currentDesc(path: string): ParamDesc | undefined {
  return selected != null ? state?.manifests[selected]?.[path] : undefined;
}

function makeModPopover(path: string, p: ParamDesc): HTMLElement {
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
    if (!selected) return;
    pop.querySelector(".moderr")!.textContent = "";
    void req("modulate_param", { instance: selected, path, modulator: spec }).catch((err: Error) => {
      pop.querySelector(".moderr")!.textContent = String(err.message ?? err);
    });
  };
  pop.querySelector(".modattach")!.addEventListener("click", () => send(buildModSpec(pop, p)));
  pop.querySelector(".modretrig")!.addEventListener("click", () => {
    const active = currentDesc(path)?.modulator;
    send((active as Record<string, unknown>) ?? buildModSpec(pop, p));
  });
  pop.querySelector(".moddetach")!.addEventListener("click", () => {
    if (!selected) return;
    void req("clear_modulation", { instance: selected, path }).catch(fail);
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
