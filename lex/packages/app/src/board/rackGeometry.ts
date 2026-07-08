// Shared rack-slot geometry for the two drag paths (RackTray internal reorder,
// GameBoard drag-layer drop-into-rack). Both need to map a client x-coordinate
// to a slot pitch/index, and both used to divide the slots-row width by
// rackSize. That holds on a phone, where the row is about as wide as the tiles;
// it breaks on a wide (desktop) window, where the row is `flex: 1` and
// `justifyContent: center` so it stretches far past the tiles (each capped at
// 52px and centered). The oversized pitch meant a drag had to travel well
// beyond a neighbor before it counted as passing it. Measure a real slot's
// cell width instead — that is the true pitch source, and unlike a slot's
// `left` it is unaffected by the translateX we apply to slots mid-drag.

/** Gap between adjacent rack slots — must match RackTray's row `gap`. */
export const RACK_SLOT_GAP_PX = 4;

/**
 * Client-space geometry of the rack slots, robust to a wide window.
 * `row` is the `[data-rack-row]` flex container; its rect is stable (never
 * transformed), and the tiles are centered within it. Returns the left edge of
 * slot 0 and the center-to-center pitch, or null when layout is unavailable
 * (jsdom reports 0×0 rects), so callers keep their existing fallback math.
 */
export function rackSlotGeometry(
  row: Element | null | undefined,
  rackSize: number,
): { left: number; pitch: number } | null {
  const rowRect = row?.getBoundingClientRect();
  const slot = row?.querySelector('[data-rack-slot]')?.getBoundingClientRect();
  if (!rowRect?.width || !slot?.width) return null;
  const pitch = slot.width + RACK_SLOT_GAP_PX;
  const span = rackSize * pitch - RACK_SLOT_GAP_PX; // total width the tiles occupy
  const left = rowRect.left + (rowRect.width - span) / 2; // centered in the row
  return { left, pitch };
}
