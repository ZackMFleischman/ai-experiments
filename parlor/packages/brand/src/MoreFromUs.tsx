// The cross-promo, demoted on purpose (DESIGN-PRINCIPLES.md §4): a quiet
// footer of text links below a divider, pushed to the bottom of the screen
// — never cards, never above app content, never on a play surface. The
// game earns the screen; the family earns a footnote. Apps are data (the
// caller filters out the current one); entries with no URL yet simply
// don't render, so a shared catalog can list unshipped titles.
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
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
    <Box component="footer" aria-label={heading} sx={{ mt: 'auto', pt: 5 }}>
      <Divider sx={{ mb: 1.5 }} />
      <Typography
        variant="overline"
        component="p"
        color="text.secondary"
        sx={{ lineHeight: 1.8, display: 'block' }}
      >
        {heading}
      </Typography>
      <Stack direction="row" useFlexGap flexWrap="wrap" columnGap={2.5} rowGap={0.5}>
        {visible.map((app) => (
          <Link
            key={app.name}
            href={app.url}
            target="_blank"
            rel="noopener"
            underline="hover"
            color="text.secondary"
            variant="body2"
            title={app.tagline}
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
          >
            <Box component="span" aria-hidden sx={{ fontSize: 16, lineHeight: 1 }}>
              {app.glyph}
            </Box>
            {app.name}
          </Link>
        ))}
      </Stack>
    </Box>
  );
}
