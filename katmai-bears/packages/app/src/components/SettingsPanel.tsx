import { useState } from 'react';
import { requestNotificationPermission } from '../notifications/notify';
import { effectiveYoutubeId, useSettings } from '../state/settings';
import { useUi } from '../state/ui';
import { STREAMS } from '../streams';

function ThresholdRow({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (n: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </label>
  );
}

function StreamIdRow({ streamId, title, seed }: { streamId: string; title: string; seed: string | undefined }) {
  const override = useSettings((s) => s.streamOverrides[streamId]);
  const setOverride = useSettings((s) => s.setOverride);
  const clearOverride = useSettings((s) => s.clearOverride);
  const [draft, setDraft] = useState(override ?? '');

  const effective = effectiveYoutubeId(streamId, seed);
  return (
    <div className="idrow">
      <div className="idrow__title">
        {title}
        <span className="muted"> · {effective ? `id: ${effective}` : 'no id'}</span>
      </div>
      <div className="idrow__controls">
        <input
          placeholder="YouTube video id"
          value={draft}
          onChange={(e) => setDraft(e.target.value.trim())}
        />
        <button className="btn btn--sm" onClick={() => draft && setOverride(streamId, draft)}>
          Save
        </button>
        {override ? (
          <button
            className="btn btn--sm btn--ghost"
            onClick={() => {
              clearOverride(streamId);
              setDraft('');
            }}
          >
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const setPanel = useUi((s) => s.setPanel);
  const thresholds = useSettings((s) => s.thresholds);
  const setThresholds = useSettings((s) => s.setThresholds);
  const notificationsEnabled = useSettings((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useSettings((s) => s.setNotificationsEnabled);
  const sourceKind = useSettings((s) => s.sourceKind);
  const backendUrl = useSettings((s) => s.backendUrl);
  const setSource = useSettings((s) => s.setSource);

  return (
    <aside className="drawer">
      <div className="drawer__head">
        <h2>Settings</h2>
        <button className="iconbtn" onClick={() => setPanel('none')} aria-label="Close">
          ✕
        </button>
      </div>

      <section className="drawer__section">
        <h3>Alert thresholds</h3>
        <ThresholdRow
          label="Alert when a feed has MORE than"
          value={thresholds.alert}
          min={1}
          onChange={(n) => setThresholds({ alert: n })}
        />
        <ThresholdRow
          label="Bearapalooza at (bears)"
          value={thresholds.bearapalooza}
          min={2}
          onChange={(n) => setThresholds({ bearapalooza: n })}
        />
      </section>

      <section className="drawer__section">
        <h3>Notifications</h3>
        <label className="field field--row">
          <input
            type="checkbox"
            checked={notificationsEnabled}
            onChange={async (e) => {
              if (e.target.checked) {
                const perm = await requestNotificationPermission();
                setNotificationsEnabled(perm === 'granted');
              } else {
                setNotificationsEnabled(false);
              }
            }}
          />
          <span>Alert me on threshold crossings & Bearapaloozas</span>
        </label>
        <p className="muted small">
          Delivered while the app is open or installed. True 24/7 background push needs the backend detector (see
          README).
        </p>
      </section>

      <section className="drawer__section">
        <h3>Stream IDs</h3>
        <p className="muted small">
          YouTube live ids rotate each season. Paste a fresh one to override the built-in seed — saved on this device.
        </p>
        {STREAMS.map((s) => (
          <StreamIdRow key={s.id} streamId={s.id} title={s.title} seed={s.defaultYoutubeId} />
        ))}
      </section>

      <section className="drawer__section">
        <h3>Detection source</h3>
        <label className="field field--row">
          <input
            type="radio"
            name="source"
            checked={sourceKind === 'simulator'}
            onChange={() => setSource('simulator')}
          />
          <span>Simulator (default) — plausible fake counts, no server</span>
        </label>
        <label className="field field--row">
          <input
            type="radio"
            name="source"
            checked={sourceKind === 'websocket'}
            onChange={() => setSource('websocket')}
          />
          <span>Backend WebSocket — the migration seam</span>
        </label>
        {sourceKind === 'websocket' ? (
          <label className="field">
            <span>Backend URL (wss://…)</span>
            <input
              placeholder="wss://your-detector/events"
              value={backendUrl}
              onChange={(e) => setSource('websocket', e.target.value.trim())}
            />
          </label>
        ) : null}
        <p className="muted small">Reload after switching sources.</p>
      </section>
    </aside>
  );
}
