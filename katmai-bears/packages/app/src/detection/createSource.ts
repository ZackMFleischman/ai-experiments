import type { DetectionSource } from '../contract';
import { useSettings } from '../state/settings';
import { createSimulatorSource } from './simulatorSource';
import { createWebSocketSource } from './webSocketSource';

/**
 * Build the detection source the current settings ask for. Default is the live
 * simulator; a configured backend URL swaps in the WebSocket feed. This one function
 * is the whole "frontend-now, backend-later" switch.
 */
export function createActiveSource(): DetectionSource {
  const { sourceKind, backendUrl } = useSettings.getState();
  if (sourceKind === 'websocket' && backendUrl) {
    return createWebSocketSource(backendUrl);
  }
  return createSimulatorSource();
}
