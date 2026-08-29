// ported from hive/packages/app/src/controller/GameController.ts (adapted —
// the generic log-sync core now lives in @parlor/core LogSession; this class
// owns the LEX-specific session state: the pending-placement model, the
// verdict-pipeline preview (checkPlay/scorePlay/dict — the UI never computes
// rules), rack display order, exchange/blank/end handling.)
import type {
  Cell,
  CellKey,
  Dictionary,
  GameResult,
  GameState,
  Letter,
  MoveOptions,
  PlayCheck,
  Ruleset,
  Seat,
  TileFace,
  WordScore,
} from '@lex/engine';
import {
  RULESETS,
  applyMove,
  cellKey,
  checkPlay,
  deserializeState,
  initialState,
  rejectedWords,
  result,
  scorePlay,
} from '@lex/engine';
import { LogSession, type GameTransport } from '@parlor/core';
import type { ViewState } from '../board/BoardViewport';
import type { HotSeatOptions, LexEntry, SyncRow } from './entries';

export interface PendingTile {
  face: TileFace; // what left the rack ('A'… or '?')
  letter: Letter | null; // designated letter; null = blank awaiting the picker
  isBlank: boolean;
  fromIndex: number; // rack slot it came from (returns go home)
}

export interface PreviewWord {
  word: string;
  score: number;
  /** The dictionary verdict — or `null` when the game WITHHOLDS it. A game
   * whose invalid words cost the turn (DESIGN §2.3) is exactly that
   * withholding: the verdict still exists, the player just doesn't get it
   * until they commit. Deliberately not `false`, so no surface can mistake
   * "not told" for "rejected". */
  valid: boolean | null;
  cells: readonly Cell[];
}

export interface Preview {
  check: PlayCheck;
  words: readonly PreviewWord[];
  total: number;
  bingo: boolean;
  /** First staged blank still awaiting its letter (blocks Play). */
  needsBlank: CellKey | null;
  playable: boolean;
}

export type GameEnd =
  | {
      by: 'played-out' | 'scoreless' | 'last-standing';
      winner: Seat | 'draw';
      finalScores: readonly number[];
      /** Per-seat end adjustment (rack gains/deductions), for the score
       * story's line items — finalScores minus the pre-adjustment totals. */
      adjustments: readonly number[];
    }
  | { by: 'resign' | 'timeout'; winner: Seat; finalScores: readonly number[] };

export interface LastPlay {
  by: Seat;
  /** 'phoney' = a play the dictionary refused where that costs the turn
   * (§2.3): the turn is spent, nothing reached the board, so `cells`/`words`
   * stay empty. */
  kind: 'play' | 'phoney' | 'exchange' | 'pass';
  cells: readonly CellKey[];
  words: readonly WordScore[];
  total: number;
  /** Exchange: how many tiles went back. */
  count?: number;
}

/** One score-sheet line (T3.9): what happened + running totals after it. */
export interface SheetRow {
  n: number;
  by: Seat;
  kind: 'play' | 'phoney' | 'exchange' | 'pass' | 'resign' | 'timeout';
  word: string | null; // main word of a play
  words: readonly WordScore[];
  score: number;
  count?: number;
  totals: readonly number[];
}

export interface Snapshot {
  options: HotSeatOptions;
  ruleset: Ruleset;
  state: GameState; // FULL state — hot-seat/server only (DESIGN §3.2)
  log: readonly LexEntry[];
  result: GameResult;
  end?: GameEnd;
  toMove: Seat;
  scores: readonly number[];
  bagCount: number;
  rackCounts: readonly number[];
  /** Display rack of the acting player (perspective seat in multiplayer,
   * side-to-move in hot-seat); staged tiles leave null slots. */
  rack: ReadonlyArray<TileFace | null>;
  pending: ReadonlyMap<CellKey, PendingTile>;
  preview: Preview | null;
  /** Multiplayer: refill tiles still in flight after an optimistic move —
   * the rack shows this many "drawing…" placeholder slots (T4.6). */
  drawing: number;
  /** Rack slot armed by the tap-tap flow (T3.5); null = none. */
  selection: number | null;
  /** Exchange multi-select mode (T3.6): selected rack slots; null = off. */
  exchange: ReadonlySet<number> | null;
  /** May the local player act right now (their turn, game not over)? */
  interactive: boolean;
  canExchange: boolean;
  lastPlay?: LastPlay;
  sheet: readonly SheetRow[];
  view: ViewState | null;
  /** End-of-game beat (T3.10): camera settles on these cells before the
   * overlay. Present only until finishBeat() (board endings only). */
  beat?: { cells: readonly CellKey[] };
  overlayOpen: boolean;
  notice?: { id: number; text: string };
  /** The play just committed was a phoney (§2.3). Raised for the MOVER at the
   * moment they commit (never on replay or resume), so the turn they just lost
   * is told to them once, in full, before the device moves on. */
  phoney?: { id: number; words: readonly string[] };
}

