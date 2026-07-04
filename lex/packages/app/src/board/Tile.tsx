// The tile: typography on a square (DESIGN §7.2) — letter + point index, all
// colors via the skin's CSS variables. Blanks show their designated letter
// with a ring and NO point index (they score 0; showing "0" reads as a bug).
import { Box } from '@mui/material';

export interface TileProps {
  letter: string;
  isBlank: boolean;
  /** Point value from the ruleset's TileSet — never computed here. */
  points: number;
  /** Staged-but-unsubmitted look: lifted, gold edge (DESIGN §7.2). */
  pending?: boolean;
}

export function Tile({ letter, isBlank, points, pending = false }: TileProps) {
  return (
    <Box
      data-tile={letter}
      data-blank={isBlank ? 'true' : undefined}
      data-pending={pending ? 'true' : undefined}
      sx={{
        position: 'relative',
        width: 'calc(var(--lex-cell) - 4px)',
        height: 'calc(var(--lex-cell) - 4px)',
        borderRadius: '18%',
        bgcolor: 'var(--lex-tile-bg)',
        color: 'var(--lex-tile-fg)',
        boxShadow: pending
          ? '0 0 0 2px var(--lex-tile-pending-edge), 0 3px 6px rgba(0,0,0,0.35)'
          : 'inset 0 -2px 0 var(--lex-tile-edge), 0 1px 1px rgba(0,0,0,0.25)',
        transform: pending ? 'translateY(-2px)' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        ...(isBlank && {
          outline: '1.5px dashed var(--lex-tile-blank-ring)',
          outlineOffset: '-3px',
        }),
      }}
    >
      <Box
        component="span"
        sx={{
          fontSize: 'calc(var(--lex-cell) * 0.52)',
          fontWeight: 700,
          lineHeight: 1,
          fontFamily: '"Georgia", "Times New Roman", serif',
        }}
      >
        {letter}
      </Box>
      {!isBlank && (
        <Box
          component="span"
          sx={{
            position: 'absolute',
            right: '7%',
            bottom: '4%',
            fontSize: 'calc(var(--lex-cell) * 0.24)',
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {points}
        </Box>
      )}
    </Box>
  );
}
