import { Box, Typography } from "@mui/material";
import { useState, type ReactNode } from "react";
import { useEngine } from "../hooks";
import { fail } from "../util";

/**
 * Drop-to-go-live target spanning the whole console top (header + stage
 * strip — the strip alone was too thin to hit mid-set): dropping a tile
 * anywhere up top stages AND commits (R9.3; the human-sourced commit is
 * never gated). Drag events from children bubble here — #stagestrip keeps
 * its id as the validators' dispatch target.
 */
export function StageDropZone({ children }: { children: ReactNode }) {
  const link = useEngine();
  const [dragOver, setDragOver] = useState(false);
  return (
    <Box
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("text/loom-instance")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        // Children fire leave events while the drag crosses them — only an
        // exit from the zone itself ends the highlight.
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData("text/loom-instance");
        // One gesture, all the way: drop = stage + commit.
        if (id) {
          void link
            .req("stage", { instance: id })
            .then(() => link.req("commit", {}))
            .catch(fail);
        }
      }}
      sx={{
        position: "relative",
        flex: "0 0 auto",
        outline: dragOver ? "2px dashed" : "none",
        outlineColor: "warning.main",
        outlineOffset: "-2px",
      }}
    >
      {children}
      {dragOver && (
        <Typography
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "#000b",
            color: "warning.main",
            fontWeight: 700,
            letterSpacing: ".1em",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          drop to go LIVE
        </Typography>
      )}
    </Box>
  );
}