interface SessionState {
  game: GameState;
  resigned?: Seat;
  timedOut?: Seat;
  lastPlay?: LastPlay;
  sheet: readonly SheetRow[];
  /** Multiplayer (T4.6): the REAL own-rack faces (rack doc). The engine
   * state's own rack may briefly run ahead with placeholder draws after an
   * optimistic move — the difference is the "drawing…" count. */
  myRack?: readonly TileFace[];
}

export interface ControllerDeps {
  dict: Dictionary;
  /** Edge randomness (rack shuffle, exchange re-shuffle). Tests inject. */
  rng?: () => number;
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Rebuild rack slots from the engine rack, preserving the user's arrangement
 * where tiles survived; unclaimed faces fill free slots IN RACK ORDER (a
 * per-face count map would collapse duplicates together and scramble the
 * dealt/drawn order — the T4.8 e2e caught exactly that). */
function reconcileSlots(
  prev: ReadonlyArray<TileFace | null>,
  rack: readonly TileFace[],
  rackSize: number,
): Array<TileFace | null> {
  const remaining = [...rack];
  const take = (face: TileFace): boolean => {
    const at = remaining.indexOf(face);
    if (at < 0) return false;
    remaining.splice(at, 1);
    return true;
  };
  const slots: Array<TileFace | null> = Array.from({ length: rackSize }, (_, i) => {
    const face = prev[i] ?? null;
    return face && take(face) ? face : null;
  });
  for (let i = 0; i < slots.length && remaining.length > 0; i++) {
    if (slots[i] === null) slots[i] = remaining.shift()!;
  }
  return slots;
}

export class GameController {
  private readonly session: LogSession<HotSeatOptions, LexEntry, SessionState>;
  private readonly dict: Dictionary;
  private readonly rng: () => number;

  private listeners = new Set<() => void>();
  private snapshot: Snapshot | null = null;

  private pending = new Map<CellKey, PendingTile>();
  private selection: number | null = null;
  private exchangeSelection: Set<number> | null = null;
  private rackSlots: Array<TileFace | null> = [];
  private syncedGame: GameState | null = null;
  private syncedSeat: Seat | null = null;

  private view: ViewState | null = null;
  private beatDone = false;
  private overlayDismissed = false;
  private noticeSeq = 0;
  private notice: { id: number; text: string } | undefined;
  private phoney: { id: number; words: readonly string[] } | undefined;

  constructor(
    transport: GameTransport<HotSeatOptions, LexEntry>,
    private readonly defaultOptions: HotSeatOptions,
    deps: ControllerDeps,
    /** Multiplayer (T4.6): the seat this client plays; hot-seat leaves it unset. */
    private readonly perspective?: Seat,
  ) {
    this.dict = deps.dict;
    this.rng = deps.rng ?? Math.random;
    this.session = new LogSession<HotSeatOptions, LexEntry, SessionState>(
      transport,
      {
        init: (options) => ({ game: this.initialGame(options), sheet: [] }),
        apply: (state, entry) => this.applyEntry(state, entry),
      },
      {
        onRejected: () => {
          // The rolled-back state has the pre-submit object identity — force
          // the lazy rack sync to rebuild slots from the engine rack.
          this.syncedGame = null;
          // The move never happened, so neither did the lost turn.
          this.phoney = undefined;
          this.notice = { id: ++this.noticeSeq, text: 'Move rejected — undone.' };
          this.emit();
        },
      },
    );
    this.session.subscribe(() => this.emit());
  }

