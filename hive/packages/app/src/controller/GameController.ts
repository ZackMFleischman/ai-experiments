// GameController (T3.4): owns the client-side session — authoritative state
// from the transport, derived UI state (selection, targets, drag machine per
// DESIGN §6.2), optimistic apply + rollback. Plain class; React subscribes via
// useSyncExternalStore. The UI never computes rules: everything highlightable
// comes out of legalMoves().
import type {
  BugKind,
  CellKey,
  Color,
  GameOptions,
  GameResult,
  GameState,
  Hex,
  Move,
  TileId,
} from '@hive/engine';
import { applyMove, initialState, legalMoves, parseUhp, pixelToHex, result, toUhp } from '@hive/engine';
import { HEX_SIZE, hexKey } from '../board/hexGeometry';
import type { ViewState } from '../board/BoardViewport';
import type { GameTransport, LogEntry } from './transport';

export type Selection =
  | { kind: 'board'; cell: CellKey; tile: TileId }
  | { kind: 'hand'; tile: TileId };

export interface DragState {
  x: number; // board-space coords (the view converts client px before calling)
  y: number;
  over?: CellKey; // cell under the pointer
  allowed: boolean; // over a legal target
}

export type GameEnd =
  | { by: 'surround'; winner?: Color }
  | { by: 'repetition' }
  | { by: 'resign'; winner: Color }
  | { by: 'timeout'; winner: Color }
  | { by: 'draw-agreed' };

export interface Snapshot {
  state: GameState;
  log: readonly LogEntry[];
  result: GameResult;
  end?: GameEnd;
  toMove: Color;
  selection?: Selection;
  targets: ReadonlySet<CellKey>;
  climbTargets: ReadonlySet<CellKey>;
  movableCells: ReadonlySet<CellKey>;
  placeableBugs: ReadonlySet<BugKind>;
  mustPlaceQueen: boolean;
  canPass: boolean;
  /** Selected piece can TOSS neighbours (pillbug / mosquito-as-pillbug): the
   * UI hints that tosses are made by moving the adjacent piece itself. */
  tossHint: boolean;
  lastMove?: { from?: Hex; to: Hex };
  drag?: DragState;
  view: ViewState | null;
  /** Set in multiplayer (T4.6): the seat this client plays. Hot-seat: unset. */
  myColor?: Color;
  pendingDrawOffer?: Color;
  /** End-of-game beat (T3.9): board moment before the overlay. */
  beat?: { center: Hex; pulseCells: ReadonlySet<CellKey> };
  /** "Confirm move" setting is on: moves stage as a preview and are only sent
   * once the player taps Confirm (the button is hidden entirely when off). */
  confirmMove: boolean;
  /** A move is staged (previewed) awaiting confirmation. */
  staged: boolean;
  overlayOpen: boolean;
  /** Transient error surfaced as a toast (T6.2); new id per occurrence. */
  notice?: { id: number; text: string };
  /** Persist state of the last submit: 'saving' while a move is in flight or
   * retrying, 'error' once retries are exhausted (a Retry is then offered).
   * Absent when the game is fully synced. */
  syncStatus?: 'saving' | 'error';
}

const tileKey = (t: TileId) => `${t.color}${t.kind}${t.ordinal}`;

// Firebase callable failures carry a `.code` like 'functions/unavailable'.
// We only retry failures we can positively identify as transient (dropped
// connection, backend hiccup); a real rejection — illegal move, not your turn,
// stale move count, auth — must surface, not loop forever.
const TRANSIENT_CODES = new Set([
  'unavailable',
  'deadline-exceeded',
  'internal',
  'resource-exhausted',
  'aborted',
  'cancelled',
  'unknown',
]);

function isTransient(err: unknown): boolean {
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string' && TRANSIENT_CODES.has(code.replace(/^functions\//, ''))) {
    return true;
  }
  const message = (err as { message?: unknown }).message;
  return (
    typeof message === 'string' &&
    /network|offline|failed to fetch|time(?:d? ?)out|unavailable|connection|econn/i.test(message)
  );
}

