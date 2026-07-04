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
  PlayCheck,
  Ruleset,
  Seat,
  TileFace,
  WordScore,
} from '@lex/engine';
import { RULESETS, applyMove, cellKey, checkPlay, initialState, result, scorePlay } from '@lex/engine';
import { LogSession, type GameTransport } from '@parlor/core';
import type { ViewState } from '../board/BoardViewport';
import type { HotSeatOptions, LexEntry } from './entries';

export interface PendingTile {
  face: TileFace; // what left the rack ('A'… or '?')
  letter: Letter | null; // designated letter; null = blank awaiting the picker
  isBlank: boolean;
  fromIndex: number; // rack slot it came from (returns go home)
}

export interface PreviewWord {
  word: string;
  score: number;
  valid: boolean;
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
  | { by: 'played-out' | 'scoreless'; winner: Seat | 'draw'; finalScores: readonly number[] }
  | { by: 'resign' | 'timeout'; winner: Seat; finalScores: readonly number[] };

export interface LastPlay {
  by: Seat;
  kind: 'play' | 'exchange' | 'pass';
  cells: readonly CellKey[];
  words: readonly WordScore[];
  total: number;
  /** Exchange: how many tiles went back. */
  count?: number;
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
  /** Rack slot armed by the tap-tap flow (T3.5); null = none. */
  selection: number | null;
  /** Exchange multi-select mode (T3.6): selected rack slots; null = off. */
  exchange: ReadonlySet<number> | null;
  /** May the local player act right now (their turn, game not over)? */
  interactive: boolean;
  canExchange: boolean;
  lastPlay?: LastPlay;
  view: ViewState | null;
  overlayOpen: boolean;
  notice?: { id: number; text: string };
}

interface SessionState {
  game: GameState;
  resigned?: Seat;
  timedOut?: Seat;
  lastPlay?: LastPlay;
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
 * where tiles survived (multiset reconcile; new draws fill free slots). */
function reconcileSlots(
  prev: ReadonlyArray<TileFace | null>,
  rack: readonly TileFace[],
  rackSize: number,
): Array<TileFace | null> {
  const remaining = new Map<TileFace, number>();
  for (const face of rack) remaining.set(face, (remaining.get(face) ?? 0) + 1);
  const slots: Array<TileFace | null> = Array.from({ length: rackSize }, (_, i) => {
    const face = prev[i] ?? null;
    if (face && (remaining.get(face) ?? 0) > 0) {
      remaining.set(face, remaining.get(face)! - 1);
      return face;
    }
    return null;
  });
  const leftover: TileFace[] = [];
  for (const [face, count] of remaining) for (let i = 0; i < count; i++) leftover.push(face);
  for (let i = 0; i < slots.length && leftover.length > 0; i++) {
    if (slots[i] === null) slots[i] = leftover.shift()!;
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
        init: (options) => ({ game: this.initialGame(options) }),
        apply: (state, entry) => this.applyEntry(state, entry),
      },
      {
        onRejected: () => {
          // The rolled-back state has the pre-submit object identity — force
          // the lazy rack sync to rebuild slots from the engine rack.
          this.syncedGame = null;
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

  private applyEntry(state: SessionState, entry: LexEntry): SessionState {
    const ruleset = this.rulesetFor(this.session.options ?? this.defaultOptions);
    const by = state.game.toMove;
    switch (entry.kind) {
      case 'play': {
        const score = scorePlay(state.game.board, entry.placements, ruleset);
        const game = applyMove(state.game, { type: 'play', placements: entry.placements }, this.dict);
        return {
          ...state,
          game,
          lastPlay: {
            by,
            kind: 'play',
            cells: entry.placements.map((p) => cellKey(p.cell)),
            words: score.words,
            total: score.total,
          },
        };
      }
      case 'exchange': {
        const game = applyMove(state.game, { type: 'exchange', tiles: entry.tiles }, this.dict);
        // The engine appended the returned tiles deterministically; the entry
        // pins the edge-shuffled remainder (same multiset, new order).
        const sameBag =
          game.bag.length === entry.bagAfter.length &&
          [...game.bag].sort().join('') === [...entry.bagAfter].sort().join('');
        if (!sameBag) throw new Error('exchange entry bagAfter is not a permutation of the bag');
        return {
          ...state,
          game: { ...game, bag: entry.bagAfter },
          lastPlay: { by, kind: 'exchange', cells: [], words: [], total: 0, count: entry.tiles.length },
        };
      }
      case 'pass': {
        const game = applyMove(state.game, { type: 'pass' }, this.dict);
        return { ...state, game, lastPlay: { by, kind: 'pass', cells: [], words: [], total: 0 } };
      }
      case 'resign':
        return { ...state, resigned: entry.by };
      case 'timeout':
        return { ...state, timedOut: entry.by };
    }
  }

  private fallbackState: SessionState | null = null;

  private sessionState(): SessionState {
    if (this.session.state) return this.session.state;
    // Stable fallback until init()/reset() lands — a fresh object per call
    // would read as "the game changed" and wipe pending placements.
    this.fallbackState ??= { game: this.initialGame(this.defaultOptions) };
    return this.fallbackState;
  }

  private currentOptions(): HotSeatOptions {
    return this.session.options ?? this.defaultOptions;
  }

  /** The seat whose rack this client shows/acts on. */
  private actingSeat(): Seat {
    return this.perspective ?? this.sessionState().game.toMove;
  }

  private interactive(): boolean {
    const s = this.sessionState();
    if (this.computeEnd(s, result(s.game))) return false;
    return this.perspective === undefined || s.game.toMove === this.perspective;
  }

  /** Lazily resync rack slots + pending after the engine state moved. */
  private syncRack(): void {
    const s = this.sessionState();
    const seat = this.actingSeat();
    if (this.syncedGame === s.game && this.syncedSeat === seat) return;
    const ruleset = this.rulesetFor(this.currentOptions());
    this.pending.clear();
    this.selection = null;
    this.exchangeSelection = null;
    this.rackSlots = reconcileSlots(this.rackSlots, s.game.racks[seat] ?? [], ruleset.rackSize);
    this.syncedGame = s.game;
    this.syncedSeat = seat;
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
      selection: this.selection,
      exchange: this.exchangeSelection ? new Set(this.exchangeSelection) : null,
      interactive: this.interactive(),
      canExchange:
        this.interactive() && this.pending.size === 0 && s.game.bag.length >= ruleset.exchangeMinBag,
      ...(s.lastPlay ? { lastPlay: s.lastPlay } : {}),
      view: this.view,
      overlayOpen: !!end && (this.beatDone || end.by === 'resign' || end.by === 'timeout') && !this.overlayDismissed,
      ...(this.notice ? { notice: this.notice } : {}),
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
      return { by: res.by, winner: res.winner, finalScores: res.finalScores };
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
    const rack = game.racks[game.toMove] ?? [];
    const check = checkPlay(game.board, rack, placements, ruleset);
    if (!check.ok) {
      return { check, words: [], total: 0, bingo: false, needsBlank, playable: false };
    }
    const score = scorePlay(game.board, placements, ruleset);
    const words: PreviewWord[] = score.words.map((w) => ({
      word: w.word,
      score: w.score,
      valid: this.dict.has(w.word),
      cells: w.cells,
    }));
    const playable =
      !ended && !needsBlank && this.interactive() && words.every((w) => w.valid) && words.length > 0;
    return { check, words, total: score.total, bingo: score.bingo, needsBlank, playable };
  }

  // ── tap-tap selection (DESIGN §7.2) ────────────────────────────────────────

  /** Arm (or toggle off) a rack slot for tap-tap placement. */
  selectRackSlot(index: number): void {
    if (!this.interactive()) return;
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
    if (!this.interactive()) return;
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
    this.pending.clear();
    this.session.submit({ kind: 'play', placements }, 'rollback');
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
    const after = applyMove(s.game, { type: 'exchange', tiles }, this.dict);
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
