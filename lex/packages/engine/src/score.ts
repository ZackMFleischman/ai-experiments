// scorePlay — premium/cross-word/bingo scoring (DESIGN §5.2 stage 2, §5.3).
// Letter premiums apply to newly placed tiles only; word multipliers stack
// and likewise count only when newly covered; blanks score 0 regardless of
// designated letter; premiums under existing tiles never re-count.
import { extractWords, type Board, type Placement } from './board.js';
import { cellKey, type Ruleset } from './ruleset.js';
import type { WordScore } from './validate.js';

export interface PlayScore {
  words: readonly WordScore[];
  bingo: boolean;
  total: number;
}

export function scorePlay(board: Board, placements: readonly Placement[], ruleset: Ruleset): PlayScore {
  const { words, overlay } = extractWords(board, placements);
  const placedKeys = new Set(placements.map((p) => cellKey(p.cell)));
  const premiums = ruleset.board.premiums;
  const points = ruleset.tiles.points;

  const scored: WordScore[] = words.map(({ word, cells }) => {
    let letters = 0;
    let multiplier = 1;
    for (const cell of cells) {
      const key = cellKey(cell);
      const tile = overlay.get(key)!;
      let value = tile.isBlank ? 0 : (points[tile.letter] ?? 0);
      if (placedKeys.has(key)) {
        const premium = premiums[key];
        if (premium === 'DL') value *= 2;
        else if (premium === 'TL') value *= 3;
        else if (premium === 'DW') multiplier *= 2;
        else if (premium === 'TW') multiplier *= 3;
      }
      letters += value;
    }
    return { word, cells, score: letters * multiplier };
  });

  const bingo = placements.length === ruleset.rackSize;
  const total = scored.reduce((sum, w) => sum + w.score, 0) + (bingo ? ruleset.bingoBonus : 0);
  return { words: scored, bingo, total };
}