// Backoff before each retry of a rejected-as-transient submit; once exhausted
// the move stays on-screen and the UI offers an explicit Retry.
const DEFAULT_RETRY_DELAYS = [500, 1500, 4000, 10_000];

function moveCells(move: Move): { from?: Hex; to: Hex } | undefined {
  if (move.type === 'pass') return undefined;
  if (move.type === 'place') return { to: move.to };
  return { from: move.from, to: move.to };
}

export class GameController {
  /** True while a pointer that started on the hand tray is down (T3.6/T3.7). */
  handDragActive = false;

  private state: GameState;
  private log: LogEntry[] = [];
  private listeners = new Set<() => void>();
  private snapshot: Snapshot | null = null;

  private selection: Selection | undefined;
  private drag: DragState | undefined;
  private view: ViewState | null = null;
  private pendingDrawOffer: Color | undefined;
  private lastMove: { from?: Hex; to: Hex } | undefined;
  private resigned: Color | undefined;
  private timedOut: Color | undefined;
  private drawAgreed = false;
  private beatDone = false;
  private overlayDismissed = false;
  private noticeSeq = 0;
  private notice: { id: number; text: string } | undefined;

  // "Confirm move" staging (opt-in setting): a move applied only to a local
  // preview until the player confirms it. `preStage` is the position to restore
  // on cancel or to submit from on confirm.
  private confirmMove = false;
  private stagedMove: Move | undefined;
  private preStage: { state: GameState; lastMove?: { from?: Hex; to: Hex } } | undefined;

  private remoteUnsub: (() => void) | undefined;

  // Robust submission: the optimistic move stays applied while we persist it
  // with retry/backoff. `pending` is the in-flight submit (undefined once
  // saved or rolled back); `syncStatus` drives the "Saving…/Not saved" UI.
  private pending: { entry: LogEntry; expectedIndex: number; onReject: () => void } | undefined;
  private syncStatus: 'idle' | 'saving' | 'error' = 'idle';
  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly retryDelays: number[];

  constructor(
    private readonly transport: GameTransport,
    private readonly options: GameOptions,
    /** Multiplayer (T4.6): the seat this client plays; hot-seat leaves it unset. */
    private readonly perspective?: Color,
    /** Test seam: override the retry backoff schedule (ms before each retry). */
    retry?: { delays?: number[] },
  ) {
    this.state = initialState(options);
    this.retryDelays = retry?.delays ?? DEFAULT_RETRY_DELAYS;
  }

  /** Restore from the transport's stored log and start listening for remote
   * entries (refresh resume T3.11; live sync T4.6). */
  async init(): Promise<void> {
    await this.reload();
    this.remoteUnsub ??= this.transport.onRemoteEntry((entry, index) => {
      this.applyRemote(entry, index);
    });
  }

  dispose(): void {
    this.remoteUnsub?.();
    this.remoteUnsub = undefined;
    this.clearRetry();
  }

  /** Rebuild from the transport's source of truth. Safety net for silently
   * dead realtime streams (mobile Safari): called on visibility regain and
   * when a push for this game reaches an open client. */
  async resync(): Promise<void> {
    await this.reload();
  }

  /** Rebuild everything from the transport's stored log (also the resync path
   * after a rejected submit or a gap in the remote stream). */
  private async reload(): Promise<void> {
    const stored = await this.transport.load();
    if (!stored) return;
    // The source of truth supersedes any in-flight optimistic submit.
    this.clearPending();
    let s = initialState(stored.options);
    this.stagedMove = undefined;
    this.preStage = undefined;
    this.pendingDrawOffer = undefined;
    this.resigned = undefined;
    this.timedOut = undefined;
    this.drawAgreed = false;
    this.lastMove = undefined;
    for (const entry of stored.log) {
      if (entry.kind === 'move' || entry.kind === 'pass') {
        const move = parseUhp(entry.uhp, s);
        s = applyMove(s, move);
        this.lastMove = moveCells(move);
        this.pendingDrawOffer = undefined;
      } else if (entry.kind === 'resign') this.resigned = entry.by;
      else if (entry.kind === 'timeout') this.timedOut = entry.by;
      else if (entry.kind === 'draw-offer') this.pendingDrawOffer = entry.by;
      else if (entry.kind === 'draw-accept') this.drawAgreed = true;
      else if (entry.kind === 'draw-decline') this.pendingDrawOffer = undefined;
    }
    this.state = s;
    this.log = [...stored.log];
    this.emit();
  }

