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
    ['/', 'HIVE'],
    ['/lobby', 'Your games'],
    ['/new', 'New game'],
    ['/join/abc123', 'Join game'],
    ['/game/g1', 'Game'],
    ['/settings', 'Settings'],
  ];

  for (const [path, heading] of cases) {
    it(`renders ${path}`, () => {
      const { unmount } = renderAt(path);
      expect(screen.getByRole('heading', { level: 1, name: new RegExp(heading, 'i') })).toBeTruthy();
      unmount();
    });
  }
});
