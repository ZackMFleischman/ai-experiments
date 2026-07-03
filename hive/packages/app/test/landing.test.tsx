// T4.2: themed landing/join screens — hero cluster renders from a legal
// decorative state, wordmark + tagline present, Join shows the invite card
// states. Auth-mode CTA behavior is covered in auth.test.tsx.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '../src/App';
import { HERO_STATE } from '../src/screens/LandingLayout';
import { Landing } from '../src/screens/Landing';
import { JoinCard } from '../src/screens/Join';

function renderIn(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <AppProviders>{node}</AppProviders>
    </MemoryRouter>,
  );
}

describe('landing (T4.2)', () => {
  it('builds the decorative hero from a legal game (all expansion bugs placed)', () => {
    const kinds = new Set(
      [...HERO_STATE.board.values()].flatMap((stack) => stack.map((t) => t.kind)),
    );
    for (const kind of ['Q', 'S', 'G', 'A', 'B', 'L', 'M', 'P']) {
      expect(kinds.has(kind as never), `missing ${kind} in hero`).toBe(true);
    }
    // One stack for visual depth.
    expect([...HERO_STATE.board.values()].some((s) => s.length > 1)).toBe(true);
  });

  it('renders the hero board, wordmark and tagline', () => {
    renderIn(<Landing />);
    expect(screen.getByTestId('landing-hero').querySelector('svg')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'HIVE' })).toBeTruthy();
    expect(screen.getByText(/don.t get surrounded/i)).toBeTruthy();
  });
});

describe('join card (T4.2)', () => {
  it('shows the host, options and accept button when ready', () => {
    renderIn(
      <JoinCard
        state={{
          kind: 'ready',
          hostName: 'Sam',
          options: { mosquito: true, ladybug: true, pillbug: false, tournamentOpening: true },
          hostColor: 'w',
        }}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByText(/sam/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /accept/i })).toBeTruthy();
    expect(screen.getByText(/mosquito/i)).toBeTruthy();
    expect(screen.queryByText(/pillbug/i)).toBeNull(); // off ⇒ not listed
  });

  it('shows the invalid state without an accept button', () => {
    renderIn(<JoinCard state={{ kind: 'invalid' }} onAccept={() => {}} />);
    expect(screen.getByText(/no longer valid/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
  });

  it('shows a loading state', () => {
    renderIn(<JoinCard state={{ kind: 'loading' }} onAccept={() => {}} />);
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });
});
