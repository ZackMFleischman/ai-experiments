// Score typography (T6.2): negatives use the typographic minus (U+2212) —
// a hyphen-minus next to an em dash reads as a stray dash.
export function formatScore(n: number): string {
  return n < 0 ? `−${-n}` : `${n}`;
}

/** "1st" / "2nd" / "3rd" / "4th" — a placing, spelled out. */
export function ordinal(place: number): string {
  const suffix = place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th';
  return `${place}${suffix}`;
}