  /** An entry arrived from elsewhere (opponent, other device). Echoes of
   * already-applied local entries are ignored; a gap means we missed
   * something and resync wholesale. */
  private applyRemote(entry: LogEntry, index: number): void {
    if (index < this.log.length) return;
    if (index > this.log.length) {
      void this.reload();
      return;
    }
    if (entry.kind === 'move' || entry.kind === 'pass') {
      const move = parseUhp(entry.uhp, this.state);
      this.state = applyMove(this.state, move);
      this.lastMove = moveCells(move);
      this.pendingDrawOffer = undefined;
    } else if (entry.kind === 'resign') this.resigned = entry.by;
    else if (entry.kind === 'timeout') this.timedOut = entry.by;
    else if (entry.kind === 'draw-offer') this.pendingDrawOffer = entry.by;
    else if (entry.kind === 'draw-accept') this.drawAgreed = true;
    else if (entry.kind === 'draw-decline') this.pendingDrawOffer = undefined;
    this.log = [...this.log, entry];
    this.emit();
  }

  /** True when the local player may act on the position (always, in hot-seat). */
  private interactive(): boolean {
    return !this.perspective || this.state.toMove === this.perspective;
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
    const res = result(this.state);
    // A staged move is only a local preview — the game is NOT over until it is
    // confirmed and submitted. Deriving `end` from the preview would fire the
    // beat + result overlay and hide the Confirm bar, stranding a game-ending
    // move that was never sent to the backend. End-of-game shows only on
    // committed state.
    const end = this.stagedMove ? undefined : this.computeEnd(res);
    // While a move is staged the board shows a preview and offers no further
    // affordances — only Confirm/Cancel act.
    const moves = end || !this.interactive() || this.stagedMove ? [] : legalMoves(this.state);

    const movable = new Set<CellKey>();
    for (const m of moves) {
      if (m.type === 'move' || m.type === 'toss') movable.add(hexKey(m.from));
    }
    // A pillbug can be pinned (one-hive) yet still able to toss — it must
    // stay selectable and lifted, or its power reads as broken. Selecting it
    // raises the toss hint (targets appear on the tossed neighbour instead).
    for (const m of moves) {
      if (m.type !== 'toss') continue;
      for (const [key, stack] of this.state.board) {
        const top = stack[stack.length - 1];
        if (top && tileKey(top) === tileKey(m.by)) movable.add(key);
      }
    }
    const placeable = new Set<BugKind>();
    for (const m of moves) {
      if (m.type === 'place') placeable.add(m.tile.kind);
    }

    const forSelection = this.selection ? this.movesFor(this.selection, moves) : [];
    const targets = new Set<CellKey>();
    const climbTargets = new Set<CellKey>();
    for (const m of forSelection) {
      if (m.type === 'pass') continue;
      const key = hexKey(m.to);
      if (this.state.board.has(key)) climbTargets.add(key);
      else targets.add(key);
    }

    return {
      state: this.state,
      log: this.log,
      result: res,
      ...(end ? { end } : {}),
      toMove: this.state.toMove,
      ...(this.selection ? { selection: this.selection } : {}),
      targets,
      climbTargets,
      movableCells: movable,
      placeableBugs: placeable,
      mustPlaceQueen:
        this.state.turn >= 4 && this.state.hands[this.state.toMove].Q > 0 && placeable.has('Q'),
      canPass: moves.some((m) => m.type === 'pass'),
      tossHint:
        this.selection?.kind === 'board' &&
        moves.some(
          (m) =>
            m.type === 'toss' &&
            tileKey(m.by) === tileKey((this.selection as { tile: TileId }).tile),
        ),
      ...(this.lastMove ? { lastMove: this.lastMove } : {}),
      ...(this.drag ? { drag: this.drag } : {}),
      view: this.view,
      ...(this.perspective ? { myColor: this.perspective } : {}),
      ...(this.pendingDrawOffer ? { pendingDrawOffer: this.pendingDrawOffer } : {}),
      ...(end && !this.beatDone && end.by === 'surround' ? { beat: this.buildBeat() } : {}),
      confirmMove: this.confirmMove,
      staged: !!this.stagedMove,
      overlayOpen: !!end && (this.beatDone || end.by !== 'surround') && !this.overlayDismissed,
      ...(this.notice ? { notice: this.notice } : {}),
      ...(this.syncStatus !== 'idle' ? { syncStatus: this.syncStatus } : {}),
    };
  }

