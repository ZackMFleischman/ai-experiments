// Digit entry: one row of nine keys (grid on narrow screens), each fading
// out as its nine placements are used up. Notes mode restyles the keys so
// the current mode is visible at the point of action.
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { DIGITS } from '@sudoku/engine';

export interface DigitPadProps {
  counts: readonly number[];
  notesMode: boolean;
  onDigit: (digit: number) => void;
}

export function DigitPad({ counts, notesMode, onDigit }: DigitPadProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(9, 1fr)',
        gap: 0.5,
        width: '100%',
        maxWidth: 500,
        mx: 'auto',
      }}
    >
      {DIGITS.map((digit) => {
        const spent = (counts[digit] ?? 0) >= 9;
        return (
          <ButtonBase
            key={digit}
            aria-label={`digit ${digit}`}
            onClick={() => onDigit(digit)}
            disabled={spent}
            sx={{
              borderRadius: 2,
              border: 1,
              borderColor: notesMode ? 'primary.main' : 'divider',
              borderStyle: notesMode ? 'dashed' : 'solid',
              minHeight: 44,
              fontSize: notesMode ? 16 : 22,
              fontWeight: 600,
              color: 'primary.main',
              opacity: spent ? 0.25 : 1,
            }}
          >
            {digit}
          </ButtonBase>
        );
      })}
    </Box>
  );
}
