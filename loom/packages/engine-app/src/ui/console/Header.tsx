import { Box, Button, NativeSelect, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import type { SessionSnapshot } from "@loom/sidecar/protocol";
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
      <Button
        id="panic"
        color="error"
        variant={s.panicked ? "contained" : "outlined"}
        onClick={() => void link.req(s.panicked ? "resume" : "panic").catch(fail)}
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