  /** Restore from the transport's stored log and start listening for remote
   * entries (refresh resume T3.8; live sync T4.6). */
  async init(): Promise<void> {
    await this.session.init();
  }

  dispose(): void {
    this.session.dispose();
  }

  /** Rebuild from the transport's source of truth (visibility regain, push-sync). */
  async resync(): Promise<void> {
    await this.session.resync();
  }

  async newGame(options?: HotSeatOptions): Promise<void> {
    await this.session.reset(options ?? this.defaultOptions);
    this.pending.clear();
    this.view = null;
    this.beatDone = false;
    this.overlayDismissed = false;
    this.phoney = undefined;
    this.emit();
  }

  // ── engine plumbing ────────────────────────────────────────────────────────

  private initialGame(options: HotSeatOptions): GameState {
    const ruleset = RULESETS[options.rulesetId];
    if (!ruleset) throw new Error(`unknown ruleset '${options.rulesetId}'`);
    return initialState(ruleset, options.bagOrder, options.seats);
  }

  private rulesetFor(options: HotSeatOptions): Ruleset {
    const ruleset = RULESETS[options.rulesetId];
    if (!ruleset) throw new Error(`unknown ruleset '${options.rulesetId}'`);
    return ruleset;
  }

  /** Does an invalid word cost the turn in this game (§2.3)? Read from the
   * SESSION's options, not the defaults — a resumed or synced game brings its
   * own. */
  private invalidWordsCostTurn(): boolean {
    return this.currentOptions().invalidWords === 'costs-turn';
  }

  /** The per-game settings every applyMove in this class must be handed. */
  private moveOptions(): MoveOptions {
    return { invalidWords: this.currentOptions().invalidWords ?? 'blocked' };
  }

