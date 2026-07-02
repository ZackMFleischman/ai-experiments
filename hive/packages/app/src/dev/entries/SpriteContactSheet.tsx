import { Box, Stack, Typography } from '@mui/material';
import { ALL_SYMBOLS } from '../../board/sprites';

function Swatch({ symbol, size, tile }: { symbol: string; size: number; tile: 'w' | 'b' }) {
  return (
    <Box
      className={`hive-tile-${tile}`}
      sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', m: 0.5 }}
    >
      <svg width={size} height={size} role="img" aria-label={`${symbol} ${tile} ${size}px`}>
        {(symbol.startsWith('bug-') || symbol.startsWith('motif-')) && (
          <use href="#hex-base" width={size} height={size} />
        )}
        <use href={`#${symbol}`} width={size} height={size} />
      </svg>
    </Box>
  );
}

export function SpriteContactSheet() {
  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      {[80, 40].map((size) => (
        <Box key={size}>
          <Typography variant="subtitle2" gutterBottom>
            {size}px
          </Typography>
          {(['w', 'b'] as const).map((tile) => (
            <Box key={tile}>
              {ALL_SYMBOLS.map((symbol) => (
                <Swatch key={symbol} symbol={symbol} size={size} tile={tile} />
              ))}
            </Box>
          ))}
        </Box>
      ))}
    </Stack>
  );
}
