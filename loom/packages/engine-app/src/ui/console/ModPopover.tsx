import {
  Box, Button, NativeSelect, Popover, Slider, Stack, TextField, Typography,
} from "@mui/material";
import { useEffect, useState, type ReactNode } from "react";
import type { ParamDesc } from "../engine-link";
import { useEngine } from "../hooks";
import { MOD_TYPES } from "../mod-types";
import { fail } from "../util";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Typography variant="caption" color="text.secondary" sx={{ width: 44, flex: "0 0 auto" }}>
        {label}
      </Typography>
      {children}
    </Stack>
  );
}

type Props = {
  instance: string;
  path: string;
  p: ParamDesc;
  anchorEl: HTMLElement | null;
  onClose: () => void;
};

/** Attach/update/retrigger/detach a modulator on one param (port of the old popover). */
export function ModPopover({ instance, path, p, anchorEl, onClose }: Props) {
  const link = useEngine();
  const isBool = p.type === "bool";
  const types = MOD_TYPES.filter((d) => !isBool || d.bool);
  const min = typeof p.min === "number" ? p.min : 0;
  const max = typeof p.max === "number" ? p.max : 1;
  const open = anchorEl != null;
  const active = (p.modulator ?? null) as Record<string, unknown> | null;

  const [type, setType] = useState(types[0]?.type ?? "sine");
  const [rate, setRate] = useState("4");
  const [unit, setUnit] = useState<"beats" | "seconds">("beats");
  const [phase, setPhase] = useState("0");
  const [range, setRange] = useState<[number, number]>([min, max]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");

  // Seed the form from the active modulator each time the popover opens.
  useEffect(() => {
    if (!open) return;
    setErr("");
    if (!active) return;
    setType(String(active.type));
    if (active.periodBeats != null || active.periodSeconds != null) {
      setRate(String(active.periodBeats ?? active.periodSeconds));
      setUnit(active.periodBeats != null ? "beats" : "seconds");
    }
    if (typeof active.phase === "number") setPhase(String(active.phase));
    setRange([
      typeof active.lo === "number" ? active.lo : min,
      typeof active.hi === "number" ? active.hi : max,
    ]);
    const f: Record<string, string> = {};
    for (const d of MOD_TYPES) {
      for (const fd of d.fields) {
        const v = active[fd.key];
        if (v != null) f[fd.key] = Array.isArray(v) ? v.join(", ") : String(v);
      }
    }
    setFields(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const desc = MOD_TYPES.find((d) => d.type === type) ?? MOD_TYPES[0]!;

  const buildSpec = (): Record<string, unknown> => {
    const spec: Record<string, unknown> = { type };
    if (desc.clocked) {
      spec[unit === "beats" ? "periodBeats" : "periodSeconds"] = Number(rate) || 4;
      const ph = Number(phase);
      if (ph > 0) spec.phase = Math.min(ph, 1);
    }
    if (!isBool) {
      spec.lo = range[0];
      spec.hi = range[1];
    }
    for (const fd of desc.fields) {
      const raw = fd.kind === "select" ? (fields[fd.key] ?? fd.options[0]) : fields[fd.key];
      if (raw == null || raw === "") continue;
      if (fd.kind === "values") {
        const nums = raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
        if (nums.length > 0) spec[fd.key] = nums;
      } else if (fd.kind === "number") spec[fd.key] = Number(raw);
      else spec[fd.key] = raw;
    }
    return spec;
  };

  const send = (spec: Record<string, unknown>) => {
    setErr("");
    void link
      .req("modulate_param", { instance, path, modulator: spec })
      .catch((e: Error) => setErr(String(e.message ?? e)));
  };

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
    >
      <Box className="modpop" sx={{ p: 1.5, width: 300, display: "flex", flexDirection: "column", gap: 1 }}>
        <Row label="type">
          <NativeSelect value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((d) => (
              <option key={d.type} value={d.type}>{d.type}</option>
            ))}
          </NativeSelect>
        </Row>
        {desc.clocked && (
          <Row label="every">
            <TextField
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputProps={{ min: 0.05, step: 0.25 }}
              sx={{ width: 76 }}
            />
            <NativeSelect value={unit} onChange={(e) => setUnit(e.target.value as "beats" | "seconds")}>
              <option value="beats">beats</option>
              <option value="seconds">seconds</option>
            </NativeSelect>
            <Typography variant="caption" color="text.secondary">phase</Typography>
            <TextField
              type="number"
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              inputProps={{ min: 0, max: 1, step: 0.05 }}
              sx={{ width: 68 }}
            />
          </Row>
        )}
        {!isBool && (
          <Row label="range">
            <Slider
              size="small"
              color="warning"
              value={range}
              min={min}
              max={max}
              step={p.type === "int" ? 1 : (max - min) / 200}
              onChange={(_, v) => setRange(v as [number, number])}
              sx={{ flex: 1, mx: 1 }}
            />
            <Typography variant="caption" sx={{ minWidth: 70, textAlign: "right" }}>
              {range[0].toFixed(2)}–{range[1].toFixed(2)}
            </Typography>
          </Row>
        )}
        {desc.fields.map((fd) => (
          <Row key={fd.key} label={fd.label}>
            {fd.kind === "select" ? (
              <NativeSelect
                value={fields[fd.key] ?? fd.options[0]}
                onChange={(e) => setFields((f) => ({ ...f, [fd.key]: e.target.value }))}
              >
                {fd.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </NativeSelect>
            ) : fd.kind === "values" ? (
              <TextField
                placeholder="0.2, 0.5, 0.8"
                value={fields[fd.key] ?? ""}
                onChange={(e) => setFields((f) => ({ ...f, [fd.key]: e.target.value }))}
                sx={{ flex: 1 }}
              />
            ) : (
              <TextField
                type="number"
                value={fields[fd.key] ?? ""}
                onChange={(e) => setFields((f) => ({ ...f, [fd.key]: e.target.value }))}
                inputProps={{
                  step: fd.step,
                  ...(fd.min !== undefined ? { min: fd.min } : {}),
                  ...(fd.max !== undefined ? { max: fd.max } : {}),
                }}
                sx={{ width: 84 }}
              />
            )}
          </Row>
        ))}
        {err !== "" && (
          <Typography variant="caption" color="error">{err}</Typography>
        )}
        <Stack direction="row" spacing={1}>
          <Button onClick={() => send(buildSpec())}>{active ? "update" : "attach"}</Button>
          {active && (
            <Button title="restart the wave at lo" onClick={() => send(active)}>⟲ retrigger</Button>
          )}
          {active && (
            <Button
              onClick={() => {
                void link.req("clear_modulation", { instance, path }).catch(fail);
                onClose();
              }}
            >
              detach
            </Button>
          )}
        </Stack>
      </Box>
    </Popover>
  );
}
