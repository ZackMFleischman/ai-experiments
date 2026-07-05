// T5.4: applyTurnBadge — document title count + app icon badge (Badging API
// where present, harmless where not). actionableCount cases live in
// lobby-view.test.tsx alongside the grouping they must mirror.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTurnBadge } from '../src/screens/turnBadge';

afterEach(() => {
  applyTurnBadge(0);
  vi.restoreAllMocks();
});

describe('applyTurnBadge', () => {
  it('prefixes the document title with the count and clears at zero', () => {
    applyTurnBadge(3);
    expect(document.title).toBe('(3) LEX');
    applyTurnBadge(0);
    expect(document.title).toBe('LEX');
  });

  it('drives the Badging API when the platform has it', () => {
    interface BadgingNavigator {
      setAppBadge?: (n: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    }
    const nav = navigator as Navigator & BadgingNavigator;
    const set = vi.fn().mockResolvedValue(undefined);
    const clear = vi.fn().mockResolvedValue(undefined);
    nav.setAppBadge = set;
    nav.clearAppBadge = clear;
    applyTurnBadge(2);
    expect(set).toHaveBeenCalledWith(2);
    applyTurnBadge(0);
    expect(clear).toHaveBeenCalled();
    delete (nav as BadgingNavigator).setAppBadge;
    delete (nav as BadgingNavigator).clearAppBadge;
  });
});
