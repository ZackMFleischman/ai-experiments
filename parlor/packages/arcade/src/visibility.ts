// Pause-on-background: a hidden tab stops simulating immediately (battery,
// and no off-screen deaths). Deliberately one-way — coming back never
// auto-resumes; un-pausing is the player's act, so they re-enter the game
// on their own terms. The document is a structural twin so tests inject a
// fake and the package stays DOM-free.

export interface VisibilityDoc {
  readonly hidden: boolean;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface Pausable {
  pause(): void;
}

/** Pause the target whenever the document goes hidden. Returns unsubscribe. */
export function pauseWhenHidden(
  target: Pausable,
  doc: VisibilityDoc,
): () => void {
  const onChange = (): void => {
    if (doc.hidden) target.pause();
  };
  doc.addEventListener('visibilitychange', onChange);
  return () => doc.removeEventListener('visibilitychange', onChange);
}
