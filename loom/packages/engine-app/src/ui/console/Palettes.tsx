import { Box, Stack, Typography } from "@mui/material";
import type { ParamDesc } from "../engine-link";
import { ParamWidget } from "./ParamWidget";

/**
 * The two global palettes as rows of five color swatches (R7), editing
 * "globals" through the same ParamWidget path as the rack tunings.
 * DOM contract: #palettes, .paletterow[data-name].
 */
export function Palettes({ globals }: { globals: Record<string, ParamDesc> }) {
  return (
    <Box id="palettes" sx={{ pt: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: "0.08em" }}>
        GLOBAL PALETTES
      </Typography>
      {(["primary", "secondary"] as const).map((source) => (
        <Stack
          key={source}
          direction="row"
          className="paletterow"
          data-name={source}
          spacing={1.75}
          alignItems="center"
          sx={{ py: 0.75 }}
        >
          <Typography sx={{ width: 80, flex: "0 0 auto", fontWeight: 700 }}>{source}</Typography>
          <Box sx={{ display: "flex", gap: 1.75 }}>
            {[0, 1, 2, 3, 4].map((i) => {
              const path = `palette.${source}.${i}`;
              const p = globals[path];
              return p ? (
                <ParamWidget key={path} instance="globals" path={path} p={p} label={String(i)} dense />
              ) : null;
            })}
          </Box>
        </Stack>
      ))}
    </Box>
  );
}
