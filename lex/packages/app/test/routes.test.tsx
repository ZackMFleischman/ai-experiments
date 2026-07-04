// ported from hive/packages/app/test/routes.test.tsx (adapted)
// T0.2 gate: every DESIGN §7.1 screen has a stub route that renders.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppProviders, AppRoutes } from '../src/App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  );
}

describe('app shell routes', () => {
  const cases: Array<[path: string, heading: string]> = [
    ['/', 'LEX'],
    ['/lobby', 'Your games'],
    ['/new', 'New game'],
    ['/join/abc123', 'Join game'],
    ['/settings', 'Settings'],
  ];

  for (const [path, heading] of cases) {
    it(`renders ${path}`, () => {
      const { unmount } = renderAt(path);
      expect(screen.getByRole('heading', { level: 1, name: new RegExp(heading, 'i') })).toBeTruthy();
      unmount();
    });
  }

  it('renders /game/:id (stub game screen until M3)', () => {
    const { unmount } = renderAt('/game/local');
    expect(screen.getByTestId('game-screen')).toBeTruthy();
    unmount();
  });
});
