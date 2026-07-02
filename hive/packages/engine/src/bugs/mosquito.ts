// Mosquito (T2.3): copies the movement of adjacent pieces for this move — the
// union of their generators applied at the mosquito's cell. Adjacent
// mosquito-only ⇒ stuck; on top of the hive ⇒ beetle-only until it climbs down.
// (Copying a pillbug's toss is handled in engine.ts, where tosses live.)
// The registry is passed in rather than imported — bugs/index.ts imports this
// module, and a circular import would leave the binding undefined at init.
import { cellKey, neighbors } from '../hex';
import type { BugKind, Hex } from '../index';
import { type Board, heightAt, topTile } from '../state';
import type { DestinationGenerator } from './index';
import { beetleDestinations } from './beetle';

export function mosquitoDestinations(
  board: Board,
  from: Hex,
  registry: Partial<Record<BugKind, DestinationGenerator>>,
): Hex[] {
  if (heightAt(board, from) >= 2) return beetleDestinations(board, from);

  const kinds = new Set<BugKind>();
  for (const n of neighbors(from)) {
    const top = topTile(board, n);
    if (top && top.kind !== 'M') kinds.add(top.kind);
  }

  const out = new Map<string, Hex>();
  for (const kind of kinds) {
    const generate = registry[kind];
    if (!generate) continue;
    for (const d of generate(board, from)) out.set(cellKey(d), d);
  }
  return [...out.values()];
}