  private computeEnd(res: GameResult): GameEnd | undefined {
    if (this.resigned) return { by: 'resign', winner: this.resigned === 'w' ? 'b' : 'w' };
    if (this.timedOut) return { by: 'timeout', winner: this.timedOut === 'w' ? 'b' : 'w' };
    if (this.drawAgreed) return { by: 'draw-agreed' };
    if (res.status === 'won') return { by: 'surround', winner: res.winner };
    if (res.status === 'draw') return res.by === 'surround' ? { by: 'surround' } : { by: 'repetition' };
    return undefined;
  }

  private buildBeat(): { center: Hex; pulseCells: ReadonlySet<CellKey> } {
    // Center on a surrounded queen and pulse its six neighbours (T3.9).
    for (const [key, stack] of this.state.board) {
      if (!stack.some((t) => t.kind === 'Q')) continue;
      const [q, r] = key.split(',').map(Number) as [number, number];
      const around = [
        [1, 0], [-1, 0], [1, -1], [0, -1], [0, 1], [-1, 1],
      ].map(([dq, dr]) => `${q + (dq as number)},${r + (dr as number)}`);
      if (around.every((k) => this.state.board.has(k))) {
        return { center: { q, r }, pulseCells: new Set(around) };
      }
    }
    return { center: { q: 0, r: 0 }, pulseCells: new Set() };
  }

  private movesFor(selection: Selection, moves: Move[]): Move[] {
    return moves.filter((m) => {
      if (m.type === 'pass') return false;
      if (selection.kind === 'hand') return m.type === 'place' && m.tile.kind === selection.tile.kind;
      return (
        (m.type === 'move' || m.type === 'toss') &&
        tileKey(m.tile) === tileKey(selection.tile) &&
        hexKey(m.from) === selection.cell
      );
    });
  }

  // ── selection & the drag/tap state machine (§6.2) ──────────────────────────

  /** Tap or pick up a board piece. Enemy pieces are selectable when tossable. */
  selectCell(cell: Hex): void {
    if (this.getSnapshot().end || this.stagedMove) return;
    const key = hexKey(cell);
    const snapshot = this.getSnapshot();
    if (snapshot.targets.has(key) || snapshot.climbTargets.has(key)) {
      this.commitTo(cell);
      return;
    }
    const stack = this.state.board.get(key);
    const top = stack?.[stack.length - 1];
    if (top && snapshot.movableCells.has(key)) {
      this.selection = { kind: 'board', cell: key, tile: top };
    } else {
      this.selection = undefined; // tap elsewhere cancels
    }
    this.drag = undefined;
    this.emit();
  }

  /** Tap or pick up a bug from the hand tray. */
  selectHandBug(kind: BugKind): void {
    if (this.stagedMove) return;
    const snapshot = this.getSnapshot();
    if (snapshot.end || !snapshot.placeableBugs.has(kind)) return;
    const moves = legalMoves(this.state);
    const place = moves.find((m) => m.type === 'place' && m.tile.kind === kind);
    if (place?.type !== 'place') return;
    this.selection = { kind: 'hand', tile: place.tile };
    this.drag = undefined;
    this.emit();
  }

  /** Pointer moved during a drag — coords already in board space. */
  dragTo(x: number, y: number): void {
    if (!this.selection || this.stagedMove) return;
    const cell = pixelToHex(x, y, HEX_SIZE);
    const key = hexKey(cell);
    const snapshot = this.getSnapshot();
    const allowed = snapshot.targets.has(key) || snapshot.climbTargets.has(key);
    this.drag = { x, y, over: key, allowed };
    this.emit();
  }

