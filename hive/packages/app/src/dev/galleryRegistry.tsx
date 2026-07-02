// Named, reproducible states for the validation harness (IMPLEMENTATION §4.1).
// Every [visual] task adds entries; validate:visual walks them.
import type { ReactNode } from 'react';
import { boardEntries } from './entries/boards';
import { SpriteContactSheet } from './entries/SpriteContactSheet';

export interface GalleryEntry {
  id: string;
  render: () => ReactNode;
}

export const GALLERY: GalleryEntry[] = [
  { id: 'sprite-contact-sheet', render: () => <SpriteContactSheet /> },
  ...boardEntries,
];
