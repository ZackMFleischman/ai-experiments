import type { DetectionEvent } from '../contract';
import { useDetection } from '../state/detection';
import { getStream } from '../streams';
import { uid } from '../util/id';
import { canRecord, recordCatchClip } from './recorder';
import { useClips } from './store';

// Turns a fish-catch event into a saved clip. Single-flight: while one ~6s recording
// is in progress, further catches are dropped rather than stacking recorders (which
// would fight over the canvas and swamp storage).
let recording = false;

export async function onFishCatch(e: Extract<DetectionEvent, { type: 'fish-catch' }>): Promise<void> {
  if (recording || !canRecord()) return;
  recording = true;
  try {
    const stream = getStream(e.streamId);
    const status = useDetection.getState().state.byStream[e.streamId];
    const title = stream?.title ?? e.streamId;
    const clip = await recordCatchClip({
      streamTitle: title,
      bearCount: status?.bearCount ?? 0,
      boxes: status?.boxes ?? [],
    });
    await useClips.getState().add({
      id: uid(),
      streamId: e.streamId,
      streamTitle: title,
      ts: e.ts,
      mime: clip.mime,
      durationMs: clip.durationMs,
      thumbnail: clip.thumbnail,
      blob: clip.blob,
    });
  } catch {
    // Recording can fail on unsupported browsers — non-fatal.
  } finally {
    recording = false;
  }
}
