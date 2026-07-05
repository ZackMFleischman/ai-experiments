// T6.1 gate: tile skins — every skin ships a complete light+dark var set, the
// preference persists (lex.skin.v1), and Settings switches both theme and skin.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProviders } from '../src/App';
import { SKIN_IDS, SKIN_NAMES, TILE_SKINS, skinVars, type SkinVars } from '../src/board/skin';
import { SKIN_STORAGE_KEY, SkinProvider, storedSkin, useSkin } from '../src/board/skinContext';
import { Settings } from '../src/screens/Settings';

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

const MODES = ['light', 'dark'] as const;
const VAR_KEYS = Object.keys(TILE_SKINS.classic.light) as Array<keyof SkinVars>;

describe('skin registry', () => {
  it('covers every skin × mode with the full var set (no skin may drop a var)', () => {
    for (const skin of SKIN_IDS) {
      for (const mode of MODES) {
        const vars = skinVars(mode, skin);
        for (const key of VAR_KEYS) {
          expect(vars[key], `${skin}/${mode} ${key}`).toBeTruthy();
        }
        expect(Object.keys(vars).sort()).toEqual([...VAR_KEYS].sort());
      }
    }
  });

  it('defaults to classic when no skin is passed (pre-T6.1 call sites)', () => {
    expect(skinVars('light')).toBe(TILE_SKINS.classic.light);
    expect(skinVars('dark')).toBe(TILE_SKINS.classic.dark);
  });

  it('names every skin for the Settings picker', () => {
    for (const skin of SKIN_IDS) expect(SKIN_NAMES[skin]).toBeTruthy();
  });

  it('keeps the geometry knob identical across skins — only colors vary', () => {
    for (const skin of SKIN_IDS) {
      for (const mode of MODES) {
        expect(skinVars(mode, skin)['--lex-cell']).toBe(TILE_SKINS.classic.light['--lex-cell']);
      }
    }
  });
});

describe('storedSkin', () => {
  it('returns a stored valid skin id', () => {
    window.localStorage.setItem(SKIN_STORAGE_KEY, 'walnut');
    expect(storedSkin(window.localStorage)).toBe('walnut');
  });

  it('falls back to classic on missing, junk, or throwing storage', () => {
    expect(storedSkin(window.localStorage)).toBe('classic');
    window.localStorage.setItem(SKIN_STORAGE_KEY, 'mahogany');
    expect(storedSkin(window.localStorage)).toBe('classic');
    expect(storedSkin(undefined)).toBe('classic');
    expect(
      storedSkin({
        getItem: () => {
          throw new Error('denied');
        },
      }),
    ).toBe('classic');
  });
});

function Probe() {
  const { skin, setSkin } = useSkin();
  return (
    <button data-testid="probe" onClick={() => setSkin('high-contrast')}>
      {skin}
    </button>
  );
}

describe('SkinProvider', () => {
  it('starts from localStorage and persists changes back', () => {
    window.localStorage.setItem(SKIN_STORAGE_KEY, 'walnut');
    render(
      <SkinProvider>
        <Probe />
      </SkinProvider>,
    );
    const probe = screen.getByTestId('probe');
    expect(probe.textContent).toBe('walnut');
    fireEvent.click(probe);
    expect(probe.textContent).toBe('high-contrast');
    expect(window.localStorage.getItem(SKIN_STORAGE_KEY)).toBe('high-contrast');
  });
});

function renderSettings() {
  return render(
    <MemoryRouter>
      <AppProviders>
        <Settings />
      </AppProviders>
    </MemoryRouter>,
  );
}

describe('Settings', () => {
  it('offers every skin and marks the active one', () => {
    renderSettings();
    for (const skin of SKIN_IDS) expect(screen.getByTestId(`skin-${skin}`)).toBeTruthy();
    expect(screen.getByTestId('skin-classic').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('skin-walnut'));
    expect(screen.getByTestId('skin-walnut').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('skin-classic').getAttribute('aria-pressed')).toBe('false');
    expect(window.localStorage.getItem(SKIN_STORAGE_KEY)).toBe('walnut');
  });

  it('switches and persists the theme (lex.theme.v1)', () => {
    renderSettings();
    const dark = screen.getByTestId('theme-dark');
    fireEvent.click(dark);
    expect(dark.getAttribute('aria-pressed')).toBe('true');
    expect(window.localStorage.getItem('lex.theme.v1')).toBe('dark');
    // Re-clicking the active mode is a no-op, not a toggle-back.
    fireEvent.click(dark);
    expect(dark.getAttribute('aria-pressed')).toBe('true');
  });
});
