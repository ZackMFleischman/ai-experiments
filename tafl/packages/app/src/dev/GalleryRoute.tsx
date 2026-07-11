// /dev/gallery: the @parlor/harness gallery over tafl's registry.
// DEV-only — App.tsx mounts this lazily behind import.meta.env.DEV, so it
// never reaches a production bundle.
import { createBrandTheme } from '@parlor/brand';
import { Gallery } from '@parlor/harness';
import { ACCENT } from '../App';
import { GALLERY } from './registry';

export default function GalleryRoute() {
  return <Gallery registry={GALLERY} createTheme={(mode) => createBrandTheme(mode, ACCENT)} />;
}
