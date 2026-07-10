// The cross-promo panel: every app quietly points at its siblings. Apps are
// data (the caller filters out the current one); entries with no URL yet
// simply don't render, so a shared catalog can list unshipped titles.
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export interface FamilyApp {
  name: string;
  tagline: string;
  /** Absolute URL; entries without one are hidden. */
  url?: string;
  /** A single emoji/glyph used as the app mark. */
  glyph: string;
}

export interface MoreFromUsProps {
  heading?: string;
  apps: readonly FamilyApp[];
}

export function MoreFromUs({ heading = 'More from us', apps }: MoreFromUsProps) {
  const visible = apps.filter((app) => app.url);
  if (visible.length === 0) return null;
  return (
    <Box component="section" aria-label={heading} sx={{ mt: 4 }}>
      <Typography variant="h3" component="h2" sx={{ mb: 1.5 }}>
        {heading}
      </Typography>
      <Stack spacing={1.5}>
        {visible.map((app) => (
          <Card key={app.name} variant="outlined">
            <CardActionArea
              component="a"
              href={app.url}
              target="_blank"
              rel="noopener"
              sx={{ display: 'flex', justifyContent: 'flex-start', gap: 1.5, p: 1.5 }}
            >
              <Box component="span" aria-hidden sx={{ fontSize: 28, lineHeight: 1 }}>
                {app.glyph}
              </Box>
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>
                  {app.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {app.tagline}
                </Typography>
              </Box>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