  /** Drop at board-space coords: commit on a target, spring back otherwise. */
  drop(x: number, y: number): void {
    if (!this.selection || this.stagedMove) return;
    const cell = pixelToHex(x, y, HEX_SIZE);
    const key = hexKey(cell);
    const snapshot = this.getSnapshot();
    if (snapshot.targets.has(key) || snapshot.climbTargets.has(key)) {
      this.commitTo(cell);
    } else {
      this.cancel();
    }
  }

  /** Esc, tap-outside, or failed drop. Discards a staged move if one is pending. */
  cancel(): void {
    if (this.stagedMove) {
      this.discardStaged();
      return;
    }
    this.selection = undefined;
    this.drag = undefined;
    this.emit();
  }

  private commitTo(cell: Hex): void {
    const selection = this.selection;
    if (!selection) return;
    const move = this.movesFor(selection, legalMoves(this.state)).find(
      (m) => m.type !== 'pass' && hexKey(m.to) === hexKey(cell),
    );
    if (!move) {
      this.cancel();
      return;
    }
    if (this.confirmMove) this.stageMove(move);
    else this.submitMove(move);
  }

  // ── "Confirm move" staging ─────────────────────────────────────────────────

  /** Toggle the confirm-move setting. Turning it off mid-stage sends the pending
   * move (off means moves commit immediately). */
  setConfirmMove(on: boolean): void {
    if (this.confirmMove === on) return;
    this.confirmMove = on;
    if (!on && this.stagedMove) {
      this.confirmStaged();
      return;
    }
    this.emit();
  }

  /** Apply a move to the local preview only, awaiting Confirm. */
  private stageMove(move: Move): void {
    this.preStage = { state: this.state, ...(this.lastMove ? { lastMove: this.lastMove } : {}) };
    this.stagedMove = move;
    this.state = applyMove(this.state, move); // preview; not yet sent
    this.lastMove = moveCells(move);
    this.selection = undefined;
    this.drag = undefined;
    this.emit();
  }

  /** Commit the staged move: restore the real position, then submit it for real
   * (optimistic apply + transport, with rollback on rejection). */
  confirmStaged(): void {
    const move = this.stagedMove;
    const pre = this.preStage;
    if (!move || !pre) return;
    this.state = pre.state;
    this.lastMove = pre.lastMove;
    this.stagedMove = undefined;
    this.preStage = undefined;
    this.submitMove(move);
  }

  /** Throw away the staged move and return to the pre-move position. */
  discardStaged(): void {
    if (!this.stagedMove || !this.preStage) return;
    this.state = this.preStage.state;
    this.lastMove = this.preStage.lastMove;
    this.stagedMove = undefined;
    this.preStage = undefined;
    this.selection = undefined;
    this.drag = undefined;
    this.emit();
  }

  // ── moves & meta actions ───────────────────────────────────────────────────

  pass(): void {
    if (!this.interactive() || this.stagedMove) return;
    const move = legalMoves(this.state).find((m) => m.type === 'pass');
    if (move) this.submitMove(move);
  }

  private submitMove(move: Move): void {
    const uhp = toUhp(move, this.state);
    const entry: LogEntry = { kind: move.type === 'pass' ? 'pass' : 'move', uhp };
    const previous = { state: this.state, log: this.log, lastMove: this.lastMove };
    // Optimistic apply (instant UX); persisted with retry, reconciled only on a
    // real (non-transient) rejection.
    this.state = applyMove(this.state, move);
    this.log = [...this.log, entry];
    this.lastMove = moveCells(move);
    this.selection = undefined;
    this.drag = undefined;
    this.view = null; // auto-fit after the hive grows/moves
    this.pendingDrawOffer = undefined; // any move clears a pending offer
    this.dispatch(entry, previous.log.length, () => {
      this.state = previous.state;
      this.log = previous.log;
      this.lastMove = previous.lastMove;
      this.notice = { id: ++this.noticeSeq, text: 'Move rejected by the server — undone.' };
    });
  }

