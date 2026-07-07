// Player-name display for the compact score bar (UI polish): full names read
// as sloppy and wrap the bar, so we show first names, disambiguating only as
// far as needed — first name → first + last initial → full name (DESIGN §7.1).
interface Parsed {
  full: string;
  first: string;
  last: string;
}

function parse(name: string): Parsed {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  return {
    full: name,
    first: tokens[0] ?? name,
    // A usable initial is a letter — a placeholder tail ("Player 1") stays a
    // full name rather than becoming the odd "Player 1.".
    last: tokens.length > 1 && /^\p{L}/u.test(tokens[tokens.length - 1]!) ? tokens[tokens.length - 1]! : '',
  };
}

const initialOf = (p: Parsed): string => `${p.first} ${p.last[0]!.toUpperCase()}.`;
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** Shorten each name against the others: first name only when it's unique;
 * first + last initial ("Mike B.") when first names collide; the full name
 * only when first + last initial are still identical (or there's no last
 * name to disambiguate with). */
export function displayNames(names: readonly string[]): string[] {
  const parsed = names.map(parse);
  return parsed.map((p, i) => {
    const firstClashes = parsed.some((o, j) => j !== i && same(o.first, p.first));
    if (!firstClashes) return p.first;
    if (p.last) {
      const label = initialOf(p);
      const initialClashes = parsed.some(
        (o, j) => j !== i && o.last && same(initialOf(o), label),
      );
      if (!initialClashes) return label;
    }
    return p.full;
  });
}
