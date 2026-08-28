// Word definitions (T8.2, DESIGN §5.5 / §7.1): the one surface that answers
// "what does that even mean?", opened by tapping a word wherever it already
// appears — a row of the live preview card, or a word in the score sheet.
//
// Definitions are cosmetic and never gate a play, so this sheet is allowed to
// come up empty; what it must never do is imply the word is invalid because of
// it. The bundled glossary covers roughly two thirds of a tournament list, so
// "no definition here" is a routine outcome and the Wiktionary link-out is
// always offered — present, not apologetic.
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Box, Chip, CircularProgress, Drawer, Link, Typography } from '@mui/material';
import { lookupGloss, type GlossEntry } from '@lex/dict';
import { useEffect, useState } from 'react';

/** Short source tags → what a player reads. */
const PART_OF_SPEECH: Record<string, string> = {
  n: 'noun',
  v: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  interj: 'interjection',
  pron: 'pronoun',
  prep: 'preposition',
  conj: 'conjunction',
  art: 'article',
};

type LookupState =
  | { status: 'loading' }
  | { status: 'found'; entry: GlossEntry }
  | { status: 'none' }
  | { status: 'error' };

export interface WordDefinitionSheetProps {
  /** The word to define; `null` closes the sheet. Case-insensitive. */
  word: string | null;
  /**
   * Whether the game's dictionary accepts this word. Only the empty state
   * reads it, and it has to: reassuring a player that an undefined word is
   * "still legal" is exactly wrong for a staged word the dictionary just
   * rejected. Locked-in words are legal by construction; a staged word passes
   * its preview verdict.
   */
  legal?: boolean;
  onClose: () => void;
  /** Test/gallery seam: skip the fetch and render this state directly. */
  initialState?: LookupState;
}

const wiktionary = (word: string) => `https://en.wiktionary.org/wiki/${word.toLowerCase()}`;

export function WordDefinitionSheet({
  word,
  legal = true,
  onClose,
  initialState,
}: WordDefinitionSheetProps) {
  const [state, setState] = useState<LookupState>(initialState ?? { status: 'loading' });

  useEffect(() => {
    if (word === null || initialState) return;
    let alive = true;
    setState({ status: 'loading' });
    lookupGloss(word)
      .then((entry) => {
        if (alive) setState(entry ? { status: 'found', entry } : { status: 'none' });
      })
      .catch(() => {
        if (alive) setState({ status: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [word, initialState]);

  const shown = (word ?? '').toUpperCase();

  return (
    <Drawer anchor="bottom" open={word !== null} onClose={onClose}>
      <Box data-testid="word-definition" data-word={shown} sx={{ p: 2.5, pb: 3, maxHeight: '60dvh', overflowY: 'auto' }}>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 700, letterSpacing: '0.08em' }}>
          {shown}
        </Typography>

        {state.status === 'loading' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5 }}>
            <CircularProgress size={18} aria-label="looking up definition" />
            <Typography variant="body2" color="text.secondary">
              Looking it up…
            </Typography>
          </Box>
        )}

        {state.status === 'found' && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, mb: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                {PART_OF_SPEECH[state.entry.pos] ?? state.entry.pos}
              </Typography>
              {state.entry.base !== undefined && (
                // The reduction is a spelling heuristic (morphology.ts), so say
                // which word was actually defined rather than quietly implying
                // the gloss belongs to the one the player tapped.
                <Chip
                  size="small"
                  variant="outlined"
                  data-testid="definition-base"
                  label={`form of ${state.entry.base}`}
                  sx={{ height: 20 }}
                />
              )}
            </Box>
            <Typography data-testid="definition-gloss" variant="body1">
              {state.entry.gloss}
            </Typography>
          </>
        )}

        {state.status === 'none' && (
          <Typography data-testid="definition-none" variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {legal
              ? 'No definition bundled for this one — it’s still a legal word.'
              : 'No definition bundled, and this game’s dictionary doesn’t accept it.'}
          </Typography>
        )}

        {state.status === 'error' && (
          <Typography data-testid="definition-error" variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Definitions couldn’t load. You may be offline — this word hasn’t been looked up on this
            device before.
          </Typography>
        )}

        {shown !== '' && (
          <Link
            href={wiktionary(shown)}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="definition-wiktionary"
            variant="body2"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 2, minHeight: 44 }}
          >
            Look up {shown} on Wiktionary
            <OpenInNewIcon sx={{ fontSize: 16 }} />
          </Link>
        )}

        {/* WordNet's licence asks that its notice travel with the data. Stated
            for the glossary as a whole — the two-letter entries are ours. */}
        {state.status === 'found' && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Definitions from WordNet 3.0 (Princeton University), with hand-written entries for
            two-letter words.
          </Typography>
        )}
      </Box>
    </Drawer>
  );
}
