import {
  Accordion, AccordionDetails, AccordionSummary, Box, Stack, Typography,
} from "@mui/material";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { SessionSnapshot } from "@loom/sidecar/protocol";
import type { ParamDesc } from "../engine-link";
import { FxChain } from "./FxChain";
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
  session: SessionSnapshot | null;
};

/**
 * Dotted param paths form collapsible groups: "logo.tiltX" lands in a "logo"
 * accordion labeled "tiltX"; dotless params stay flat on top. Open state
 * persists per group name (collapsed until the human opens it).
 */
export function ParamPanel({ instance, manifest, session }: Props) {
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

  // Layer nodes (Layers): each gets a node-marked group with its own FX chain;
  // its chain knobs (<node>.fx.*) render inside that chain, not as widgets.
  const nodes = session?.instances.find((i) => i.id === instance)?.nodes ?? [];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const parentOf = new Map(nodes.map((n) => [n.id, n.parent]));

  const flat: Array<[string, ParamDesc]> = [];
  const groups = new Map<string, Array<[string, ParamDesc]>>();
  for (const [path, p] of Object.entries(manifest ?? {})) {
    if (path.startsWith("fx.")) continue; // chain knobs render inside the FX CHAIN section
    const dot = path.indexOf(".");
    // palette.source is the scene's palette switch (R7.2) — too load-bearing
    // to bury in a collapsed accordion, so it stays on the flat top level.
    if (dot < 0 || path === "palette.source") {
      flat.push([path, p]);
    } else {
      const g = path.slice(0, dot);
      if (nodeIds.has(g) && path.slice(dot + 1).startsWith("fx.")) continue; // node chain knobs
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push([path, p]);
    }
  }
  // A wrapped node always has rig params, but make sure every node gets a
  // section even if a manifest snapshot lags behind the session's node list.
  for (const id of nodeIds) if (!groups.has(id)) groups.set(id, []);
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
      <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ mb: 1.5 }}>
        <Typography id="paneltitle" variant="subtitle2" noWrap>
          {ready ? instance : "no instance selected"}
        </Typography>
        {ready && (
          <>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
              {session?.instances.find((i) => i.id === instance)?.scene ?? ""}
            </Typography>
            {session?.live === instance && (
              <Typography variant="caption" sx={{ color: "error.main", fontWeight: 700 }}>
                LIVE
              </Typography>
            )}
            {session?.staged === instance && (
              <Typography variant="caption" sx={{ color: "warning.main", fontWeight: 700 }}>
                STAGED
              </Typography>
            )}
          </>
        )}
      </Stack>
      <Box id="widgets">
        {ready && (
          <>
            {flat.map(([path, p]) => (
              <ParamWidget key={path} instance={instance} path={path} p={p} />
            ))}
            {[...groups.entries()].map(([group, entries]) => {
              const isNode = nodeIds.has(group);
              const parent = parentOf.get(group);
              // A node's rig params (<node>.layer.x/y/scale/rotate/opacity) fold
              // into a nested "transform" sub-group so the section stays scannable.
              const rig = entries.filter(([path]) =>
                path.slice(group.length + 1).startsWith("layer."),
              );
              const rest = rig.length > 0
                ? entries.filter(([path]) => !path.slice(group.length + 1).startsWith("layer."))
                : entries;
              return (
                <Accordion
                  key={group}
                  data-node={isNode ? group : undefined}
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
                    {isNode ? "⬚ " : ""}
                    {group}
                    {isNode && parent != null && (
                      <Typography component="span" variant="caption" sx={{ ml: 0.5, opacity: 0.6 }}>
                        ⊂ {parent}
                      </Typography>
                    )}
                  </AccordionSummary>
                  <AccordionDetails>
                    {rest.map(([path, p]) => (
                      <ParamWidget
                        key={path}
                        instance={instance}
                        path={path}
                        p={p}
                        label={path.slice(group.length + 1)}
                      />
                    ))}
                    {rig.length > 0 && (
                      <Accordion
                        variant="outlined"
                        disableGutters
                        expanded={open[`${group}.layer`] ?? false}
                        onChange={(_, x) => toggle(`${group}.layer`, x)}
                        sx={{ mb: 1, bgcolor: "transparent" }}
                      >
                        <AccordionSummary
                          data-transform={group}
                          sx={{
                            minHeight: 30,
                            fontSize: 11,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "text.secondary",
                          }}
                        >
                          ⤡ transform
                        </AccordionSummary>
                        <AccordionDetails>
                          {rig.map(([path, p]) => (
                            <ParamWidget
                              key={path}
                              instance={instance}
                              path={path}
                              p={p}
                              label={path.slice(group.length + 1 + "layer.".length)}
                            />
                          ))}
                        </AccordionDetails>
                      </Accordion>
                    )}
                    {isNode && instance !== "globals" && (
                      <FxChain instance={instance} manifest={manifest} node={group} />
                    )}
                  </AccordionDetails>
                </Accordion>
              );
            })}
            {instance !== "globals" && <FxChain instance={instance} manifest={manifest} />}
          </>
        )}
      </Box>
      </Box>
    </Stack>
  );
}
