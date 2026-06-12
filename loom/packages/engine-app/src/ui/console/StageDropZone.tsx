import { Box, Typography } from "@mui/material";
import { useEffect, useState, type ReactNode } from "react";
import { useEngine } from "../hooks";
import { fail } from "../util";

/**
 * Drop-to-go-live target spanning the whole console top (header + stage
 * strip — the strip alone was too thin to hit mid-set): dropping a tile
 * anywhere up top stages AND commits (R9.3; the human-sourced commit is
 * never gated). The zone arms (outline + label) the moment a tile drag
 * starts ANYWHERE — document-level dragstart/dragend, since React only
 * sees events over its own subtree — and intensifies while hovered.
 * Drag events from children bubble here; #stagestrip keeps its id as the
 * validators' dispatch target.
 */
export function StageDropZone({ children }: { children: ReactNode }) {
  const link = useEngine();
  const [armed, setArmed] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const start = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("text/loom-instance")) setArmed(true);
    };
    const end = () => {
      setArmed(false);
      setDragOver(false);
    };
    document.addEventListener("dragstart", start);
    document.addEventListener("dragend", end); // fires on the source after drop OR cancel
    document.addEventListener("drop", end);
    return () => {
      document.removeEventListener("dragstart", start);
      document.removeEventListener("dragend", end);
      document.removeEventListener("drop", end);
    };
  }, []);

  return (
    <Box
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("text/loom-instance")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        // Children fire leave events while the drag crosses them — only an
        // exit from the zone itself ends the hover emphasis.
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
        outline: armed ? "2px dashed" : "none",
        outlineColor: "warning.main",
        outlineOffset: "-2px",
      }}
    >
      {children}
      {armed && (
        <Typography
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: dragOver ? "#000c" : "#0007",
            color: "warning.main",
            fontWeight: 700,
            letterSpacing: ".1em",
            pointerEvents: "none",
            zIndex: 1,
            transition: "background-color 120ms",
          }}
        >
          drop to go LIVE
        </Typography>
      )}
    </Box>
  );
}