  private applyEntry(state: SessionState, entry: LexEntry): SessionState {
    const ruleset = this.rulesetFor(this.session.options ?? this.defaultOptions);
    const by = state.game.toMove;
    // Running totals accumulate from recorded scores, NOT game.scores — the
    // terminal move's engine scores already include end adjustments, and the
    // sheet (like a paper one) shows pre-adjustment totals; the adjustments
    // become the result overlay's line items (computeEnd).
    const row = (partial: Omit<SheetRow, 'n' | 'totals'>): readonly SheetRow[] => {
      const prev = state.sheet[state.sheet.length - 1]?.totals ?? state.game.scores.map(() => 0);
      return [
        ...state.sheet,
        {
          ...partial,
          n: state.sheet.length,
          totals: prev.map((t, seat) => (seat === partial.by ? t + partial.score : t)),
        },
      ];
    };
    // Multiplayer: my own optimistic move consumes real faces from the rack
    // doc's snapshot; the engine's refill draws are placeholders until the
    // rack listener lands (the Snapshot.drawing count).
    const nextMyRack = (used: readonly TileFace[]): Pick<SessionState, 'myRack'> => {
      if (!state.myRack || by !== this.perspective) {
        return state.myRack ? { myRack: state.myRack } : {};
      }
      const rest = [...state.myRack];
      for (const face of used) {
        const i = rest.indexOf(face);
        if (i >= 0) rest.splice(i, 1);
      }
      return { myRack: rest };
    };
    switch (entry.kind) {
      case 'sync':
        return this.adoptSync(entry);
      case 'play': {
        const score = scorePlay(state.game.board, entry.placements, ruleset);
        const game = applyMove(
          state.game,
          { type: 'play', placements: entry.placements },
          this.dict,
          this.moveOptions(),
        );
        // 'costs-turn': the engine turned this play into a phoney rather than
        // throwing. Re-asking the dictionary is how we learn which — the same
        // verdict applyMove just reached, over the same words, so replay of the
        // same log always classifies the row the same way.
        const bad = this.invalidWordsCostTurn() ? rejectedWords(score.words, this.dict) : [];
        if (bad.length > 0) {
          // The tiles never left the rack, so nextMyRack consumes nothing.
          // No cells — a phoney leaves the board untouched — but the words it
          // formed ARE kept and shown to both players (§3.3). They score 0.
          const refused = bad.map((word) => ({ word, score: 0, cells: [] }));
          return {
            ...state,
            game,
            lastPlay: { by, kind: 'phoney', cells: [], words: refused, total: 0 },
            sheet: row({ by, kind: 'phoney', word: bad[0] ?? null, words: refused, score: 0 }),
          };
        }
        return {
          ...state,
          ...nextMyRack(entry.placements.map((p) => (p.isBlank ? '?' : p.letter))),
          game,
          lastPlay: {
            by,
            kind: 'play',
            cells: entry.placements.map((p) => cellKey(p.cell)),
            words: score.words,
            total: score.total,
          },
          sheet: row({
            by,
            kind: 'play',
            word: score.words[0]?.word ?? null,
            words: score.words,
            score: score.total,
          }),
        };
      }
      case 'exchange': {
        const game = applyMove(state.game, { type: 'exchange', tiles: entry.tiles }, this.dict, this.moveOptions());
        // The engine appended the returned tiles deterministically; the entry
        // pins the edge-shuffled remainder (same multiset, new order).
        const sameBag =
          game.bag.length === entry.bagAfter.length &&
          [...game.bag].sort().join('') === [...entry.bagAfter].sort().join('');
        if (!sameBag) throw new Error('exchange entry bagAfter is not a permutation of the bag');
        return {
          ...state,
          ...nextMyRack(entry.tiles),
          game: { ...game, bag: entry.bagAfter },
          lastPlay: { by, kind: 'exchange', cells: [], words: [], total: 0, count: entry.tiles.length },
          sheet: row({ by, kind: 'exchange', word: null, words: [], score: 0, count: entry.tiles.length }),
        };
      }
      case 'pass': {
        const game = applyMove(state.game, { type: 'pass' }, this.dict, this.moveOptions());
        return {
          ...state,
          game,
          lastPlay: { by, kind: 'pass', cells: [], words: [], total: 0 },
          sheet: row({ by, kind: 'pass', word: null, words: [], score: 0 }),
        };
      }
      case 'resign':
        return {
          ...state,
          resigned: entry.by,
          sheet: row({ by: entry.by, kind: 'resign', word: null, words: [], score: 0 }),
        };
      case 'timeout':
        return {
          ...state,
          timedOut: entry.by,
          sheet: row({ by: entry.by, kind: 'timeout', word: null, words: [], score: 0 }),
        };
    }
  }

  /** Adopt a server snapshot (multiplayer): the state is the server's public
   * tier + the real own rack; sheet/lastPlay come from the recorded move log
   * — remote verdicts are never recomputed client-side (DESIGN §3.3). */
  private adoptSync(entry: Extract<LexEntry, { kind: 'sync' }>): SessionState {
    const game = deserializeState(entry.state);
    let totals = game.scores.map(() => 0);
    const sheet: SheetRow[] = entry.rows.map((row) => {
      totals = totals.map((t, seat) => (seat === row.by ? t + row.score : t));
      return {
        n: row.n,
        by: row.by,
        kind: row.kind,
        word: row.word,
        words: row.words.map((w) => ({ ...w, cells: [] })),
        score: row.score,
        ...(row.count !== undefined ? { count: row.count } : {}),
        totals,
      };
    });
    const lastMove = [...entry.rows]
      .reverse()
      .find((r) => r.kind === 'play' || r.kind === 'phoney' || r.kind === 'exchange' || r.kind === 'pass');
    const lastPlay: LastPlay | undefined = lastMove
      ? {
          by: lastMove.by,
          kind: lastMove.kind as 'play' | 'phoney' | 'exchange' | 'pass',
          cells: lastMove.cells,
          words: lastMove.words.map((w) => ({ ...w, cells: [] })),
          total: lastMove.score,
          ...(lastMove.count !== undefined ? { count: lastMove.count } : {}),
        }
      : undefined;
    const ended = entry.ended;
    return {
      game,
      myRack: entry.myRack.split('') as TileFace[],
      sheet,
      ...(lastPlay ? { lastPlay } : {}),
      ...(ended?.endedBy === 'resign' && ended.winner !== 'draw'
        ? { resigned: ended.winner === 0 ? 1 : 0 }
        : {}),
      ...(ended?.endedBy === 'timeout' && ended.winner !== 'draw'
        ? { timedOut: ended.winner === 0 ? 1 : 0 }
        : {}),
    };
  }

