// Lex landing screen (T4.2): the auth-branching landing (full-mode Google
// sign-in + emulator test form, or hot-seat buttons) lives in
// @parlor/web/lobby-ui — this file supplies lex's hero, wordmark, and tagline.
// Firebase-free.
import { Landing as ParlorLanding } from '@parlor/web/lobby-ui';
import { LandingHero } from './LandingLayout';

export function Landing() {
  return (
    <ParlorLanding hero={<LandingHero />} name="LEX" tagline="A crossword tile game for two." />
  );
}
