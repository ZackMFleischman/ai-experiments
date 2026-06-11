import {
  Accordion, AccordionDetails, AccordionSummary, Box, Typography,
} from "@mui/material";
import { useState } from "react";
import type { ParamDesc } from "../engine-link";
import { ParamWidget } from "./ParamWidget";

const GROUP_OPEN_KEY = "loom.pgroups.open";

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
    <Box
      component="aside"
      id="panel"
      sx={{
        flex: "0 0 320px",
        bgcolor: "background.paper",
        borderLeft: 1,
        borderColor: "divider",
        p: 1.75,
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
  );
}