  private fallbackState: SessionState | null = null;

  private sessionState(): SessionState {
    if (this.session.state) return this.session.state;
    // Stable fallback until init()/reset() lands — a fresh object per call
    // would read as "the game changed" and wipe pending placements.
    this.fallbackState ??= { game: this.initialGame(this.defaultOptions), sheet: [] };
    return this.fallbackState;
  }

  private currentOptions(): HotSeatOptions {
    return this.session.options ?? this.defaultOptions;
  }

  /** The seat whose rack this client shows/acts on. */
  private actingSeat(): Seat {
    return this.perspective ?? this.sessionState().game.toMove;
  }

  /** Game over — no staging, no moves for anyone. */
  private ended(): boolean {
    const s = this.sessionState();
    return this.computeEnd(s, result(s.game)) !== undefined;
  }

  /** May the local player COMMIT a move right now (their turn, game not over)?
   * Distinct from staging, which is allowed off-turn for planning (see
   * placeAt/selectRackSlot). */
  private interactive(): boolean {
    if (this.ended()) return false;
    return this.perspective === undefined || this.sessionState().game.toMove === this.perspective;
  }

  /** Lazily resync rack slots + pending after the engine state moved. */
  private syncRack(): void {
    const s = this.sessionState();
    const seat = this.actingSeat();
    if (this.syncedGame === s.game && this.syncedSeat === seat) return;
    const ruleset = this.rulesetFor(this.currentOptions());
    // A new game state recalls the whole plan: any tiles staged off-turn (or a
    // half-built play) return to the rack, so a play the opponent may have just
    // invalidated (their tile landed on your staged cell) never carries over.
    this.pending.clear();
    this.selection = null;
    this.exchangeSelection = null;
    // The pre-init fallback state has a phantom rack (canonical bag order) —
    // preserving ITS slot arrangement would scramble the first real rack.
    const prevWasPhantom = this.syncedGame !== null && this.syncedGame === this.fallbackState?.game;
    // Multiplayer: display the REAL rack-doc faces; in-flight refill draws
    // show as "drawing…" placeholders (Snapshot.drawing), not fake tiles.
    this.rackSlots = reconcileSlots(
      prevWasPhantom ? [] : this.rackSlots,
      s.myRack ?? s.game.racks[seat] ?? [],
      ruleset.rackSize,
    );
    this.syncedGame = s.game;
    this.syncedSeat = seat;
  }

  private drawingCount(): number {
    const s = this.sessionState();
    if (!s.myRack || this.perspective === undefined) return 0;
    const engineLen = s.game.racks[this.perspective]?.length ?? 0;
    return Math.max(0, engineLen - s.myRack.length);
  }

  // ── store plumbing ─────────────────────────────────────────────────────────

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getSnapshot = (): Snapshot => {
    if (!this.snapshot) this.snapshot = this.buildSnapshot();
    return this.snapshot;
  };

  private emit(): void {
    this.snapshot = null;
    for (const cb of this.listeners) cb();
  }

  private buildSnapshot(): Snapshot {
    this.syncRack();
    const s = this.sessionState();
    const options = this.currentOptions();
    const ruleset = this.rulesetFor(options);
    const res = result(s.game);
    const end = this.computeEnd(s, res);
    const preview = this.buildPreview(s.game, ruleset, end !== undefined);
    return {
      options,
      ruleset,
      state: s.game,
      log: this.session.log,
      result: res,
      ...(end ? { end } : {}),
      toMove: s.game.toMove,
      scores: s.game.scores,
      bagCount: s.game.bag.length,
      rackCounts: s.game.racks.map((r) => r.length),
      rack: this.rackSlots,
      pending: new Map(this.pending),
      preview,
      drawing: this.drawingCount(),
      selection: this.selection,
      exchange: this.exchangeSelection ? new Set(this.exchangeSelection) : null,
      interactive: this.interactive(),
      canExchange:
        this.interactive() && this.pending.size === 0 && s.game.bag.length >= ruleset.exchangeMinBag,
      ...(s.lastPlay ? { lastPlay: s.lastPlay } : {}),
      sheet: s.sheet,
      view: this.view,
      ...(end && !this.beatDone && (end.by === 'played-out' || end.by === 'scoreless' || end.by === 'last-standing')
        ? { beat: { cells: s.lastPlay?.cells ?? [] } }
        : {}),
      overlayOpen: !!end && (this.beatDone || end.by === 'resign' || end.by === 'timeout') && !this.overlayDismissed,
      ...(this.notice ? { notice: this.notice } : {}),
      ...(this.phoney ? { phoney: this.phoney } : {}),
    };
  }

