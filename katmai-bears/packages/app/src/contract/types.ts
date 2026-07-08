// The detection contract. Framework-free (no React, no DOM) so it can be lifted
// verbatim into a shared package the day a backend detector exists. This JSON *is*
// the wire format a future `wss://…/events` backend will emit.

/** A detected object, coordinates normalized to the frame (0..1). */
export interface DetectionBox {
  x: number;
  y: number;
  w: number;
  h: number;
  label: 'bear' | 'salmon';
  score: number;
}

/** Emitted on the frame a bear is seen landing a salmon. */
export interface FishCatch {
  id: string;
  confidence: number;
}

/** One detection reading for one stream at one instant — the unit every source emits. */
export interface DetectionFrame {
  streamId: string;
  ts: number;
  bearCount: number;
  boxes?: DetectionBox[];
  fishCatch?: FishCatch;
}

/**
 * The load-bearing seam. Downstream code depends only on this interface, so the
 * live simulator swaps for a backend WebSocket feed with no other change.
 */
export interface DetectionSource {
  readonly kind: 'simulator' | 'websocket' | 'frontend-cv';
  start(): void;
  stop(): void;
  subscribe(cb: (frame: DetectionFrame) => void): () => void;
}

/** Rolling status the reducer derives for a single stream. */
export interface StreamStatus {
  streamId: string;
  bearCount: number;
  boxes: DetectionBox[];
  alerting: boolean;
  bearapalooza: boolean;
  lastUpdate: number;
}

/** The full derived detection state across every stream. */
export interface DetectionState {
  byStream: Record<string, StreamStatus>;
  total: number;
  peakTotal: number;
}

/** Domain events the reducer fires on threshold crossings and catches. */
export type DetectionEvent =
  | { type: 'fish-catch'; streamId: string; ts: number; catch: FishCatch }
  | { type: 'bear-alert'; streamId: string; ts: number; count: number; threshold: number }
  | { type: 'bear-alert-cleared'; streamId: string; ts: number; count: number }
  | { type: 'bearapalooza'; streamId: string; ts: number; count: number };
