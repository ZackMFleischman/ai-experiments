// Settings (T6.1, DESIGN §7.1): theme, tile skin (live preview tiles per
// skin), and where notifications live. Firebase-free — the push banner
// itself sits in the full-mode lobby (T5.2).
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  Box,
  Card,
  CardActionArea,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import { Tile } from '../board/Tile';
import { SKIN_IDS, SKIN_NAMES, skinVars, type TileSkinId } from '../board/skin';
import { useSkin } from '../board/skinContext';
import { useColorMode, type ThemeMode } from '../theme';

/** Three sample tiles rendered in the actual skin vars — a live preview. */
function SkinSample({ skin, mode }: { skin: TileSkinId; mode: ThemeMode }) {
  return (
    <Box
      aria-hidden
      sx={{
        ...skinVars(mode, skin),
        '--lex-cell': '40px',
        display: 'flex',
        gap: 0.5,
        p: 1,
        borderRadius: 1.5,
        bgcolor: 'var(--lex-cell-bg)',
        border: '1px solid',
        borderColor: 'var(--lex-cell-line)',
        width: 'fit-content',
      }}
    >
      <Tile letter="L" isBlank={false} points={1} />
      <Tile letter="E" isBlank={false} points={1} />
      <Tile letter="X" isBlank={false} points={8} />
    </Box>
  );
}

export function Settings() {
  // Mode comes from the theme (M3 lesson §8) — the context only supplies the
  // toggle action. Keeps the samples honest under any ThemeProvider.
  const mode = useTheme().palette.mode;
  const { toggle } = useColorMode();
  const { skin, setSkin } = useSkin();
  return (
    <Box sx={{ p: 3, maxWidth: 520 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton component={RouterLink} to="/lobby" aria-label="back to lobby" edge="start">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" component="h1">
          Settings
        </Typography>
      </Stack>
      <Stack spacing={3}>
        <Stack spacing={1}>
          <Typography variant="overline" color="text.secondary">
            Theme
          </Typography>
          <ToggleButtonGroup
            exclusive
            value={mode}
            onChange={(_, v: ThemeMode | null) => {
              if (v && v !== mode) toggle();
            }}
            fullWidth
          >
            <ToggleButton value="light" data-testid="theme-light">
              Light
            </ToggleButton>
            <ToggleButton value="dark" data-testid="theme-dark">
              Dark
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <Stack spacing={1}>
          <Typography variant="overline" color="text.secondary">
            Tile skin
          </Typography>
          {SKIN_IDS.map((id) => (
            <Card
              key={id}
              variant="outlined"
              sx={{
                borderColor: skin === id ? 'primary.main' : 'divider',
                borderWidth: skin === id ? 2 : 1,
              }}
            >
              <CardActionArea
                onClick={() => setSkin(id)}
                data-testid={`skin-${id}`}
                aria-pressed={skin === id}
                sx={{ p: 1.25, display: 'flex', justifyContent: 'flex-start', gap: 2 }}
              >
                <SkinSample skin={id} mode={mode} />
                <Typography fontWeight={600}>{SKIN_NAMES[id]}</Typography>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
        <Stack spacing={0.5}>
          <Typography variant="overline" color="text.secondary">
            Notifications
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Turn pushes on from the lobby banner — it appears whenever this device can enable
            them.
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
