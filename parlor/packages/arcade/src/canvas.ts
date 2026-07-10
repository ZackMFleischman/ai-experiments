// Canvas sizing math, kept pure and DOM-free: the game simulates in a fixed
// world space and the canvas letterboxes into whatever rectangle the layout
// gives it. Structural canvas twin so tests need no DOM.

export interface Viewport {
  /** Offsets and size of the world rectangle inside the container, in the
   * container's units. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Container units per world unit. */
  scale: number;
}

/** Largest world rectangle that fits the container, centered. */
export function letterbox(
  containerWidth: number,
  containerHeight: number,
  worldWidth: number,
  worldHeight: number,
): Viewport {
  const scale = Math.min(
    containerWidth / worldWidth,
    containerHeight / worldHeight,
  );
  const width = worldWidth * scale;
  const height = worldHeight * scale;
  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
    scale,
  };
}

export interface CanvasLike {
  width: number;
  height: number;
  style: { width: string; height: string };
}

/** Size a canvas's backing store for the device pixel ratio while its CSS
 * box stays at layout size — crisp on retina, no layout feedback. Returns
 * the backing-store size so the render pass can scale its context. */
export function fitCanvas(
  canvas: CanvasLike,
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
): { pixelWidth: number; pixelHeight: number } {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  return { pixelWidth, pixelHeight };
}
