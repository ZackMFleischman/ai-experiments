// Landing: the auth-branching landing shell lives in @parlor/web/lobby-ui —
// this file supplies tafl's hero (the real starting position, data not
// mock-up), wordmark, and tagline. Firebase-free.
import { Landing as ParlorLanding, LandingLayout as ParlorLandingLayout } from '@parlor/web/lobby-ui';
import { initialTafl } from '@tafl/engine';
import type { ReactNode } from 'react';
import { MiniBoard } from '../board/MiniBoard';

const START = initialTafl().board;

export function LandingHero() {
  return <MiniBoard board={START} size={140} />;
}

export function Landing() {
  return (
    <ParlorLanding hero={<LandingHero />} name="TAFL" tagline="The Viking siege game, for two." />
  );
}

export function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <ParlorLandingLayout hero={<LandingHero />} name="TAFL" tagline="The Viking siege game, for two.">
      {children}
    </ParlorLandingLayout>
  );
}
