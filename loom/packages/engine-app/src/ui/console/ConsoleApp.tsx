import { Box } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { Disconnected } from "../Disconnected";
import { useEngineState } from "../hooks";
import { Header } from "./Header";
import { ParamPanel } from "./ParamPanel";
import { Rack } from "./Rack";
import { StageStrip } from "./StageStrip";
import { TileGrid } from "./TileGrid";

const EMBED_AFTER_MS = 2500;

type EngineWindow = Window & { __loom?: { resumeAudio?: () => void } };

export function ConsoleApp() {
  const { session, manifests, connected } = useEngineState();
  const [selected, setSelected] = useState<string | null>(null);
  const [solo, setSolo] = useState<string | null>(null);
  const [rackOpen, setRackOpen] = useState(false);

  // The Output window is optional: if no engine says hello within a grace
  // period, boot one in a hidden same-origin iframe. It stands down by itself
  // if a real Output window opens later. ?embed=0 disables (validators use it
  // so an embedded engine never dials their isolated sidecar's default port).
  const allowEmbed = new URLSearchParams(location.search).get("embed") !== "0";
  const [embed, setEmbed] = useState(false);
  const embedFrame = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    if (!allowEmbed || embed || connected) return;
    const t = window.setTimeout(() => setEmbed(true), EMBED_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [allowEmbed, embed, connected]);

  // "i" toggles the rack — unless the human is typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "i") return;
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLSelectElement ||
        t instanceof HTMLTextAreaElement
      ) {
        return;
      }
      setRackOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Box
      sx={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
      // AudioContexts need a user gesture; the embedded engine's document never
      // gets one, but activation is visible to same-origin frames — forward ours.
      onPointerDownCapture={() => {
        (embedFrame.current?.contentWindow as EngineWindow | null)?.__loom?.resumeAudio?.();
      }}
    >
      {session && (
        <>
          <Header session={session} onToggleRack={() => setRackOpen((o) => !o)} />
          <StageStrip session={session} />
          <Box component="main" sx={{ flex: 1, display: "flex", minHeight: 0 }}>
            <TileGrid
              session={session}
              selected={selected}
              solo={solo}
              onSelect={setSelected}
              onSolo={(id) => setSolo((cur) => (cur === id ? null : id))}
              onCreated={setSelected}
            />
            <ParamPanel
              instance={selected}
              manifest={selected != null ? manifests[selected] : undefined}
            />
          </Box>
          {rackOpen && <Rack session={session} globals={manifests.globals ?? {}} />}
        </>
      )}
      {embed && (
        <Box
          component="iframe"
          ref={embedFrame}
          src="/?embedded=1&audio=test"
          title="embedded loom engine"
          allow="autoplay; microphone"
          sx={{
            position: "fixed",
            bottom: 0,
            right: 0,
            width: 2,
            height: 2,
            opacity: 0,
            border: 0,
            pointerEvents: "none",
          }}
        />
      )}
      <Disconnected connected={connected} starting={embed} />
    </Box>
  );
}
