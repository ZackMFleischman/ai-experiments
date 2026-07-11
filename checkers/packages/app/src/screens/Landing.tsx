// Landing: the auth-branching landing shell lives in @parlor/web/lobby-ui —
// this file supplies checkers's hero (the real starting position, data not
// mock-up), wordmark, and tagline. Firebase-free.
import { Landing as ParlorLanding, LandingLayout as ParlorLandingLayout } from '@parlor/web/lobby-ui';
import { initialCheckers } from '@checkers/engine';
import type { ReactNode } from 'react';
import { MiniBoard } from '../board/MiniBoard';

const START = initialCheckers().board;
const TAGLINE = 'Draughts, plain and sharp — for two.';

export function LandingHero() {
  return <MiniBoard board={START} size={140} />;
}

export function Landing() {
  return <ParlorLanding hero={<LandingHero />} name="CHECKERS" tagline={TAGLINE} />;
}

export function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <ParlorLandingLayout hero={<LandingHero />} name="CHECKERS" tagline={TAGLINE}>
      {children}
    </ParlorLandingLayout>
  );
}
