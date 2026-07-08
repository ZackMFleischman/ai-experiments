import { useEffect, useState } from 'react';
import { useUi } from '../state/ui';

// Transient toast column for alerts and catches. Auto-fades after 8s; tap to dismiss.
export function Alerts() {
  const alerts = useUi((s) => s.alerts);
  const dismiss = useUi((s) => s.dismissAlert);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const visible = alerts.filter((a) => now - a.ts < 8000).slice(0, 4);
  if (visible.length === 0) return null;

  return (
    <div className="toasts">
      {visible.map((a) => (
        <button key={a.id} className={`toast toast--${a.kind}`} onClick={() => dismiss(a.id)}>
          {a.message}
        </button>
      ))}
    </div>
  );
}
