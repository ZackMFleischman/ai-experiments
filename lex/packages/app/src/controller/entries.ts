// Hot-seat log entry + options types (DESIGN §2.4, §3.3). Entries carry the
// typed JSON Move; exchange entries additionally pin the post-exchange bag
// order (`bagAfter`) — randomness happens at the edge (controller/transport),
// never in the engine, and replay from the log is exact.
// The multiplayer wire format (public log, exchange count only) is M4's.
import type { Placement, Seat, TileFace } from '@lex/engine';

export interface HotSeatOptions {
  rulesetId: string;
  dictionaryId: string;
  /** Pre-shuffled full bag order — shuffled at the edge on game creation. */
  bagOrder: readonly TileFace[];
  seats: number;
}

export type LexEntry =
  | { kind: 'play'; placements: readonly Placement[] }
  | { kind: 'exchange'; tiles: readonly TileFace[]; bagAfter: readonly TileFace[] }
  | { kind: 'pass' }
  | { kind: 'resign'; by: Seat }
  | { kind: 'timeout'; by: Seat };
