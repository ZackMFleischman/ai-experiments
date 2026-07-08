// T5.2: push-permission UX decisions (pure). iOS Safari outside a Home-Screen
// install can't push — coach-mark it once; supported browsers get the enable
// button only while permission is undecided; denied falls back to in-app badges.
import { describe, expect, it } from 'vitest';
import { pushSetupState, type PushEnv } from '@parlor/web';

function env(over: Partial<PushEnv>): PushEnv {
  return {
    permission: 'default',
    standalone: false,
    isIos: false,
    messagingSupported: true,
    coachMarkDismissed: false,
    ...over,
  };
}

describe('pushSetupState', () => {
  it('offers the enable button while permission is undecided', () => {
    expect(pushSetupState(env({}))).toBe('enable-button');
  });

  it('shows nothing once granted (token capture happens silently)', () => {
    expect(pushSetupState(env({ permission: 'granted' }))).toBe('nothing');
  });

  it('shows nothing when denied (in-app badges are the fallback)', () => {
    expect(pushSetupState(env({ permission: 'denied' }))).toBe('nothing');
  });

  it('coach-marks iOS Safari outside a standalone install', () => {
    expect(pushSetupState(env({ isIos: true, messagingSupported: false }))).toBe('coach-mark');
  });

  it('respects a dismissed coach mark', () => {
    expect(
      pushSetupState(env({ isIos: true, messagingSupported: false, coachMarkDismissed: true })),
    ).toBe('nothing');
  });

  it('installed iOS PWA behaves like a normal supported browser', () => {
    expect(pushSetupState(env({ isIos: true, standalone: true }))).toBe('enable-button');
  });

  it('unsupported non-iOS browsers get nothing', () => {
    expect(pushSetupState(env({ messagingSupported: false }))).toBe('nothing');
  });
});
