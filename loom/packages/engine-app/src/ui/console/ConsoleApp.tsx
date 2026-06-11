import { Box } from "@mui/material";
import { useEffect, useState } from "react";
import { Disconnected } from "../Disconnected";
import { useEngineState } from "../hooks";
import { Header } from "./Header";
import { ParamPanel } from "./ParamPanel";
import { Rack } from "./Rack";
import { StageStrip } from "./StageStrip";
import { TileGrid } from "./TileGrid";

export function ConsoleApp() {
  const { session, manifests, connected } = useEngineState();
  const [selected, setSelected] = useState<string | null>(null);
  const [solo, setSolo] = useState<string | null>(null);
  const [rackOpen, setRackOpen] = useState(false);

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
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {session && (
        <>
          <Header session={session} onToggleRack={() => setRackOpen((o) => !o)} />
          <StageStrip session={session} manifests={manifests} />
          <Box component="main" sx={{ flex: 1, display: "flex", minHeight: 0 }}>
            <TileGrid
              session={session}
              selected={selected}
              solo={solo}
              onSelect={setSelected}
              onSolo={(id) => setSolo((cur) => (cur === id ? null : id))}
            />
            <ParamPanel
              instance={selected}
              manifest={selected != null ? manifests[selected] : undefined}
            />
          </Box>
          {rackOpen && <Rack session={session} globals={manifests.globals ?? {}} />}
        </>
      )}
      <Disconnected connected={connected} />
    </Box>
  );
}