  private submitMeta(entry: LogEntry): void {
    this.log = [...this.log, entry];
    // A refused meta action means we were out of sync — rebuild from source.
    this.dispatch(entry, this.log.length - 1, () => {
      this.notice = { id: ++this.noticeSeq, text: 'Action failed — resynced with the server.' };
      void this.reload();
    });
  }

  // ── robust submission ──────────────────────────────────────────────────────
  // The optimistic apply already happened; persist the entry, retrying dropped
  // connections with backoff so a game-ending move reliably reaches the backend.
  // A real rejection runs `onReject` (undo a move / resync a meta action); an
  // exhausted-retry failure keeps the move on-screen and offers a manual Retry.

  private dispatch(entry: LogEntry, expectedIndex: number, onReject: () => void): void {
    this.clearRetry();
    this.pending = { entry, expectedIndex, onReject };
    this.retryAttempt = 0;
    this.syncStatus = 'saving';
    this.emit();
    void this.attemptSend();
  }

  private async attemptSend(): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    try {
      await this.transport.submit(pending.entry, pending.expectedIndex);
    } catch (err) {
      if (this.pending !== pending) return; // superseded by a reload / new game
      if (isTransient(err)) {
        if (this.retryAttempt < this.retryDelays.length) {
          const wait = this.retryDelays[this.retryAttempt++] ?? 0;
          this.syncStatus = 'saving';
          this.emit();
          this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            void this.attemptSend();
          }, wait);
        } else {
          // Keep the optimistic move visible and hand the player an explicit
          // Retry rather than silently dropping it.
          this.syncStatus = 'error';
          this.notice = {
            id: ++this.noticeSeq,
            text: "Can't reach the server — your move isn't saved. Tap Retry.",
          };
          this.emit();
        }
        return;
      }
      // A definite rejection (illegal / not your turn / stale): undo or resync.
      this.pending = undefined;
      this.retryAttempt = 0;
      this.syncStatus = 'idle';
      pending.onReject();
      this.emit();
      return;
    }
    if (this.pending !== pending) return;
    this.pending = undefined;
    this.retryAttempt = 0;
    this.syncStatus = 'idle';
    this.emit();
  }

  /** Re-attempt a submit stuck in the 'error' state — the Retry button, or an
   * `online` / visibility regain. No-op unless a submit is actually stuck. */
  retryPending(): void {
    if (!this.pending || this.syncStatus !== 'error') return;
    this.retryAttempt = 0;
    this.syncStatus = 'saving';
    this.emit();
    void this.attemptSend();
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  private clearPending(): void {
    this.clearRetry();
    this.pending = undefined;
    this.retryAttempt = 0;
    this.syncStatus = 'idle';
  }

  resign(by: Color): void {
    if (this.getSnapshot().end) return;
    this.resigned = by;
    this.submitMeta({ kind: 'resign', by });
  }

  offerDraw(by: Color): void {
    if (this.getSnapshot().end || this.pendingDrawOffer) return;
    this.pendingDrawOffer = by;
    this.submitMeta({ kind: 'draw-offer', by });
  }

  respondDraw(by: Color, accept: boolean): void {
    if (!this.pendingDrawOffer || this.pendingDrawOffer === by) return;
    if (accept) this.drawAgreed = true;
    this.pendingDrawOffer = undefined;
    this.submitMeta({ kind: accept ? 'draw-accept' : 'draw-decline', by });
  }

  async newGame(options?: GameOptions): Promise<void> {
    const opts = options ?? this.options;
    await this.transport.reset(opts);
    this.clearPending();
    this.state = initialState(opts);
    this.log = [];
    this.selection = undefined;
    this.drag = undefined;
    this.stagedMove = undefined;
    this.preStage = undefined;
    this.view = null;
    this.pendingDrawOffer = undefined;
    this.resigned = undefined;
    this.timedOut = undefined;
    this.drawAgreed = false;
    this.beatDone = false;
    this.overlayDismissed = false;
    this.emit();
  }

  // ── view & end-of-game presentation ────────────────────────────────────────

  setView(view: ViewState | null): void {
    this.view = view;
    this.emit();
  }

  /** The ~1s beat elapsed (or was tap-skipped): show the overlay. */
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
