import { useCallback, useEffect, useState } from 'react';

/**
 * Native Fullscreen API helper. The app's fullscreen view is a CSS-fixed overlay
 * regardless (so it works on iOS where element fullscreen is restricted); native FS
 * is a progressive enhancement layered on top.
 */
export function useFullscreen() {
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const handler = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const enter = useCallback((el: Element) => {
    if (el.requestFullscreen) el.requestFullscreen().catch(() => undefined);
  }, []);

  const exit = useCallback(() => {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  return { isFs, enter, exit };
}
