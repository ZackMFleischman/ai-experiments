import { Box, ButtonBase, Card, Popover, Stack, Typography } from "@mui/material";
import { useRef, useState } from "react";
import { useEngine, useThumb } from "../hooks";
import { fail } from "../util";

type Props = { scenes: string[]; onCreated: (id: string) => void };

/**
 * Ghost "+" tile (#newinstance) at the end of the grid: click → scene list
 * popover (.scenerow[data-scene]). Hovering a row builds a REAL sandbox
 * instance after a 300 ms debounce and streams its thumbnail as the preview;
 * picking a row keeps that instance (or creates one on the spot), any other
 * close destroys the orphan. Never more than one preview alive.
 */
export function NewInstanceTile({ scenes, onCreated }: Props) {
  const link = useEngine();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = useRef<{ scene: string; id: string } | null>(null);
  const hovered = useRef<string | null>(null);
  const openRef = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const thumb = useThumb(previewId);

  const destroyPreview = () => {
    const p = preview.current;
    preview.current = null;
    setPreviewId(null);
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
          // The popover may have closed (or the hover moved on) mid-build.
          if (!openRef.current || hovered.current !== scene) {
            void link.req("destroy_instance", { instance: id }).catch(fail);
            return;
          }
          preview.current = { scene, id };
          setPreviewId(id);
        })
        .catch(fail);
    }, 300);
  };

  const pick = (scene: string) => {
    window.clearTimeout(timer.current);
    if (preview.current?.scene === scene) {
      const { id } = preview.current;
      preview.current = null; // keep it — close() must not destroy it
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
          openRef.current = true;
          setAnchor(e.currentTarget);
        }}
        sx={{
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 120,
          borderStyle: "dashed",
          color: "text.secondary",
          bgcolor: "transparent",
          "&:hover": { color: "primary.main", borderColor: "primary.main" },
        }}
      >
        <Typography sx={{ fontSize: 34, lineHeight: 1 }}>+</Typography>
        <Typography variant="caption">new instance</Typography>
      </Card>
      <Popover
        open={anchor != null}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Stack direction="row" sx={{ p: 1, gap: 1 }}>
          <Box sx={{ maxHeight: 300, overflowY: "auto", minWidth: 130 }}>
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
          <Box
            sx={{
              width: 256,
              height: 144,
              bgcolor: "#000",
              borderRadius: 1,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {thumb != null ? (
              <Box component="img" src={thumb} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ px: 1, textAlign: "center" }}>
                hover a scene to preview it live
              </Typography>
            )}
          </Box>
        </Stack>
      </Popover>
    </>
  );
}
