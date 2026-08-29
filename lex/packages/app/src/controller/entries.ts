// Log entry + options types (DESIGN §2.4, §3.3). Entries carry the typed
// JSON Move; exchange entries additionally pin the post-exchange bag order
// (`bagAfter`) — randomness happens at the edge (controller/transport),
// never in the engine, and replay from the log is exact.
//
// Multiplayer (T4.6) cannot replay the opponent's log — draws and exchange
// letters are hidden information — so the transport feeds the session `sync`
// entries instead: adoptions of the server's public snapshot plus the own-rack
// doc, with the sheet/lastPlay source rows carried from the move log. The
// client's OWN moves still apply optimistically through the engine.
import type { CellKey, InvalidWordRule, Placement, Seat, TileFace } from '@lex/engine';

export interface GameOptions {
  rulesetId: string;
  dictionaryId: string;
  /** What invalid words do (DESIGN §2.3). Optional so a game stored before the
   * setting existed still parses; absent ⇒ 'blocked'. */
  invalidWords?: InvalidWordRule;
  /** Pre-shuffled full bag order — shuffled at the edge on game creation.
   * Multiplayer uses a canonical placeholder order: the first sync entry
   * replaces the state before it is ever shown. */
  bagOrder: readonly TileFace[];
  seats: number;
}

/** Back-compat alias (M3 name). */
export type HotSeatOptions = GameOptions;

/** One move-log row as the server recorded it — the sheet/lastPlay source
 * in multiplayer (the client never recomputes remote verdicts). */
export interface SyncRow {
  n: number;
  by: Seat;
  /** 'phoney' = a play the dictionary refused in a 'costs-turn' game: the turn
   * was spent and nothing was placed, so the row has no cells — but it does
   * carry the words that were tried (§3.3), scored 0. */
  kind: 'play' | 'phoney' | 'exchange' | 'pass' | 'resign' | 'timeout';
  word: string | null;
  words: ReadonlyArray<{ word: string; score: number }>;
  score: number;
  count?: number;
  /** Placement cells of a play (last-play highlight + animation). */
  cells: readonly CellKey[];
}

export type LexEntry =
  | { kind: 'play'; placements: readonly Placement[] }
  | { kind: 'exchange'; tiles: readonly TileFace[]; bagAfter: readonly TileFace[] }
  | { kind: 'pass' }
  | { kind: 'resign'; by: Seat }
  | { kind: 'timeout'; by: Seat }
  | {
      kind: 'sync';
      /** Serialized synthesized FULL state: real public tier + real own rack;
       * the opponent rack and bag are '?' placeholders of the right lengths
       * (blank faces score 0, so nothing engine-visible can misread them). */
      state: string;
      /** The real own-rack faces (rack doc). */
      myRack: string;
      rows: readonly SyncRow[];
      /** Present once the server marked the game finished. */
      ended?: { endedBy: 'played-out' | 'scoreless' | 'last-standing' | 'resign' | 'timeout'; winner: Seat | 'draw' };
    };