  private computeEnd(s: SessionState, res: GameResult): GameEnd | undefined {
    if (s.resigned !== undefined) {
      return { by: 'resign', winner: s.resigned === 0 ? 1 : 0, finalScores: s.game.scores };
    }
    if (s.timedOut !== undefined) {
      return { by: 'timeout', winner: s.timedOut === 0 ? 1 : 0, finalScores: s.game.scores };
    }
    if (res.status === 'finished') {
      // Line items = engine finals minus the recorded pre-adjustment totals
      // (arithmetic over verdicts already computed — no rules re-derived).
      const before = s.sheet[s.sheet.length - 1]?.totals ?? res.finalScores.map(() => 0);
      // The 2-seat form of the engine's standings: the top placing is a draw
      // when more than one seat shares it (T7.13/T7.16 render the full rail).
      const top = res.standings[0]!;
      return {
        by: res.by,
        winner: top.length > 1 ? 'draw' : top[0]!,
        finalScores: res.finalScores,
        adjustments: res.finalScores.map((score, seat) => score - (before[seat] ?? 0)),
      };
    }
    return undefined;
  }

  private buildPreview(game: GameState, ruleset: Ruleset, ended: boolean): Preview | null {
    if (this.pending.size === 0) return null;
    const placements = [...this.pending.entries()].map(([key, p]) => {
      const comma = key.indexOf(',');
      return {
        cell: { row: Number(key.slice(0, comma)), col: Number(key.slice(comma + 1)) },
        letter: p.letter ?? 'A', // placeholder — needsBlank blocks Play anyway
        isBlank: p.isBlank,
      };
    });
    const needsBlank = [...this.pending.entries()].find(([, p]) => p.letter === null)?.[0] ?? null;
    // The acting seat, not game.toMove: off-turn (multiplayer) the mover is the
    // opponent, but the staged tiles — and the rack to check them against — are
    // mine. On-turn actingSeat === game.toMove, so behavior is unchanged.
    const rack = game.racks[this.actingSeat()] ?? [];
    // The whole point of 'costs-turn': stage 3 of the pipeline is NOT run for
    // the preview, so nothing downstream can leak a verdict the player is
    // supposed to be guessing at. Geometry and scoring are still shown — you
    // always knew where the tiles go and what they'd be worth.
    const withheld = this.invalidWordsCostTurn();
    const check = checkPlay(game.board, rack, placements, ruleset);
    if (!check.ok) {
      return {
        check,
        words: [],
        total: 0,
        bingo: false,
        needsBlank,
        playable: false,
      };
    }
    const score = scorePlay(game.board, placements, ruleset);
    const words: PreviewWord[] = score.words.map((w) => ({
      word: w.word,
      score: w.score,
      valid: withheld ? null : this.dict.has(w.word),
      cells: w.cells,
    }));
    const playable =
      !ended &&
      !needsBlank &&
      this.interactive() &&
      words.length > 0 &&
      // Withheld ⇒ Play is live for any legal geometry; that is what makes the
      // commit a gamble rather than a confirmation.
      (withheld || words.every((w) => w.valid === true));
    return {
      check,
      words,
      total: score.total,
      bingo: score.bingo,
      needsBlank,
      playable,
    };
  }

  // ── tap-tap selection (DESIGN §7.2) ────────────────────────────────────────

