import type { DetectionFrame } from './contract';

declare global {
  interface Window {
    /** Debug surface validators/e2e read — lets a test push a synthetic detection frame. */
    __katmai?: {
      ingest: (frame: DetectionFrame) => void;
    };
  }
}

export {};
