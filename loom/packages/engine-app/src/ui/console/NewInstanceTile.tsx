import { Box, ButtonBase, Card, Popover, Typography } from "@mui/material";
import { useRef, useState } from "react";
import { useEngine, useThumb } from "../hooks";
import { fail } from "../util";

type Props = {
  scenes: string[];
  onCreated: (id: string) => void;
  /** The in-flight preview instance's id (or null) — the grid hides its tile. */
  onPreview: (id: string | null) => void;
};

/**
 * Ghost "+" tile (#newinstance) at the end of the grid: click → scene list
 * pops out to the right (.scenerow[data-scene]) and the TILE ITSELF becomes
 * the preview surface. Hovering a row builds a REAL sandbox instance after a
 * 300 ms debounce and streams its thumbnail into the tile; picking keeps that
 * instance (the tile reverts to "+"), any other close destroys the orphan.
 * Never more than one preview alive; the grid filters the preview's own tile
 * out so it doesn't show twice.
 */
export function NewInstanceTile({ scenes, onCreated, onPreview }: Props) {
  const link = useEngine();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = useRef<{ scene: string; id: string } | null>(null);
  const hovered = useRef<string | null>(null);
  const openRef = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const thumb = useThumb(previewId);
  const open = anchor != null;

  const setPreview = (p: { scene: string; id: string } | null) => {
    preview.current = p;
    setPreviewId(p?.id ?? null);
    onPreview(p?.id ?? null);
  };

  const destroyPreview = () => {
    const p = preview.current;
    setPreview(null);
    if (p) void link.req("destroy_instance", { instance: p.id }).catch(fail);
  };

  const close = () => {
    openRef.current = false;
    hovered.current = null;
    window.clearTimeout(timer.current);
    setAnchor(null);
    destroyPreview();
  };

  const hover = (scene: string) => {
    hovered.current = scene;
    window.clearTimeout(timer.current);
    if (preview.current?.scene === scene) return;
    timer.current = window.setTimeout(() => {
      destroyPreview();
      void link
        .req("create_instance", { scene })
        .then((r) => {
          const id = (r as { instance: string }).instance;
          // The picker may have closed (or the hover moved on) mid-build.
          if (!openRef.current || hovered.current !== scene) {
            void link.req("destroy_instance", { instance: id }).catch(fail);
            return;
          }
          setPreview({ scene, id });
        })
        .catch(fail);
    }, 300);
  };

  const pick = (scene: string) => {
    window.clearTimeout(timer.current);
    if (preview.current?.scene === scene) {
      const { id } = preview.current;
      setPreview(null); // hand it to the grid — close() must not destroy it
      close();
      onCreated(id);
      return;
    }
    void link
      .req("create_instance", { scene })
      .then((r) => onCreated((r as { instance: string }).instance))
      .catch(fail);
    close();
  };

  return (
    <>
      <Card
        id="newinstance"
        variant="outlined"
        onClick={(e) => {
          if (openRef.current) return;
          openRef.current = true;
          setAnchor(e.currentTarget);
        }}
        sx={{
          cursor: "pointer",
          position: "relative",
          borderStyle: "dashed",
          color: "text.secondary",
          bgcolor: "transparent",
          borderColor: open ? "primary.main" : "divider",
          "&:hover": { color: "primary.main", borderColor: "primary.main" },
        }}
      >
        {/* Same geometry as a real tile: 16/9 face + slim name row. */}
        <Box sx={{ aspectRatio: "16/9", position: "relative", bgcolor: open ? "#000" : "transparent" }}>
          {open && thumb != null ? (
            <Box
              component="img"
              src={thumb}
              alt=""
              sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Typography sx={{ fontSize: 34, lineHeight: 1 }}>+</Typography>
              <Typography variant="caption">
                {open ? "hover a scene to preview it here" : "new instance"}
              </Typography>
            </Box>
          )}
        </Box>
        <Typography variant="body2" noWrap sx={{ px: 1, py: 0.5 }}>
          {open && preview.current != null ? `preview · ${preview.current.scene}` : " "}
        </Typography>
      </Card>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        sx={{ ml: 0.5 }}
      >
        <Box sx={{ maxHeight: 320, overflowY: "auto", minWidth: 140, p: 0.5 }}>
          {scenes.map((scene) => (
            <ButtonBase
              key={scene}
              className="scenerow"
              data-scene={scene}
              onMouseEnter={() => hover(scene)}
              onClick={() => pick(scene)}
              sx={{
                display: "block",
                width: "100%",
                textAlign: "left",
                px: 1,
                py: 0.5,
                borderRadius: 1,
                fontSize: 13,
                bgcolor: previewId != null && preview.current?.scene === scene ? "action.selected" : "transparent",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              {scene}
            </ButtonBase>
          ))}
        </Box>
      </Popover>
    </>
  );
}
