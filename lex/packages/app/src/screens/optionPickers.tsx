// The per-game option pickers (DESIGN §2.2, §7.1, FR-6/FR-7/FR-9b), shared by
// the two places a game gets created: the multiplayer New Game form
// (newGameView) and the hot-seat setup screen (HotSeatSetup).
//
// They live here rather than inline in one form because the copy they render —
// what a dictionary is for, what an invalid word costs — must be identical
// wherever a game is configured. Duplicating the invalid-words picker in
// particular would let the two forms describe the same rule differently, which
// is precisely what the shared copy constants in gameOptions.ts exist to
// prevent. Firebase-free; pure presentation over engine/dict registry data.
import {
  Card,
  CardActionArea,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { RULESETS, type Ruleset } from '@lex/engine';
import { DICTIONARIES } from '@lex/dict';
import type { ReactNode } from 'react';
import { MiniBoard } from '../board/MiniBoard';
import {
  boardName,
  INVALID_WORDS_BLURBS,
  INVALID_WORDS_LABELS,
  INVALID_WORDS_NAME,
  type InvalidWordRule,
} from '../gameOptions';

/** One labeled section, so every picker sits at the same rhythm in both forms. */
export function OptionSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack spacing={1}>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      {children}
    </Stack>
  );
}

const rangeLabel = (range: { min: number; max: number }): string =>
  range.min === range.max ? `${range.min} players` : `${range.min}–${range.max} players`;

/**
 * FR-6: board layout, with a mini premium-map preview per registry entry.
 *
 * `players` is optional because only the online form has a seat count to
 * respect — hot-seat setup has no picker for it. When it is given, a board
 * whose `Ruleset.players` range cannot seat that many is dimmed and DISABLED
 * with the range it does take, never hidden: the board still exists, it just
 * cannot deal this many racks (T7.15).
 */
export function BoardPicker({
  value,
  onChange,
  players,
  rulesets = RULESETS,
}: {
  value: string;
  onChange: (rulesetId: string) => void;
  players?: number;
  /** Injectable so the seat range stays engine data all the way into the
   * tests, rather than a constant this file believes in. */
  rulesets?: Readonly<Record<string, Ruleset>>;
}) {
  return (
    <OptionSection label="Board">
      <Stack direction="row" spacing={1.5}>
        {Object.entries(rulesets).map(([id, ruleset]) => {
          const range = ruleset!.players;
          const fits = players === undefined || (players >= range.min && players <= range.max);
          return (
            <Card
              key={id}
              variant="outlined"
              sx={{
                flex: 1,
                opacity: fits ? 1 : 0.5,
                borderColor: value === id ? 'primary.main' : 'divider',
                borderWidth: value === id ? 2 : 1,
              }}
            >
              <CardActionArea
                onClick={() => onChange(id)}
                disabled={!fits}
                data-testid={`board-${id}`}
                aria-pressed={value === id}
                sx={{ p: 1.25 }}
              >
                <Stack spacing={1} alignItems="center">
                  <MiniBoard rulesetId={id} size={96} />
                  <Typography variant="body2" fontWeight={600}>
                    {boardName(id)}
                  </Typography>
                  {!fits && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      align="center"
                      data-testid={`board-${id}-unavailable`}
                    >
                      Takes {rangeLabel(range)}
                    </Typography>
                  )}
                </Stack>
              </CardActionArea>
            </Card>
          );
        })}
      </Stack>
    </OptionSection>
  );
}

/** FR-7: word list, labeled with name + word count + what it is for. */
export function DictionaryPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (dictionaryId: string) => void;
}) {
  return (
    <OptionSection label="Dictionary">
      <Stack spacing={1}>
        {DICTIONARIES.map((d) => (
          <Card
            key={d.id}
            variant="outlined"
            sx={{
              borderColor: value === d.id ? 'primary.main' : 'divider',
              borderWidth: value === d.id ? 2 : 1,
            }}
          >
            <CardActionArea
              onClick={() => onChange(d.id)}
              data-testid={`dictionary-${d.id}`}
              aria-pressed={value === d.id}
              sx={{ p: 1.25 }}
            >
              <Stack direction="row" spacing={1} alignItems="baseline">
                <Typography fontWeight={600}>{d.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {Math.round(d.wordCount / 1000)}k words
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {d.description}
              </Typography>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
    </OptionSection>
  );
}

/** FR-9b: what an invalid word costs. Two named values in the same toggle
 * shape as turn order and time control — a setting, not a difficulty — with
 * the rule stated under whichever one is selected, so it can never be chosen
 * unread. */
export function InvalidWordsPicker({
  value,
  onChange,
}: {
  value: InvalidWordRule;
  onChange: (rule: InvalidWordRule) => void;
}) {
  return (
    <OptionSection label={INVALID_WORDS_NAME}>
      <ToggleButtonGroup
        exclusive
        value={value}
        onChange={(_, v: InvalidWordRule | null) => v && onChange(v)}
        fullWidth
      >
        <ToggleButton value="blocked" data-testid="invalid-words-blocked">
          {INVALID_WORDS_LABELS.blocked}
        </ToggleButton>
        <ToggleButton value="costs-turn" data-testid="invalid-words-costs-turn">
          {INVALID_WORDS_LABELS['costs-turn']}
        </ToggleButton>
      </ToggleButtonGroup>
      <Typography variant="body2" color="text.secondary">
        {INVALID_WORDS_BLURBS[value]}
      </Typography>
    </OptionSection>
  );
}
