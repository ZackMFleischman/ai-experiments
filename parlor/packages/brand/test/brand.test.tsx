// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);
import { AppShell, GameHud, MoreFromUs, PARLOR_BRAND, createBrandTheme } from '../src/index.js';

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

  it('derives the whole palette from the one accent (DESIGN-PRINCIPLES §3)', () => {
    for (const mode of ['light', 'dark'] as const) {
      const wine = createBrandTheme(mode, { main: '#7a1f3d' });
      const teal = createBrandTheme(mode, { main: '#0b7285' });
      // Backgrounds and board tokens are accent-tinted, so two apps with
      // different accents get different atmospheres for free.
      expect(wine.palette.background.default).not.toBe(teal.palette.background.default);
      expect(wine.palette.board.surface).not.toBe(teal.palette.board.surface);
      expect(wine.palette.board.surface).toMatch(/^#[0-9a-f]{6}$/);
      expect(wine.palette.board.cell).toMatch(/^#[0-9a-f]{6}$/);
    }
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

describe('GameHud', () => {
  it('duo: renders both seat plaques with the active one marked', () => {
    const { container } = render(
      <GameHud
        seats={[
          { label: 'Dark', glyph: '●', active: true },
          { label: 'Light', glyph: '○' },
        ]}
        status="Dark to move"
        meta="move 3"
      />,
    );
    expect(screen.getByText('Dark')).toBeTruthy();
    expect(screen.getByText('Light')).toBeTruthy();
    expect(screen.getByTestId('status-line').textContent).toBe('Dark to move');
    expect(screen.getByText('move 3')).toBeTruthy();
    const active = container.querySelectorAll('[aria-current]');
    expect(active).toHaveLength(1);
    expect(active[0]?.textContent).toContain('Dark');
  });

  it('solo: renders the status/meta row with the status-line marker', () => {
    render(<GameHud status="Daily puzzle" meta="4:32" />);
    expect(screen.getByTestId('status-line').textContent).toBe('Daily puzzle');
    expect(screen.getByText('4:32')).toBeTruthy();
    expect(document.querySelector('[data-hud]')).toBeTruthy();
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

  it('is a quiet footer, not a card stack (DESIGN-PRINCIPLES §4)', () => {
    const { container } = render(<MoreFromUs apps={apps} />);
    expect(container.querySelector('footer')).toBeTruthy();
    expect(container.querySelector('.MuiCard-root')).toBeNull();
    // Pushed to the bottom of the shell's flex column.
    const footer = container.querySelector('footer') as HTMLElement;
    expect(getComputedStyle(footer).marginTop).toBe('auto');
  });
});
