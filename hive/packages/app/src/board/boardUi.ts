// Snapshot → BoardUi mapping (T3.5): what the renderer highlights is derived
// exclusively from controller state.
import type { Snapshot } from '../controller/GameController';
import type { BoardUi } from './BoardView';

export function snapshotToBoardUi(snap: Snapshot): BoardUi {
  const selectedCell = snap.selection?.kind === 'board' ? snap.selection.cell : undefined;
  return {
    ...(selectedCell ? { selectedCell } : {}),
    movableCells: snap.movableCells,
    targets: snap.targets,
    climbTargets: snap.climbTargets,
    ...(snap.drag?.allowed && snap.drag.over ? { hoverTarget: snap.drag.over } : {}),
    dimOthers: !!snap.selection,
    ...(snap.lastMove ? { lastMove: snap.lastMove } : {}),
    ...(snap.drag && selectedCell ? { hideTopOf: selectedCell } : {}),
    ...(snap.beat ? { pulseCells: snap.beat.pulseCells } : {}),
  };
}
