// /dev/gallery (T3.11): the @parlor/harness gallery over lex's registry.
// DEV-only — App.tsx mounts this lazily behind import.meta.env.DEV, so it
// never reaches a production bundle.
import { Gallery } from '@parlor/harness';
import { createAppTheme } from '../theme';
import { GALLERY } from './registry';

export default function GalleryRoute() {
  return <Gallery registry={GALLERY} createTheme={createAppTheme} />;
}
