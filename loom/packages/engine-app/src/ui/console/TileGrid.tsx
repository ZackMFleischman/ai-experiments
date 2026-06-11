import { Box } from "@mui/material";
import type { SessionSnapshot } from "@loom/sidecar/protocol";
import { Tile } from "./Tile";

type Props = {
  session: SessionSnapshot;
  selected: string | null;
  solo: string | null;
  onSelect: (id: string) => void;
  onSolo: (id: string) => void;
};

export function TileGrid({ session: s, selected, solo, onSelect, onSolo }: Props) {
  return (
    <Box
      id="grid"
      sx={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 1.5,
        p: 1.5,
        alignContent: "start",
        overflowY: "auto",
      }}
    >
      {s.instances.map((inst) => (
        <Tile
          key={inst.id}
          inst={inst}
          isLive={inst.id === s.live}
          isStaged={inst.id === s.staged}
          selected={inst.id === selected}
          solo={inst.id === solo}
          onSelect={onSelect}
          onSolo={onSolo}
        />
      ))}
    </Box>
  );
}
