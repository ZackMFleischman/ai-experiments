import { Box, Button, IconButton, Slider, Stack, Switch, Typography } from "@mui/material";
import { useState, type InputHTMLAttributes, type MouseEvent } from "react";
import type { ParamDesc } from "../engine-link";
import { useEngine, useEngineState } from "../hooks";
import { fail, primeMidiPermission } from "../util";
import { ModPopover } from "./ModPopover";

type Props = {
  instance: string;
  path: string;
  p: ParamDesc;
  /** Display label (group-stripped); defaults to the full path. */
  label?: string;
  /** Rack rows hide the description to stay one line tall. */
  dense?: boolean;
};

/**
 * One param: name · modulator button (instances only) · MIDI-learn · value,
 * over a slider (float/int) or switch (bool). DOM contract for validators:
 * data-path lands on the real <input>, data-learn on the learn button with
 * exact text "M" / "···" / "cc<N>".
 */
export function ParamWidget({ instance, path, p, label, dense }: Props) {
  const link = useEngine();
  const { session } = useEngineState();
  const [drag, setDrag] = useState<number | null>(null);
  const [modAnchor, setModAnchor] = useState<HTMLElement | null>(null);

  const modulated = p.modulator != null;
  const min = typeof p.min === "number" ? p.min : 0;
  const max = typeof p.max === "number" ? p.max : 1;

  // Bindings are keyed by scene engine-side; resolve this instance to its scene.
  const scene =
    instance === "globals"
      ? "globals"
      : (session?.instances.find((i) => i.id === instance)?.scene ?? null);
  const binding =
    scene != null
      ? (session?.bindings.find((b) => b.scene === scene && b.path === path) ?? null)
      : null;
  const learning =
    scene != null &&
    session?.midi.learning != null &&
    session.midi.learning.scene === scene &&
    session.midi.learning.path === path;

  const valueText =
    p.type === "bool"
      ? String(p.value)
      : (drag ?? Number(p.value)).toFixed(p.type === "int" ? 0 : 3);

  const onLearn = (e: MouseEvent) => {
    e.stopPropagation();
    // No MIDI access yet? This click IS the user gesture — pop the prompt here.
    if (session?.midi.status !== "ready") primeMidiPermission();
    // bound → unbind; learning → cancel (engine toggles); unbound → arm
    const action = binding != null && !learning ? "midi_unbind" : "midi_learn";
    void link.req(action, { instance, path }).catch(fail);
  };

  const inputAttrs = { "data-path": path } as InputHTMLAttributes<HTMLInputElement>;

  return (
    <Box className={`widget${modulated ? " modulated" : ""}`} sx={{ mb: dense ? 0 : 1.5, width: dense ? 170 : "auto" }}>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Typography variant="body2" noWrap title={path} sx={{ flex: 1, minWidth: 0 }}>
          {label ?? path}
        </Typography>
        {instance !== "globals" && (
          <IconButton
            size="small"
            data-modbtn={path}
            title={
              modulated
                ? `modulated: ${String((p.modulator as { type?: unknown }).type)}`
                : "attach a modulator"
            }
            onClick={(e) => {
              e.stopPropagation();
              setModAnchor((a) => (a ? null : e.currentTarget));
            }}
            sx={{ color: modulated ? "warning.main" : "text.secondary", fontSize: 14, p: 0.25 }}
          >
            ∿
          </IconButton>
        )}
        <Button
          className="learnbtn"
          data-learn={path}
          onClick={onLearn}
          title={
            learning
              ? "move a controller… (click to cancel)"
              : binding
                ? `bound to cc${binding.cc} — click to unbind`
                : "MIDI-learn: click, then move a knob"
          }
          sx={{
            minWidth: 0,
            px: 0.75,
            py: 0,
            fontSize: 11,
            lineHeight: "18px",
            ...(learning
              ? {
                  bgcolor: "warning.main",
                  color: "#000",
                  borderColor: "warning.main",
                  animation: "learnpulse 0.9s infinite alternate",
                }
              : binding
                ? { color: "primary.main", borderColor: "primary.main" }
                : { color: "text.secondary" }),
          }}
        >
          {learning ? "···" : binding ? `cc${binding.cc}` : "M"}
        </Button>
        <Typography variant="body2" data-value={path} sx={{ minWidth: 48, textAlign: "right" }}>
          {valueText}
        </Typography>
      </Stack>
      {p.type === "bool" ? (
        <Switch
          size="small"
          checked={p.value === true}
          disabled={modulated}
          inputProps={inputAttrs}
          onChange={(e) => link.sendParam(instance, path, e.target.checked)}
        />
      ) : (
        <Slider
          size="small"
          min={min}
          max={max}
          step={p.type === "int" ? 1 : (p.step ?? (max - min) / 200)}
          value={drag ?? Number(p.value)}
          disabled={modulated}
          color={modulated ? "warning" : "primary"}
          onChange={(_, v) => {
            const n = v as number;
            setDrag(n); // local value wins over the 10 Hz broadcast mid-drag
            link.sendParam(instance, path, n);
          }}
          onChangeCommitted={() => setDrag(null)}
          slotProps={{ input: inputAttrs }}
        />
      )}
      {!dense && p.description != null && p.description !== "" && (
        <Typography variant="caption" color="text.secondary" component="div">
          {p.description}
        </Typography>
      )}
      {instance !== "globals" && (
        <ModPopover
          instance={instance}
          path={path}
          p={p}
          anchorEl={modAnchor}
          onClose={() => setModAnchor(null)}
        />
      )}
    </Box>
  );
}
