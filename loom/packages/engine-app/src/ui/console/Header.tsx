import { Box, Button, NativeSelect, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import type { SessionSnapshot } from "@loom/sidecar/protocol";
import { useEngine } from "../hooks";
import { mono } from "../theme";
import { fail, primeMidiPermission } from "../util";

type Props = { session: SessionSnapshot; onToggleRack: () => void };

export function Header({ session: s, onToggleRack }: Props) {
  const link = useEngine();
  return (
    <Stack
      direction="row"
      spacing={1.25}
      alignItems="center"
      component="header"
      sx={{ px: 1.25, py: 0.5, bgcolor: "background.paper", borderBottom: 1, borderColor: "divider", flex: "0 0 auto" }}
    >
      <Typography
        sx={{
          fontFamily: mono,
          fontWeight: 800,
          letterSpacing: ".28em",
          color: "primary.main",
          fontSize: 14,
          userSelect: "none",
          mr: 0.25,
        }}
      >
        LOOM
      </Typography>
      <Button
        id="tap"
        title="tap tempo — click on the beat"
        onClick={() => void link.req("set_transport", { tap: true }).catch(fail)}
        sx={{ fontFamily: mono, px: 1 }}
      >
        <Box component="b" id="bpm" sx={{ fontSize: 13 }}>{s.bpm.toFixed(0)}</Box>
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
          BPM
        </Typography>
      </Button>
      <Box
        title="audio level"
        sx={{ width: 80, height: 8, bgcolor: "#0006", border: 1, borderColor: "divider", borderRadius: "4px", overflow: "hidden" }}
      >
        <Box
          id="rmsfill"
          sx={{ height: "100%", bgcolor: "primary.main", transition: "width 80ms linear" }}
          style={{ width: `${Math.min(100, s.rms * 220)}%` }}
        />
      </Box>
      <AudioPicker session={s} />
      <MidiStatus midi={s.midi} />
      <Button onClick={onToggleRack} title="input rack (i)">RACK</Button>
      <Box sx={{ flex: 1 }} />
      <Typography id="fps" title="render rate · frame counter" sx={{ fontFamily: mono, fontSize: 14, fontWeight: 700 }}>
        {s.fps.toFixed(0)}
        <Box component="span" sx={{ color: "text.secondary", fontSize: 11, fontWeight: 400 }}>
          {` fps · f${s.frame}`}
        </Box>
      </Typography>
      <Button component="a" href="/" target="_blank" rel="noopener" title="open the Output window in a new tab">
        output ⧉
      </Button>
      <Button component="a" href="/staged.html" target="_blank" rel="noopener" title="open the staged preview in a new tab">
        staged ⧉
      </Button>
      <Button
        id="panic"
        color="error"
        variant={s.panicked ? "contained" : "outlined"}
        onClick={() => void link.req(s.panicked ? "resume" : "panic").catch(fail)}
        sx={{ fontWeight: 700, fontSize: 14, px: 2 }}
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
