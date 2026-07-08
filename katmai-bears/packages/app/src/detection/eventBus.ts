import type { DetectionEvent } from '../contract';

// A tiny module-level pub/sub for domain events. Kept out of the React store so
// firing an event never triggers a re-render on its own — handlers (notifications,
// clip recorder, alert feed) opt in explicitly.
type Listener = (e: DetectionEvent) => void;

const listeners = new Set<Listener>();

export function emitEvent(e: DetectionEvent): void {
  for (const l of listeners) l(e);
}

export function onEvent(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