  /** Arm (or toggle off) a rack slot for tap-tap placement. Allowed off-turn:
   * you can lay out a planned play while the opponent thinks (Play stays
   * disabled until it's your turn). */
  selectRackSlot(index: number): void {
    if (this.ended()) return;
    this.syncRack();
    if (!this.rackSlots[index]) return;
    this.selection = this.selection === index ? null : index;
    this.emit();
  }

  cancelSelection(): void {
    if (this.selection === null) return;
    this.selection = null;
    this.emit();
  }

  /** A tap landed on a board cell: bounce a staged tile home, or place the
   * armed rack tile. */
  tapCell(cell: Cell): void {
    this.syncRack();
    if (this.pending.has(cellKey(cell))) {
      this.returnPending(cell);
      return;
    }
    if (this.selection !== null) {
      const index = this.selection;
      this.selection = null;
      this.placeAt(cell, index);
      this.emit();
    }
  }

  // ── pending placements (the lex drag/tap model, DESIGN §7.2) ───────────────

  placeAt(cell: Cell, rackIndex: number): void {
    // Off-turn staging is allowed (plan your next move); the play can't be
    // COMMITTED until it's your turn (preview.playable gates on interactive),
    // and a fresh game state recalls the whole plan (syncRack).
    if (this.ended()) return;
    this.syncRack();
    const key = cellKey(cell);
    const s = this.sessionState();
    if (s.game.board.has(key) || this.pending.has(key)) return;
    const ruleset = this.rulesetFor(this.currentOptions());
    if (cell.row < 0 || cell.col < 0 || cell.row >= ruleset.board.rows || cell.col >= ruleset.board.cols) return;
    const face = this.rackSlots[rackIndex];
    if (!face) return;
    this.rackSlots[rackIndex] = null;
    this.pending.set(key, {
      face,
      letter: face === '?' ? null : face,
      isBlank: face === '?',
      fromIndex: rackIndex,
    });
    this.emit();
  }

  /** Move an already-staged tile to another empty cell. */
  movePending(from: Cell, to: Cell): void {
    this.syncRack();
    const fromKey = cellKey(from);
    const toKey = cellKey(to);
    const tile = this.pending.get(fromKey);
    if (!tile) return;
    const s = this.sessionState();
    if (fromKey !== toKey && (s.game.board.has(toKey) || this.pending.has(toKey))) return;
    this.pending.delete(fromKey);
    this.pending.set(toKey, tile);
    this.emit();
  }

  returnPending(cell: Cell): void {
    this.syncRack();
    const key = cellKey(cell);
    const tile = this.pending.get(key);
    if (!tile) return;
    this.pending.delete(key);
    this.returnToRack(tile);
    this.emit();
  }

  recallAll(): void {
    this.syncRack();
    if (this.pending.size === 0) return;
    for (const tile of this.pending.values()) this.returnToRack(tile);
    this.pending.clear();
    this.emit();
  }

  private returnToRack(tile: PendingTile): void {
    if (this.rackSlots[tile.fromIndex] === null) {
      this.rackSlots[tile.fromIndex] = tile.face;
      return;
    }
    const free = this.rackSlots.indexOf(null);
    if (free >= 0) this.rackSlots[free] = tile.face;
    else this.rackSlots.push(tile.face); // shouldn't happen; never drop a tile
  }

  setBlankLetter(cell: Cell, letter: Letter): void {
    const tile = this.pending.get(cellKey(cell));
    if (!tile || !tile.isBlank) return;
    this.pending.set(cellKey(cell), { ...tile, letter: letter.toUpperCase() });
    this.emit();
  }

  // ── rack order ─────────────────────────────────────────────────────────────

  reorderRack(from: number, to: number): void {
    this.syncRack();
    if (from === to || from < 0 || to < 0 || from >= this.rackSlots.length || to >= this.rackSlots.length) return;
    const [moved] = this.rackSlots.splice(from, 1);
    this.rackSlots.splice(to, 0, moved ?? null);
    this.emit();
  }

  shuffleRack(): void {
    this.syncRack();
    const faces = this.rackSlots.filter((f): f is TileFace => f !== null);
    const order = shuffled(faces, this.rng);
    this.rackSlots = this.rackSlots.map((_, i) => order[i] ?? null);
    this.emit();
  }

