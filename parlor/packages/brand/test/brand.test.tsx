// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);
import { AppShell, MoreFromUs, PARLOR_BRAND, createBrandTheme } from '../src/index.js';

describe('@parlor/brand', () => {
  it('exposes the wiring probe', () => {
    expect(PARLOR_BRAND).toEqual({ workspace: 'parlor', package: 'brand' });
  });
});

describe('createBrandTheme', () => {
  it('injects the app accent into both modes', () => {
    expect(createBrandTheme('light', { main: '#0d5f7a' }).palette.primary.main).toBe('#0d5f7a');
    expect(createBrandTheme('dark', { main: '#0d5f7a' }).palette.mode).toBe('dark');
  });

  it('keeps the family shape and button voice', () => {
    const theme = createBrandTheme('light', { main: '#111111' });
    expect(theme.shape.borderRadius).toBe(12);
    expect(theme.typography.button.textTransform).toBe('none');
  });
});

describe('AppShell', () => {
  it('renders title, children, and actions', () => {
    render(
      <AppShell title="Sudoku" actions={<button>gear</button>}>
        <div>content</div>
      </AppShell>,
    );
    expect(screen.getByRole('heading', { name: 'Sudoku' })).toBeTruthy();
    expect(screen.getByText('content')).toBeTruthy();
    expect(screen.getByText('gear')).toBeTruthy();
  });

  it('shows a back affordance only when onBack is provided', () => {
    const onBack = vi.fn();
    const { rerender } = render(
      <AppShell title="t" onBack={onBack}>
        <div />
      </AppShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'back' }));
    expect(onBack).toHaveBeenCalledOnce();
    rerender(
      <AppShell title="t">
        <div />
      </AppShell>,
    );
    expect(screen.queryByRole('button', { name: 'back' })).toBeNull();
  });
});

describe('MoreFromUs', () => {
  const apps = [
    { name: 'Hive', tagline: 'The bug game', url: 'https://hive.example', glyph: '🐝' },
    { name: 'Unshipped', tagline: 'Soon', glyph: '🧩' },
  ];

  it('lists only apps with URLs, as external links', () => {
    render(<MoreFromUs apps={apps} />);
    const link = screen.getByRole('link', { name: /Hive/ });
    expect(link.getAttribute('href')).toBe('https://hive.example');
    expect(link.getAttribute('rel')).toBe('noopener');
    expect(screen.queryByText('Unshipped')).toBeNull();
  });

  it('renders nothing when no app is live', () => {
    const { container } = render(<MoreFromUs apps={[{ name: 'X', tagline: 'y', glyph: 'z' }]} />);
    expect(container.innerHTML).toBe('');
  });
});
