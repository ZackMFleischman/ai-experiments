import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

// jsdom has no PointerEvent — extend MouseEvent so coordinates survive.
if (typeof window !== 'undefined' && !window.PointerEvent) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    isPrimary: boolean;
    pointerType: string;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.isPrimary = params.isPrimary ?? false;
      this.pointerType = params.pointerType ?? 'mouse';
    }
  }
  // @ts-expect-error assigning polyfill
  window.PointerEvent = PointerEventPolyfill;
}

if (typeof Element !== 'undefined') {
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
}
