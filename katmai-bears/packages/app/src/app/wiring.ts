import { onFishCatch } from '../clips/manager';
import { onEvent } from '../detection/eventBus';
import { notifyBearAlert, notifyBearapalooza } from '../notifications/notify';
import { useUi } from '../state/ui';
import { getStream } from '../streams';
import { uid } from '../util/id';

// The one place detection events fan out to the app's reactive surfaces: the alert
// feed, the Bearapalooza banner, notifications, and clip recording. Installed once.
export function installEventHandlers(): () => void {
  return onEvent((e) => {
    const ui = useUi.getState();
    const title = getStream(e.streamId)?.title ?? e.streamId;
    switch (e.type) {
      case 'fish-catch':
        void onFishCatch(e);
        ui.pushAlert({ id: uid(), ts: e.ts, kind: 'catch', streamId: e.streamId, message: `🎣 Catch on ${title}` });
        break;
      case 'bear-alert':
        ui.pushAlert({
          id: uid(),
          ts: e.ts,
          kind: 'alert',
          streamId: e.streamId,
          message: `${e.count} bears on ${title} (over ${e.threshold})`,
        });
        void notifyBearAlert(e.streamId, title, e.count, e.threshold);
        break;
      case 'bearapalooza':
        ui.setBearapalooza({ streamId: e.streamId, ts: e.ts, count: e.count });
        ui.pushAlert({
          id: uid(),
          ts: e.ts,
          kind: 'bearapalooza',
          streamId: e.streamId,
          message: `🐻 BEARAPALOOZA on ${title}! ${e.count} bears!`,
        });
        void notifyBearapalooza(e.streamId, title, e.count);
        break;
      case 'bear-alert-cleared':
        break;
    }
  });
}
