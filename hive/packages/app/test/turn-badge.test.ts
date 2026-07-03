// T5.4: in-app turn awareness — document title "(n) HIVE" + app icon badge
// via the Badging API where supported (DESIGN §7).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTurnBadge } from '../src/screens/turnBadge';

afterEach(() => {
  document.title = 'HIVE';
});

describe('applyTurnBadge', () => {
  it('prefixes the title with the your-turn count', () => {
    applyTurnBadge(2);
    expect(document.title).toBe('(2) HIVE');
  });

  it('restores the plain title at zero', () => {
    applyTurnBadge(3);
    applyTurnBadge(0);
    expect(document.title).toBe('HIVE');
  });

  it('sets and clears the app icon badge where the API exists', () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { setAppBadge, clearAppBadge });
    applyTurnBadge(4);
    expect(setAppBadge).toHaveBeenCalledWith(4);
    applyTurnBadge(0);
    expect(clearAppBadge).toHaveBeenCalled();
  });

  it('is a no-op on browsers without the Badging API', () => {
    delete (navigator as { setAppBadge?: unknown }).setAppBadge;
    delete (navigator as { clearAppBadge?: unknown }).clearAppBadge;
    expect(() => applyTurnBadge(1)).not.toThrow();
    expect(document.title).toBe('(1) HIVE');
  });
});
