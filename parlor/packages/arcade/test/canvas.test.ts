import { describe, expect, it } from 'vitest';
import { fitCanvas, letterbox, type CanvasLike } from '../src/index.js';

describe('letterbox', () => {
  it('pillarboxes a tall world in a wide container', () => {
    const vp = letterbox(1000, 500, 100, 100);
    expect(vp).toEqual({ left: 250, top: 0, width: 500, height: 500, scale: 5 });
  });

  it('letterboxes a wide world in a tall container', () => {
    const vp = letterbox(300, 900, 200, 100);
    expect(vp).toEqual({ left: 0, top: 375, width: 300, height: 150, scale: 1.5 });
  });

  it('fills exactly on a matching aspect ratio', () => {
    const vp = letterbox(400, 300, 4, 3);
    expect(vp).toEqual({ left: 0, top: 0, width: 400, height: 300, scale: 100 });
  });
});

describe('fitCanvas', () => {
  function makeCanvas(): CanvasLike {
    return { width: 0, height: 0, style: { width: '', height: '' } };
  }

  it('scales the backing store by the device pixel ratio', () => {
    const canvas = makeCanvas();
    const size = fitCanvas(canvas, 390, 500, 3);
    expect(size).toEqual({ pixelWidth: 1170, pixelHeight: 1500 });
    expect(canvas.width).toBe(1170);
    expect(canvas.height).toBe(1500);
    expect(canvas.style).toEqual({ width: '390px', height: '500px' });
  });

  it('rounds fractional stores and never collapses to zero', () => {
    const canvas = makeCanvas();
    fitCanvas(canvas, 100.4, 0, 1.5);
    expect(canvas.width).toBe(151);
    expect(canvas.height).toBe(1);
  });

  it('treats a bogus DPR as 1', () => {
    const canvas = makeCanvas();
    fitCanvas(canvas, 200, 100, 0);
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(100);
  });
});
