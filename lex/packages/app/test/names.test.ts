// Score-bar name shortening: first names, with progressive fallback to
// first + last initial, then full name only when those still collide.
import { describe, expect, it } from 'vitest';
import { displayNames } from '../src/game/names';

describe('displayNames', () => {
  it('uses first names only when they are unique', () => {
    expect(displayNames(['Mike Borrebach', 'Zachary Fleischman'])).toEqual(['Mike', 'Zachary']);
  });

  it('adds the last initial when first names collide', () => {
    expect(displayNames(['Mike Borrebach', 'Mike Chen'])).toEqual(['Mike B.', 'Mike C.']);
  });

  it('falls back to full names when first + last initial still collide', () => {
    expect(displayNames(['Mike Borrebach', 'Mike Brown'])).toEqual([
      'Mike Borrebach',
      'Mike Brown',
    ]);
  });

  it('disambiguates with a last initial even when the other name has none', () => {
    expect(displayNames(['Mike Borrebach', 'Mike'])).toEqual(['Mike B.', 'Mike']);
  });

  it('handles identical full names (shows them in full, unavoidably)', () => {
    expect(displayNames(['Sam Lee', 'Sam Lee'])).toEqual(['Sam Lee', 'Sam Lee']);
  });

  it('leaves single-word names and mixed casing alone when unique', () => {
    expect(displayNames(['Cher', 'ada lovelace'])).toEqual(['Cher', 'ada']);
  });

  it('keeps placeholder names intact rather than emitting "Player 1."', () => {
    // The numeric tail is not a usable initial, so it stays a full label.
    expect(displayNames(['Player 1', 'Player 2'])).toEqual(['Player 1', 'Player 2']);
  });

  it('disambiguates by the LAST token, not middle names', () => {
    expect(displayNames(['Mary Jane Watson', 'Mary Jane Parker'])).toEqual([
      'Mary W.',
      'Mary P.',
    ]);
  });
});
