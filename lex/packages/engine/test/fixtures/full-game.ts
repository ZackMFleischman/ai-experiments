// T1.9 pinned full-game fixtures (IMPLEMENTATION §6). FULL_GAME was produced
// once by a deterministic max-tiles policy over the pinned bag order below,
// then frozen here; the replay test re-derives every line. It exercises:
// bingo (move 0 places 7), blanks (lowercase e in moves 0/1), exchange
// (move 3), bridging long plays, and a played-out ending with adjustments.
import type { TileFace } from '../../src/index.js';

export const FULL_GAME = {
  rulesetId: 'classic',
  seats: 2,
  startingRacks: [
    ['C', 'A', 'T', 'S', '?', 'E', 'R'],
    ['D', 'O', 'G', '?', 'R', 'I', 'N'],
  ] as readonly (readonly TileFace[])[],
  bagPrefix: ['Q', 'Z', 'J', 'X', 'K', 'V', 'W'] as readonly TileFace[],
  moves: [
    '8B CATSeER +68',
    '7A DOGeRIN +77',
    '6A QZJXKVW +219',
    '-AA',
    '5A ABBCDDD +171',
    '4A AAAAAEE +167',
    '3A EEEEEEE +177',
    '2A EEFFGGH +230',
    '1A HIIIIII +246',
    '1A HIIIIIIIILLLLM +110',
    '2A EEFFGGHMNNNNNO +132',
    '3A EEEEEEEOOOOOOP +115',
    '4A AAAAAEEPRRRRSS +131',
    '5A ABBCDDDSTTTTTU +144',
    '6A QZJXKVWUUUVWYY +200',
  ],
  finalScores: [1346, 841] as readonly number[],
  endedBy: 'played-out' as const,
  standings: [[0], [1]] as readonly (readonly number[])[],
};

// A quick game to the scoreless limit: one scoring play, then six scoreless
// turns. Rack sums differ so the ending is decisive.
export const SCORELESS_GAME = {
  rulesetId: 'classic',
  seats: 2,
  startingRacks: [
    ['C', 'A', 'T', 'E', 'E', 'E', 'E'], // stranded after CAT: E×4 = 4 + refills
    ['Q', 'Z', 'J', 'X', 'K', 'V', 'W'], // stranded: 10+10+8+8+5+4+4 = 49
  ] as readonly (readonly TileFace[])[],
  bagPrefix: ['B', 'B', 'C'] as readonly TileFace[], // CAT's refill: B(3)+B(3)+C(3)
  moves: ['8H CAT +10', '-', '-', '-', '-', '-', '-'],
  // seat 0: 10 − (E×4 + B+B+C = 13) = −3; seat 1: 0 − 49 = −49
  finalScores: [-3, -49] as readonly number[],
  endedBy: 'scoreless' as const,
  standings: [[0], [1]] as readonly (readonly number[])[],
};

// Six opening passes with equal rack sums ⇒ a scoreless draw.
export const TIE_GAME = {
  rulesetId: 'classic',
  seats: 2,
  startingRacks: [
    ['A', 'E', 'I', 'O', 'U', 'L', 'N'], // 7 × 1 point
    ['R', 'S', 'T', 'E', 'E', 'A', 'I'], // 7 × 1 point
  ] as readonly (readonly TileFace[])[],
  bagPrefix: [] as readonly TileFace[],
  moves: ['-', '-', '-', '-', '-', '-'],
  finalScores: [-7, -7] as readonly number[],
  endedBy: 'scoreless' as const,
  standings: [[0, 1]] as readonly (readonly number[])[],
};
