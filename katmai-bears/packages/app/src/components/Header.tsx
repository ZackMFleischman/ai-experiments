import { requestNotificationPermission } from '../notifications/notify';
import { useDetection } from '../state/detection';
import { useSettings } from '../state/settings';
import { useUi } from '../state/ui';

export function Header() {
  const total = useDetection((s) => s.state.total);
  const peak = useDetection((s) => s.state.peakTotal);
  const setPanel = useUi((s) => s.setPanel);
  const notificationsEnabled = useSettings((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useSettings((s) => s.setNotificationsEnabled);

  const toggleNotifications = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      return;
    }
    const perm = await requestNotificationPermission();
    setNotificationsEnabled(perm === 'granted');
  };

  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__logo">🐻</span>
        <div>
          <h1 className="header__title">Katmai Bearcams</h1>
          <p className="header__sub">Brooks Falls live · simulated bear counts</p>
        </div>
      </div>

      <div className="header__stats">
        <div className="stat">
          <span className="stat__num">{total}</span>
          <span className="stat__label">on screen</span>
        </div>
        <div className="stat stat--muted">
          <span className="stat__num">{peak}</span>
          <span className="stat__label">peak</span>
        </div>
      </div>

      <div className="header__actions">
        <button
          className={`iconbtn${notificationsEnabled ? ' iconbtn--on' : ''}`}
          aria-label={notificationsEnabled ? 'Notifications on' : 'Enable notifications'}
          title={notificationsEnabled ? 'Notifications on' : 'Enable notifications'}
          onClick={() => void toggleNotifications()}
        >
          {notificationsEnabled ? '🔔' : '🔕'}
        </button>
        <button className="iconbtn" aria-label="Clips & Daily Reel" title="Clips & Daily Reel" onClick={() => setPanel('clips')}>
          🎞️
        </button>
        <button className="iconbtn" aria-label="Settings" title="Settings" onClick={() => setPanel('settings')}>
          ⚙️
        </button>
      </div>
    </header>
  );
}
