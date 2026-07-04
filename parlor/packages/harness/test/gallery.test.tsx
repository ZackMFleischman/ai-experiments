// @vitest-environment jsdom
// T3.11 (lex): the generic gallery runtime — index lists entries, ?entry
// renders one full-bleed, ?static injects the animation freeze.
import { createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Gallery, type GalleryEntry } from '../src/Gallery.js';

const registry: GalleryEntry[] = [
  { id: 'one', render: () => <div data-testid="entry-one">first</div> },
  { id: 'two', render: () => <div data-testid="entry-two">second</div> },
];

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Gallery registry={registry} createTheme={(mode) => createTheme({ palette: { mode } })} />
    </MemoryRouter>,
  );
}

describe('Gallery', () => {
  it('lists every registry entry on the index', () => {
    const { container } = renderAt('/dev/gallery');
    const ids = [...container.querySelectorAll('[data-entry-id]')].map((el) =>
      el.getAttribute('data-entry-id'),
    );
    expect(ids).toEqual(['one', 'two']);
  });

  it('renders a single entry full-bleed for capture', () => {
    const { container } = renderAt('/dev/gallery?entry=two');
    expect(screen.getByTestId('entry-two')).toBeTruthy();
    expect(container.querySelector('[data-gallery-entry="two"]')).toBeTruthy();
    expect(container.querySelector('[data-gallery-index]')).toBeFalsy();
  });

  it('?static=1 injects the animation freeze', () => {
    renderAt('/dev/gallery?entry=one&static=1');
    expect(document.head.textContent ?? document.body.innerHTML).toBeTruthy();
    const styles = [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('');
    expect(styles).toContain('animation: none');
  });
});
