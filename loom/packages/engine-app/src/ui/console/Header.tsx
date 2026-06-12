import { Box, Button, ButtonGroup, NativeSelect, Stack, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import type { PanicMode, SessionSnapshot } from "@loom/sidecar/protocol";
import { useEngine } from "../hooks";
import { fail, primeMidiPermission } from "../util";

type Props = { session: SessionSnapshot; onToggleRack: () => void };

export function Header({ session: s, onToggleRack }: Props) {
  const link = useEngine();
  return (
    <Stack
      direction="row"
      spacing={2}
      alignItems="center"
      component="header"
      sx={{ px: 1.75, py: 1, bgcolor: "background.paper", borderBottom: 1, borderColor: "divider", flex: "0 0 auto" }}
    >
      <Typography>
        <Box component="b" id="bpm">{s.bpm.toFixed(0)}</Box>{" "}
        <Typography component="span" variant="caption" color="text.secondary">BPM</Typography>
      </Typography>
      <Button id="tap" onClick={() => void link.req("set_transport", { tap: true }).catch(fail)}>
        TAP
      </Button>
      <Box sx={{ width: 120, height: 10, bgcolor: "#0006", border: 1, borderColor: "divider", borderRadius: "5px", overflow: "hidden" }}>
        <Box
          id="rmsfill"
          sx={{ height: "100%", bgcolor: "primary.main", transition: "width 80ms linear" }}
          style={{ width: `${Math.min(100, s.rms * 220)}%` }}
        />
      </Box>
      <AudioPicker session={s} />
      <MidiStatus midi={s.midi} />
      <Button onClick={onToggleRack} title="input rack (i)">rack</Button>
      <Box sx={{ flex: 1 }} />
      <Typography id="fps" variant="caption" color="text.secondary">
        {`${s.fps.toFixed(0)} fps · f${s.frame}`}
      </Typography>
      <PanicControls session={s} />
    </Stack>
  );
}

const PANIC_MODE_KEY = "loom.panicMode";

/**
 * The big red button (one click, executes the armed mode) plus the
 * arm-in-advance HOLD | SAFE SCENE control. Arming is human-only and persisted
 * in localStorage so a reload never silently re-arms a different behavior. The
 * armed mode reflects the engine snapshot; flipping the arm WHILE panicked also
 * re-executes it, which is the hold→scene escalation path (Stage ignores a
 * scene→hold downgrade). FR-7: the SCENE option shows a warning when the panic
 * instance is in build-fallback.
 */
function PanicControls({ session: s }: { session: SessionSnapshot }) {
  const link = useEngine();
  const mode = s.panicMode; // engine is the source of truth
  const synced = useRef(false);

  // On first connect, re-arm the engine from the persisted choice (the engine
  // boots in "hold"); thereafter the snapshot drives the UI.
  useEffect(() => {
    if (synced.current) return;
    const saved = localStorage.getItem(PANIC_MODE_KEY);
    if ((saved === "hold" || saved === "scene") && saved !== s.panicMode) {
      void link.req("arm_panic_mode", { mode: saved }).catch(fail);
    }
    synced.current = true;
  }, [s.panicMode, link]);

  const arm = (next: PanicMode) => {
    localStorage.setItem(PANIC_MODE_KEY, next);
    void link.req("arm_panic_mode", { mode: next }).catch(fail);
    // Escalate live if already panicked (hold→scene); Stage no-ops scene→hold.
    if (s.panicked) void link.req("panic", { mode: next }).catch(fail);
  };

  const sceneBroken = s.panicScene.status === "error";
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <ButtonGroup id="panicmode" size="small" variant="outlined" disableElevation>
        <Button
          id="panicmode-hold"
          variant={mode === "hold" ? "contained" : "outlined"}
          onClick={() => arm("hold")}
          sx={{ fontSize: 11, lineHeight: 1.1, px: 1 }}
        >
          HOLD
        </Button>
        <Button
          id="panicmode-scene"
          color={sceneBroken ? "warning" : "primary"}
          variant={mode === "scene" ? "contained" : "outlined"}
          onClick={() => arm("scene")}
          title={
            sceneBroken
              ? `safe scene unavailable — PANIC will hold (${s.panicScene.error ?? "build failed"})`
              : `cut to safe scene "${s.panicScene.name}"`
          }
          sx={{ fontSize: 11, lineHeight: 1.1, px: 1, textTransform: "none" }}
        >
          {sceneBroken ? "⚠ " : ""}SAFE SCENE
        </Button>
      </ButtonGroup>
      <NativeSelect
        value={s.panicScene.name}
        inputProps={{ id: "panicscene", title: "safe scene — the SAFE SCENE panic target" }}
        onChange={(e) => void link.req("set_panic_scene", { scene: e.target.value }).catch(fail)}
        sx={{ fontSize: 12, color: sceneBroken ? "warning.main" : "text.primary" }}
      >
        {/* The current target may be a failed build that isn't in the live
            catalog; surface it so the select still shows the real selection. */}
        {!s.availableScenes.includes(s.panicScene.name) && (
          <option value={s.panicScene.name}>{s.panicScene.name} (unavailable)</option>
        )}
        {s.availableScenes.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </NativeSelect>
      <Button
        id="panic"
        color="error"
        variant={s.panicked ? "contained" : "outlined"}
        onClick={() =>
          void link.req(s.panicked ? "resume" : "panic", s.panicked ? {} : { mode }).catch(fail)
        }
        sx={{ fontWeight: 700, fontSize: 15, px: 2.5 }}
      >
        {s.panicked ? "RESUME" : "PANIC"}
      </Button>
    </Stack>
  );
}

/** Audio source picker: reflects the engine's mode unless the user is mid-interaction. */
function AudioPicker({ session: s }: { session: SessionSnapshot }) {
  const link = useEngine();
  const [focused, setFocused] = useState(false);
  const [value, setValue] = useState("test");
  useEffect(() => {
    if (focused) return;
    if (s.audioMode === "test") {
      setValue("test");
    } else if (s.audioMode === "mic") {
      setValue((v) =>
        v.startsWith("mic:") ? v : s.audioDevices[0] ? `mic:${s.audioDevices[0].id}` : v,
      );
    }
  }, [s.audioMode, s.audioDevices, focused]);
  return (
    <NativeSelect
      value={value}
      inputProps={{ id: "audiomode", title: "audio input" }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const v = e.target.value;
        setValue(v);
        void link
          .req("set_audio", v === "test" ? { mode: "test" } : { mode: "mic", deviceId: v.slice(4) || undefined })
          .catch(fail);
      }}
    >
      <option value="test">test signal</option>
      {s.audioDevices.map((d) => (
        <option key={d.id} value={`mic:${d.id}`}>{d.label}</option>
      ))}
    </NativeSelect>
  );
}

function MidiStatus({ midi }: { midi: SessionSnapshot["midi"] }) {
  let text: string;
  let title: string;
  if (midi.status !== "ready") {
    text = "MIDI: connect";
    title = "click to grant MIDI access (Chrome prompts once per site)";
  } else if (midi.devices.length === 0) {
    text = "MIDI: no devices";
    title = "access granted — plug in a controller, it hot-plugs";
  } else {
    text = `MIDI ${midi.devices.join(" · ")}`;
    title = "connected MIDI inputs";
  }
  return (
    <Typography
      id="midistat"
      variant="caption"
      title={title}
      onClick={primeMidiPermission}
      sx={{
        color: midi.status !== "ready" ? "warning.main" : midi.devices.length === 0 ? "text.secondary" : "text.primary",
        cursor: midi.status !== "ready" ? "pointer" : "default",
        textDecoration: midi.status !== "ready" ? "underline dotted" : "none",
      }}
    >
      {text}
    </Typography>
  );
}