  // ── moves & meta actions ───────────────────────────────────────────────────

  submitPlay(): void {
    this.syncRack();
    const snap = this.getSnapshot();
    if (!snap.preview?.playable) return;
    const placements = [...this.pending.entries()].map(([key, p]) => {
      const comma = key.indexOf(',');
      return {
        cell: { row: Number(key.slice(0, comma)), col: Number(key.slice(comma + 1)) },
        letter: p.letter as Letter,
        isBlank: p.isBlank,
      };
    });
    // The verdict the preview withheld is due NOW. Raised here — the one place
    // that is a deliberate commit by this player — rather than in applyEntry,
    // so resuming a stored game or adopting a server snapshot never
    // re-announces a turn lost long ago.
    if (this.invalidWordsCostTurn()) {
      const bad = snap.preview.words.filter((w) => !this.dict.has(w.word)).map((w) => w.word);
      if (bad.length > 0) this.phoney = { id: ++this.noticeSeq, words: bad };
    }
    this.pending.clear();
    this.session.submit({ kind: 'play', placements }, 'rollback');
  }

  /** The mover read the bad news: drop the beat and let the game move on
   * (in hot-seat, the pass-device interstitial is waiting behind it). */
  dismissPhoney(): void {
    if (!this.phoney) return;
    this.phoney = undefined;
    this.emit();
  }

  pass(): void {
    if (!this.interactive()) return;
    this.recallAll();
    this.session.submit({ kind: 'pass' }, 'rollback');
  }

  // ── exchange multi-select mode (T3.6) ──────────────────────────────────────

  beginExchange(): void {
    this.recallAll();
    if (!this.getSnapshot().canExchange) return;
    this.exchangeSelection = new Set();
    this.selection = null;
    this.emit();
  }

  toggleExchange(index: number): void {
    if (!this.exchangeSelection) return;
    this.syncRack();
    if (!this.rackSlots[index]) return;
    if (this.exchangeSelection.has(index)) this.exchangeSelection.delete(index);
    else this.exchangeSelection.add(index);
    this.emit();
  }

  cancelExchange(): void {
    if (!this.exchangeSelection) return;
    this.exchangeSelection = null;
    this.emit();
  }

  confirmExchange(): void {
    const selected = this.exchangeSelection;
    if (!selected || selected.size === 0) return;
    this.exchangeSelection = null;
    this.exchangeTiles([...selected]);
    this.emit();
  }

  exchangeTiles(rackIndices: readonly number[]): void {
    this.syncRack();
    const snap = this.getSnapshot();
    if (!snap.canExchange || rackIndices.length === 0) return;
    const tiles = rackIndices
      .map((i) => this.rackSlots[i])
      .filter((f): f is TileFace => f !== null);
    if (tiles.length !== rackIndices.length) return;
    // Edge randomness: the engine's deterministic append is re-shuffled here
    // and the result pinned in the entry so replay is exact (DESIGN §3.3).
    const s = this.sessionState();
    const after = applyMove(s.game, { type: 'exchange', tiles }, this.dict, this.moveOptions());
    const bagAfter = shuffled(after.bag, this.rng);
    this.session.submit({ kind: 'exchange', tiles, bagAfter }, 'rollback');
  }

  resign(by?: Seat): void {
    if (this.getSnapshot().end) return;
    const seat = by ?? this.actingSeat();
    this.recallAll();
    this.session.submit({ kind: 'resign', by: seat }, 'resync');
  }

  // ── view & end-of-game presentation ────────────────────────────────────────

  setView(view: ViewState | null): void {
    this.view = view;
    this.emit();
  }

  /** The ~1s beat elapsed (or was tap-skipped): show the overlay (T3.10). */
  finishBeat(): void {
    this.beatDone = true;
    this.emit();
  }

  /** "View board": hide the overlay, keep the persistent banner. */
  dismissOverlay(): void {
    this.overlayDismissed = true;
    this.emit();
  }

  reopenOverlay(): void {
    this.overlayDismissed = false;
    this.emit();
  }
}
