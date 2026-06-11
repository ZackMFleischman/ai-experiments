import {
  Accordion, AccordionDetails, AccordionSummary, Box, Stack, Typography,
} from "@mui/material";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ParamDesc } from "../engine-link";
import { ParamWidget } from "./ParamWidget";

const GROUP_OPEN_KEY = "loom.pgroups.open";
const PANEL_W_KEY = "loom.panelw";

function loadOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(GROUP_OPEN_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

type Props = {
  instance: string | null;
  manifest: Record<string, ParamDesc> | undefined;
};

/**
 * Dotted param paths form collapsible groups: "logo.tiltX" lands in a "logo"
 * accordion labeled "tiltX"; dotless params stay flat on top. Open state
 * persists per group name (collapsed until the human opens it).
 */
export function ParamPanel({ instance, manifest }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>(loadOpen);
  const [w, setW] = useState(() => {
    const n = Number(localStorage.getItem(PANEL_W_KEY));
    return Number.isFinite(n) && n >= 240 ? n : 320;
  });
  const wRef = useRef(w);
  wRef.current = w;

  // The drawer resizes by its left edge; width persists across sessions.
  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = wRef.current;
    const move = (ev: PointerEvent) =>
      setW(Math.min(Math.max(240, startW + (startX - ev.clientX)), window.innerWidth * 0.6));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        localStorage.setItem(PANEL_W_KEY, String(wRef.current));
      } catch {
        // width just won't persist
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const toggle = (group: string, isOpen: boolean) => {
    setOpen((o) => {
      const next = { ...o, [group]: isOpen };
      try {
        localStorage.setItem(GROUP_OPEN_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable — groups just default closed each load
      }
      return next;
    });
  };

  const flat: Array<[string, ParamDesc]> = [];
  const groups = new Map<string, Array<[string, ParamDesc]>>();
  for (const [path, p] of Object.entries(manifest ?? {})) {
    const dot = path.indexOf(".");
    if (dot < 0) {
      flat.push([path, p]);
    } else {
      const g = path.slice(0, dot);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push([path, p]);
    }
  }
  const ready = instance != null && manifest != null;

  return (
    <Stack direction="row" sx={{ flex: "0 0 auto" }}>
      <Box
        onPointerDown={startResize}
        title="drag to resize"
        sx={{
          width: 5,
          cursor: "col-resize",
          flex: "0 0 auto",
          bgcolor: "transparent",
          "&:hover": { bgcolor: "primary.main", opacity: 0.5 },
        }}
      />
      <Box
        component="aside"
        id="panel"
        sx={{
          flex: `0 0 ${w}px`,
          width: w,
          bgcolor: "background.paper",
          borderLeft: 1,
          borderColor: "divider",
          p: 1.25,
          overflowY: "auto",
        }}
      >
      <Typography id="paneltitle" variant="subtitle2" sx={{ mb: 1.5 }}>
        {ready ? instance : "no instance selected"}
      </Typography>
      <Box id="widgets">
        {ready && (
          <>
            {flat.map(([path, p]) => (
              <ParamWidget key={path} instance={instance} path={path} p={p} />
            ))}
            {[...groups.entries()].map(([group, entries]) => (
              <Accordion
                key={group}
                variant="outlined"
                disableGutters
                expanded={open[group] ?? false}
                onChange={(_, x) => toggle(group, x)}
                sx={{ mb: 1.5, bgcolor: "transparent" }}
              >
                <AccordionSummary
                  sx={{
                    minHeight: 36,
                    fontSize: 12,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "text.secondary",
                  }}
                >
                  {group}
                </AccordionSummary>
                <AccordionDetails>
                  {entries.map(([path, p]) => (
                    <ParamWidget
                      key={path}
                      instance={instance}
                      path={path}
                      p={p}
                      label={path.slice(group.length + 1)}
                    />
                  ))}
                </AccordionDetails>
              </Accordion>
            ))}
          </>
        )}
      </Box>
      </Box>
    </Stack>
  );
}
