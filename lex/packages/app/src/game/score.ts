// Score typography (T6.2): negatives use the typographic minus (U+2212) —
// a hyphen-minus next to an em dash reads as a stray dash.
export function formatScore(n: number): string {
  return n < 0 ? `−${-n}` : `${n}`;
}
